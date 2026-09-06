# Cloudflare deployment

`cloudflare/src/index.js` is the standalone Cloudflare Worker deployment for HF Bucket Studio V2. It contains the password gate, signed cookie session, Hugging Face bucket API adapter, Range-aware media proxy, and the complete browser UI. It does not proxy to the Manus/WebDev origin.

## Required Worker secrets

Configure these as Cloudflare Worker secrets:

- `ACCESS_PASSWORD`: the password users enter at the gate.
- `ACCESS_COOKIE_SECRET`: a long random value used only to sign access cookies.
- `HF_ACCESS_TOKEN`: the Hugging Face token used server-side for bucket metadata and media.

## Versioned deployment

From this directory, deploy the committed Worker source with Wrangler:

```bash
wrangler secret put ACCESS_PASSWORD
wrangler secret put ACCESS_COOKIE_SECRET
wrangler secret put HF_ACCESS_TOKEN
wrangler deploy
```

The Worker is intentionally self-contained so future releases can be reviewed, committed, and deployed from this directory without relying on the WebDev preview or an origin reverse proxy.
