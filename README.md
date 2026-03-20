# @circlesac/cgrok

An ngrok-compatible CLI that uses Cloudflare Tunnel for secure tunneling.

## Quick Start

```bash
# 1. Install cloudflared
brew install cloudflared

# 2. Add your Cloudflare API token
npx @circlesac/cgrok config add-authtoken <YOUR_API_TOKEN> --account <ACCOUNT_NAME>

# 3. Start a tunnel
npx @circlesac/cgrok http 8080
```

Create an API token at https://dash.cloudflare.com/profile/api-tokens with these permissions:

- Zone > DNS > Edit
- Account > Cloudflare Tunnel > Edit
- Zone > Zone > Read

## Usage

```bash
# Random subdomain
cgrok http 8080

# Custom subdomain
cgrok http 8080 --url myapp

# Custom domain (full)
cgrok http 8080 --url myapp.example.com

# ngrok-compatible --domain flag
cgrok http 8080 --domain myapp

# HTTPS local server
cgrok http https://localhost:8443

# Forward to another host
cgrok http servername.local:9000
```
