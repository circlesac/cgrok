# @circlesac/cgrok

A Cloudflare-based ngrok CLI compatible program that allows you to create secure tunnels to your local development environment.

## Prerequisites

- Cloudflare account with API token
- [`cloudflared`](https://github.com/cloudflare/cloudflared)

## Usage

### Use with `npx` (recommended)

```bash
npx @circlesac/cgrok
```

### Configure

```bash
npx @circlesac/cgrok config add-authtoken <YOUR_API_TOKEN>
```

### Examples

```bash
# Tunnel to localhost:8080 from an ephemeral domain
npx @circlesac/cgrok http 8080

# Tunnel to localhost:8080 from https://<subdomain>.<domain>
npx @circlesac/cgrok http 8080 --url <subdomain>

# Tunnel to localhost:8080 from https://<full_domain>
npx @circlesac/cgrok http 8080 --url <full_domain>
```
