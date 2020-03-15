# When sublet file
# Created with sur-0.2

configure :power do |s|
  s.interval = 10
end

query_battery = []

query_battery << lambda do
  "#{File.read('/sys/class/power_supply/BAT0/capacity').strip}%"
end if File.exists? '/sys/class/power_supply/BAT0/capacity'

query_battery << lambda do
  "#{File.read('/sys/class/power_supply/BAT0/power_now').to_f / 1000000}W"
end if File.exists? '/sys/class/power_supply/BAT0/power_now'

query_battery << lambda do
  "#{File.read('/sys/class/power_supply/cw2015-battery/capacity').strip}%"
end if File.exists? '/sys/class/power_supply/cw2015-battery/capacity'

query_battery << lambda do
  power = (File.open('/sys/class/power_supply/cw2015-battery/current_now').read.to_f*File.open('/sys/class/power_supply/cw2015-battery/voltage_now').read.to_f/1000000000000).round(2)
  "#{power}W"
end if File.exists?('/sys/class/power_supply/cw2015-battery/current_now') && File.exists?('/sys/class/power_supply/cw2015-battery/voltage_now')

on :run do |s|
  data = []
  query_battery.each do |query|
    begin
      data << query.call
    rescue
      next
    end
  end
  s.data = data.join " "
end
