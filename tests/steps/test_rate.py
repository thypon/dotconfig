from pytest_bdd import parsers, scenarios, then, when

scenarios("../features/bin/rate.feature")

CURL_SHIM = """
printf 'curl %s\\n' "$*" >> "$CURL_LOG"
cat "$CURL_BODY"
"""


@when(parsers.parse('rate runs with "{currency}"'))
def step_run(ctx, currency):
    body = f"1 {currency.upper()} = 43210.00 USD\n"
    body_file = ctx.env.state_dir / "curl-body.txt"
    body_file.write_text(body)
    ctx.body = body
    ctx.curl_log = ctx.env.state_dir / "curl.log"
    ctx.env.set_env(CURL_LOG=str(ctx.curl_log), CURL_BODY=str(body_file))
    ctx.env.shim("curl", CURL_SHIM)
    ctx.proc = ctx.env.run("rate", currency)


@then(parsers.parse("rate.sx/{path} is fetched and its body is printed"))
def step_fetched(ctx, path):
    log = ctx.curl_log.read_text()
    assert f"https://rate.sx/{path}" in log
    assert ctx.proc.stdout == ctx.body
