---
name: cgrok
description: Set up and use cgrok for Cloudflare-based secure tunneling to local development servers
user-invocable: true
argument-hint: "<setup|tunnel>"
---

# cgrok — Cloudflare Tunnel CLI

cgrok creates secure tunnels from the internet to your local development server using Cloudflare. It works like ngrok but uses your own Cloudflare account and domain.

## Installation

```bash
# npm (requires Node.js)
npm install -g @circlesac/cgrok

# Homebrew
brew install circlesac/tap/cgrok

# Direct download
curl -fsSL https://github.com/circlesac/cgrok/releases/latest/download/install.sh | sh
```

## Prerequisites

You need a Cloudflare account with:

1. An API token (create at https://dash.cloudflare.com/profile/api-tokens)
2. At least one zone (domain) configured in Cloudflare

The API token needs permissions for:

- Zone DNS Edit
- Account Cloudflare Tunnel Edit
- Zone Zone Read
- Account Account Settings Read

## Setup

Configure cgrok with your Cloudflare API token:

```bash
cgrok config add-authtoken <your-cloudflare-api-token>
```

This validates the token, lets you select an account and zone (if you have multiple), and saves the configuration to `~/.config/cgrok/cgrok.json`. The selected zone becomes the default domain for all tunnels.

## Creating Tunnels

### Basic usage (ephemeral subdomain)

```bash
# Tunnel to a local port
cgrok http 3000

# Tunnel to a specific address:port
cgrok http localhost:8080
```

This generates a random 12-character subdomain under the default zone you selected during setup (e.g., `a1b2c3d4e5f6.crcl.es`). To change the default zone, re-run `cgrok config add-authtoken`.

### Custom subdomain

```bash
# Use a specific subdomain (appended to default zone, e.g., myapp.crcl.es)
cgrok http 3000 --url myapp

# Use a full domain (must match one of your Cloudflare zones)
cgrok http 3000 --url myapp.example.com
```

### Force overwrite existing DNS

```bash
cgrok http 3000 --url myapp --force
```

### Debug mode

```bash
cgrok http 3000 --debug
```

## How It Works

When you run `cgrok http <port>`:

1. Loads config from `~/.config/cgrok/cgrok.json`
2. Resolves the domain (ephemeral random name or your `--url` value)
3. Checks for an existing Cloudflare tunnel with that name
4. Creates a new tunnel if none exists
5. Creates a CNAME DNS record pointing to the tunnel
6. Starts `cloudflared` locally to serve the tunnel
7. Displays an ngrok-style dashboard with connection status and log stream

On Ctrl+C, cgrok cleans up by removing the DNS record and deleting the tunnel.

## Requirements

- `cloudflared` must be installed and available in PATH
  - macOS: `brew install cloudflare/cloudflare/cloudflared`
  - Linux: see https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

## Troubleshooting

- **"Configuration file not found"**: Run `cgrok config add-authtoken <token>` first
- **"Domain already exists in DNS"**: Use `--force` to overwrite, or choose a different `--url`
- **"Could not get the tunnel secret"**: Delete the stale tunnel with `cloudflared tunnel delete <id>` and retry
- **cloudflared not found**: Install cloudflared (see Requirements above)
