import { spawn } from "child_process"
import { Cloudflare } from "cloudflare"
import { parse } from "tldts"

import { BaseCommand } from "@/utils/base"
import { CloudflareHelper, createConfigFile, generateTunnelSecret, getTunnelSecrets } from "@/utils/cloudflare"
import { Config } from "@/utils/config"
import { generateEphemeralName, parseLocalUrl, spinner } from "@/utils/helpers"
import { logger } from "@/utils/logger"
import { Table } from "@/utils/table"

class HttpCommand extends BaseCommand {
	private config!: Config
	private cf!: Cloudflare
	private cfh!: CloudflareHelper
	private tunnelSecrets!: ReturnType<typeof getTunnelSecrets>

	constructor() {
		super("http")
		this.description("Start HTTP tunnel")
		this.argument("<address:port|port>", "Local endpoint: port (e.g., 8080) or address:port (e.g., localhost:3000)")
		this.option("-u, --url <url>", "Custom tunnel URL (e.g., myapp.example.com)")
		this.option("-f, --force", "Force overwrite DNS record even if it exists")
		this.option("--debug", "Enable debug logging")
	}

	protected async execute(endpoint: string, options: { url?: string; force?: boolean; debug?: boolean }) {
		// init
		this.config = await Config.from().load()
		this.cf = new Cloudflare({ apiToken: this.config.auth_token })
		this.cfh = new CloudflareHelper(this.cf)
		this.tunnelSecrets = getTunnelSecrets()

		// options
		const domain = options.url ? await this.getFullDomain(options.url, options.force) : await this.getEphemeralDomain(options.force)
		const local_url = parseLocalUrl(endpoint)

		// tunnel
		let { tunnel_id, tunnel_secret } = await this.checkExistingTunnel(domain.name, options.debug)

		if (!tunnel_id) {
			const newTunnel = await this.createNewTunnel(domain.name)
			tunnel_id = newTunnel.tunnel_id
			tunnel_secret = newTunnel.tunnel_secret
		}
		if (!tunnel_id || !tunnel_secret) throw new Error(`Failed to create tunnel ${domain.name}`)

		// dns
		await this.createDNSRecord(domain, tunnel_id, options.force)

		// cloudflared
		const configPath = createConfigFile(domain.name, local_url, tunnel_id, tunnel_secret, this.config.account_id)
		await this.launchCloudflared(configPath, domain.name)

		// status
		console.info()
		console.info("🚀 Tunnel is active!")

		const table = new Table(2)
		table.push(["Public URL", `https://${domain.name}`], ["Local URL", local_url], ["cloudflared Logs", logger.cloudflared.path])
		await table.render()

		console.info("\nPress Ctrl+C to stop the tunnel\n")

		// ctrl+c
		let _signal = false
		const signalHandler = (signal: string) => {
			if (_signal) return
			_signal = true

			console.info(`\nReceived ${signal}, shutting down...`)
		}
		process.on("SIGINT", signalHandler)
		process.on("SIGTERM", signalHandler)

		// keep process alive
		process.stdin.resume()
	}

	private async checkExistingTunnel(domainName: string, debug?: boolean) {
		if (debug) {
			console.error("\n[DEBUG] Checking for existing tunnel:", domainName)
		}
		return await spinner(
			async () => {
				const tunnel = await this.cfh.tunnelByName(this.config.account_id, domainName)
				if (debug) {
					console.error("[DEBUG] Tunnel found:", tunnel ? `Yes (ID: ${tunnel.id})` : "No")
				}
				if (tunnel && tunnel.id) {
					// First, try to get the secret from local storage
					let tunnel_secret = await this.tunnelSecrets.getSecret(tunnel.id)
					if (tunnel_secret) {
						if (debug) {
							console.error("[DEBUG] Retrieved tunnel secret from local storage")
						}
						return { tunnel_id: tunnel.id, tunnel_secret }
					}

					// If not found locally, get the token from Cloudflare API
					const token = await this.cf.zeroTrust.tunnels.cloudflared.token.get(tunnel.id, { account_id: this.config.account_id })

					// Debug logging - use console.error to bypass spinner
					if (debug) {
						console.error("\n[DEBUG] Token response type:", typeof token)
						console.error("[DEBUG] Token response:", token)
					}

					// Decode the token to extract the tunnel secret
					// The token is a base64-encoded JSON containing: { "a": account, "s": secret, "t": tunnel_id }
					try {
						// Decode base64 JSON directly (not a JWT, just base64-encoded JSON)
						const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf-8"))

						if (debug) {
							console.error("[DEBUG] Decoded token payload:", JSON.stringify(decoded, null, 2))
						}

						// Extract the secret from the "s" field
						tunnel_secret = decoded.s as string

						if (debug) {
							console.error("[DEBUG] Extracted tunnel secret from token:", tunnel_secret ? tunnel_secret.substring(0, 20) + "..." : "undefined")
						}

						// Save the secret locally for future use
						if (tunnel_secret) {
							await this.tunnelSecrets.saveSecret(tunnel.id, tunnel_secret)
						}
					} catch (error) {
						if (debug) {
							console.error("[DEBUG] Failed to decode token:", error)
						}
					}

					// Validate that we got a valid secret (should be base64 string)
					if (tunnel_secret && typeof tunnel_secret === "string" && tunnel_secret.length > 0) {
						if (debug) {
							console.error("[DEBUG] Final tunnel secret length:", tunnel_secret.length)
							console.error("[DEBUG] Final tunnel secret (first 20 chars):", tunnel_secret.substring(0, 20))
						}
						return { tunnel_id: tunnel.id, tunnel_secret }
					} else {
						if (debug) {
							console.error("[DEBUG] Failed to extract valid tunnel secret")
						}
						const msgs = [
							`Could not get the tunnel secret for '${domainName}' (ID: ${tunnel.id})\n`,
							`The tunnel may have been created with a different configuration. You may need to delete the existing tunnel, run:`,
							`  cloudflared tunnel delete ${tunnel.id}`
						]
						throw new Error(msgs.join("\n"))
					}
				}
				if (debug) {
					console.error("[DEBUG] No existing tunnel found, will create new one")
				}
				return { tunnel_id: undefined, tunnel_secret: undefined }
			},
			{
				text: `Checking if tunnel '${domainName}' is available`
			}
		)
	}

	private async createNewTunnel(domainName: string) {
		return await spinner(
			async () => {
				const tunnel_secret = generateTunnelSecret()
				const tunnel = await this.cf.zeroTrust.tunnels.cloudflared.create({
					account_id: this.config.account_id,
					name: domainName,
					config_src: "local",
					tunnel_secret
				})
				if (tunnel.id) {
					// Save the secret locally for future use
					await this.tunnelSecrets.saveSecret(tunnel.id, tunnel_secret)
					return { tunnel_id: tunnel.id, tunnel_secret }
				}

				return { tunnel_id: undefined, tunnel_secret }
			},
			{
				text: `Creating tunnel '${domainName}'`
			}
		)
	}

	private async createDNSRecord(domain: { name: string; zone: { id: string } }, tunnel_id: string, force?: boolean) {
		await spinner(
			async () => {
				const content = `${tunnel_id}.cfargotunnel.com`
				const ttl = 1 // Auto TTL
				const proxied = true // Enable Cloudflare proxy for tunnel

				// Try to update existing record first if force is enabled
				if (force) {
					const updated = await this.cfh.updateDNSRecord(domain.zone.id, domain.name, content, ttl, proxied)
					if (updated) {
						return // Record was successfully updated
					}
				}

				// Create new record if no existing record was found or force is not enabled
				await this.cf.dns.records.create({
					zone_id: domain.zone.id,
					type: "CNAME",
					name: domain.name,
					content,
					ttl,
					proxied
				})
			},
			{
				text: force ? `Updating DNS record '${domain.name}' → ${tunnel_id}.cfargotunnel.com` : `Creating DNS record '${domain.name}' → ${tunnel_id}.cfargotunnel.com`
			}
		)
	}

	private async cleanup(tunnelName: string) {
		const _this = this as { _cleanupPromise?: Promise<void> }
		if (_this._cleanupPromise) return _this._cleanupPromise

		const task = async () => {
			await spinner(
				async (spinner) => {
					try {
						await this.cfh.removeDNSRecord(this.config.zone_id, tunnelName)
					} catch {
						spinner.error()
					}
				},
				{
					text: `Removing DNS record: ${tunnelName}`
				}
			)

			await spinner(
				async (spinner) => {
					const tunnels = await this.cf.zeroTrust.tunnels.cloudflared.list({ account_id: this.config.account_id, is_deleted: false })
					const tunnel = tunnels.result.find((t) => t.name === tunnelName)
					if (tunnel && tunnel.id) {
						try {
							await this.cf.zeroTrust.tunnels.cloudflared.delete(tunnel.id, { account_id: this.config.account_id })
						} catch {
							spinner.error()
						}
					}
				},
				{
					text: `Removing Cloudflare tunnel: ${tunnelName}`
				}
			)
		}

		return await (_this._cleanupPromise = task())
	}

	private async getEphemeralDomain(force?: boolean) {
		for (let attempt = 1; attempt <= 5; attempt++) {
			const result = await this.getFullDomain(generateEphemeralName(), force)
			if (result) return result
		}
		throw new Error("Failed to generate unique ephemeral domain after 5 attempts")
	}

	private async getFullDomain(value: string, force?: boolean) {
		// assume value is full domain
		let domainName = value

		return await spinner(
			async (spinner) => {
				const zones = await this.cf.zones.list()
				let zone = zones.result.find((zone) => value.endsWith(`.${zone.name}`) || value === zone.name)

				// value is subdomain since no zone found
				if (!zone) {
					zone = zones.result.find((zone) => zone.id === this.config.zone_id)
					if (!zone) throw new Error(`Cloudflare zone '${this.config.zone_id}' not found`)

					domainName = `${value}.${zone.name}`
				}
				spinner.update({ text: `Checking if domain '${domainName}' is available` })

				// parse subdomain from full domain
				const { subdomain } = parse(domainName)
				if (subdomain?.includes(".")) throw new Error("Subdomain cannot contain a dot")

				const record = await this.cfh.getDNSRecord(zone.id, domainName)
				if (record && !force) {
					throw new Error(`Domain ${domainName} already exists in DNS`)
				}

				return { zone, name: domainName }
			},
			{
				text: `Checking domain availability`
			}
		)
	}

	private async launchCloudflared(config: string, tunnelName: string) {
		const args: string[] = []
		args.push("tunnel")
		args.push("--loglevel", "debug")
		args.push("--config", config)
		args.push("run")

		const child = await spinner(async () => spawn("cloudflared", args), {
			text: "Starting cloudflared tunnel..."
		})

		child.on("error", async (error) => {
			console.error(`Failed to start cloudflared: ${error}`)
		})

		// handle cloudflared process exit
		child.once("close", async (code) => {
			await this.cleanup(tunnelName)
			process.exit(code)
		})

		child.stdout.on("data", (data: Buffer) => {
			const output = data.toString().trim()
			if (output) {
				logger.cloudflared.log(output)
			}
		})

		child.stderr.on("data", (data: Buffer) => {
			const output = data.toString().trim()
			if (output) {
				logger.cloudflared.log(output)
			}
		})
	}
}

export const http = new HttpCommand()
