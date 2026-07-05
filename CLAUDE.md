# Working notes for this repo

## Sandbox network restrictions when verifying Cloudflare deploys

This session's sandbox blocks direct outbound HTTPS to Cloudflare-hosted
domains at the network policy level (`api.cloudflare.com`, `sparrow.cloudflare.com`,
and deployed `*.workers.dev` URLs all get a 403 policy denial from the egress
proxy — check via `curl -sS "$HTTPS_PROXY/__agentproxy/status"`). This is
separate from, and not fixed by, having valid Cloudflare credentials or an
authorized MCP connector — those unblock the *management* API (D1/R2/Workers
inspection) but not arbitrary fetches to a live Worker's own URL.

When a Worker is freshly deployed and needs a liveness check (e.g. hitting
`GET /` for a health check), don't burn time retrying `curl`/`wrangler` from
this sandbox — ask the user to check the URL from their own browser or
device instead. It works fine from outside the sandbox; this is purely a
sandbox egress restriction, not a real problem with the deploy.
