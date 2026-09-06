# HF Bucket Studio

HF Bucket Studio is a secure media workspace for Hugging Face Storage Buckets. It uses a server-side Hugging Face API proxy, password-only access, and a dark media-oriented interface designed for fast video discovery.

## Features

- Lists buckets available to the configured Hugging Face token.
- Shows bucket size, file count, privacy, and file tree metadata.
- Filters and searches files by media type and filename.
- Streams private files through an authenticated server route with HTTP Range support for responsive video playback and resumable downloads.
- Provides file download links without exposing the Hugging Face token to the browser.
- Allows permanent file deletion from the bucket after an explicit browser confirmation.
- Uses an HTTP-only signed access cookie created from the `ACCESS_PASSWORD` Cloudflare/hosting secret; there is no Manus OAuth login flow.
- Keeps Hugging Face credentials in the platform secret store; no `.env` file or secret is committed.

## Configuration

Set `HF_ACCESS_TOKEN` and `ACCESS_PASSWORD` as server-side secrets in the Cloudflare/runtime environment. Set `ACCESS_COOKIE_SECRET` to a separate random value when possible. The Hugging Face token should have only the permissions required for the target bucket. Because the initial test token was shared in chat, rotate it in Hugging Face after deployment and update the secret.

## Development

```bash
pnpm install
pnpm check
pnpm test
pnpm build
pnpm dev
```

The default workspace opens `155422li/manus`. Bucket selection is driven by the authenticated token's `/api/buckets/me` response.

## API design

Metadata calls use Hugging Face's documented bucket endpoints, including `/api/buckets/me`, `/api/buckets/{namespace}/{name}`, and `/api/buckets/{namespace}/{name}/tree`. Media requests are proxied through `/api/media?bucket=...&path=...`; the proxy forwards `Range` headers and selected response metadata while adding an attachment disposition for downloads.

## Deployment note

The application is packaged as a single Node web service and is compatible with an edge-facing Cloudflare deployment. `ACCESS_PASSWORD`, `ACCESS_COOKIE_SECRET`, and `HF_ACCESS_TOKEN` must be configured as production secrets rather than bundled into client assets.
