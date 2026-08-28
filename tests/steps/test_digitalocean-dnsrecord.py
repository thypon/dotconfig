import textwrap
from pathlib import Path

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/digitalocean-dnsrecord.feature")

TUGBOAT_RB = """
module Tugboat
  class Configuration
    def self.instance
      @instance ||= new
    end

    def access_token
      ENV['FAKE_TUGBOAT_TOKEN']
    end
  end
end
"""

DROPLETKIT_RB = """
module FakeApi
  def self.log(line)
    return unless ENV['DO_API_LOG']
    File.open(ENV['DO_API_LOG'], 'a') { |f| f.puts line }
  end
end

module DropletKit
  class IpV4
    attr_reader :ip_address

    def initialize(ip_address)
      @ip_address = ip_address
    end
  end

  class Networks
    attr_reader :v4

    def initialize(ip)
      @v4 = [IpV4.new(ip)]
    end
  end

  class Droplet
    attr_reader :name, :networks

    def initialize(name, ip)
      @name = name
      @networks = Networks.new(ip)
    end
  end

  class DropletsResource
    def all
      (ENV['FAKE_DROPLETS'] || '').split(',').reject(&:empty?).map do |pair|
        name, ip = pair.split('|', 2)
        Droplet.new(name, ip)
      end
    end
  end

  class DomainRecord
    attr_accessor :id, :type, :name, :data

    def initialize(attrs = {})
      attrs.each { |k, v| send("#{k}=", v) }
    end
  end

  class DomainRecordsResource
    def all(for_domain: nil)
      (ENV['FAKE_RECORDS'] || '').split(',').reject(&:empty?).map do |quad|
        id, type, name, data = quad.split('|', 4)
        DomainRecord.new(id: id, type: type, name: name, data: data)
      end
    end

    def delete(for_domain: nil, id: nil)
      FakeApi.log("delete #{id} #{for_domain}")
    end

    def create(record, for_domain: nil)
      FakeApi.log("create #{record.type} #{record.name} #{record.data} #{for_domain}")
    end
  end

  class Client
    attr_reader :droplets, :domain_records

    def initialize(access_token: nil)
      FakeApi.log("token #{access_token}")
      @droplets = DropletsResource.new
      @domain_records = DomainRecordsResource.new
    end
  end
end
"""


def _ensure_setup(ctx):
    if getattr(ctx, "do_ready", False):
        return
    lib = ctx.env.state_dir / "fake_lib"
    lib.mkdir(exist_ok=True)
    (lib / "tugboat.rb").write_text(textwrap.dedent(TUGBOAT_RB).strip() + "\n")
    (lib / "droplet_kit.rb").write_text(textwrap.dedent(DROPLETKIT_RB).strip() + "\n")
    ctx.env.shim("ruby", 'exec /usr/bin/ruby -I "%s" "$@"' % lib)
    ctx.env.set_env(DO_API_LOG=str(ctx.env.state_dir / "do-api.log"))
    ctx.do_droplets = []
    ctx.do_records = []
    ctx.do_token = None
    ctx.do_ready = True


def _log_lines(ctx):
    path = Path(ctx.env.state_dir / "do-api.log")
    if not path.exists():
        return []
    return [line.strip() for line in path.read_text().splitlines() if line.strip()]


@given(parsers.parse("droplet {name} has IP {ip}"))
def given_droplet(ctx, name, ip):
    _ensure_setup(ctx)
    ctx.do_droplets.append((name, ip))


@given(parsers.parse("domain {domain} has no A record for {name}"))
def given_no_record(ctx, domain, name):
    _ensure_setup(ctx)
    ctx.do_domain = domain


@given(parsers.parse("domain {domain} already has A record {name} -> {ip}"))
def given_existing_record(ctx, domain, name, ip):
    _ensure_setup(ctx)
    ctx.do_domain = domain
    ctx.do_records.append(("7", "A", name, ip))
    ctx.do_old_id = "7"


@given("tugboat configuration holds a token")
def given_token(ctx):
    _ensure_setup(ctx)
    ctx.do_token = "tok-123"


@when(parsers.parse('digitalocean-dnsrecord runs with "{name}" and "{domain}"'))
def step_run(ctx, name, domain):
    _ensure_setup(ctx)
    ctx.do_name = name
    ctx.do_domain = domain
    ctx.env.set_env(
        FAKE_DROPLETS=",".join("%s|%s" % pair for pair in ctx.do_droplets),
        FAKE_RECORDS=",".join("|".join(r) for r in ctx.do_records),
    )
    if ctx.do_token:
        ctx.env.set_env(FAKE_TUGBOAT_TOKEN=ctx.do_token)
    ctx.proc = ctx.env.run("digitalocean-dnsrecord", name, domain)


@then(parsers.parse("an A record {name} -> {ip} is created in {domain}"))
def then_created_in(ctx, name, ip, domain):
    lines = _log_lines(ctx)
    assert "create A %s %s %s" % (name, ip, domain) in lines
    assert not [l for l in lines if l.startswith("delete ")]


@then("the old A record is deleted")
def then_deleted(ctx):
    lines = _log_lines(ctx)
    assert "delete %s %s" % (ctx.do_old_id, ctx.do_domain) in lines


@then(parsers.parse("a new A record {name} -> {ip} is created"))
def then_new_created(ctx, name, ip):
    lines = _log_lines(ctx)
    assert "create A %s %s %s" % (name, ip, ctx.do_domain) in lines


@then("API calls authenticate with the tugboat token")
def then_token(ctx):
    lines = _log_lines(ctx)
    assert lines[0] == "token %s" % ctx.do_token
