# HF Bucket Studio

HF Bucket Studio is a secure media workspace for Hugging Face Storage Buckets. It uses the Manus WebDev full-stack template with a server-side Hugging Face API proxy, Manus authentication, and a dark media-oriented interface designed for fast video discovery.

## Features

- Lists buckets available to the configured Hugging Face token.
- Shows bucket size, file count, privacy, and file tree metadata.
- Filters and searches files by media type and filename.
- Streams private files through an authenticated server route with HTTP Range support for responsive video playback and resumable downloads.
- Provides file download links without exposing the Hugging Face token to the browser.
- Allows permanent file deletion from the bucket after an explicit browser confirmation.
- Keeps Hugging Face credentials in the platform secret store; no `.env` file or secret is committed.

## Configuration

Set `HF_ACCESS_TOKEN` as a server-side secret. The token should have only the Hugging Face permissions required for the target bucket. Because the initial test token was shared in chat, rotate it in Hugging Face after deployment and update the secret.

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

The application is packaged as a single Node web service and is compatible with an edge-facing Cloudflare deployment. The Hugging Face token must be configured as a production secret in the target runtime rather than bundled into client assets.
