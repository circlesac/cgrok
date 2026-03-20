import { Cloudflare } from "cloudflare"
import { randomBytes } from "crypto"
import { mkdirSync, writeFileSync } from "fs"
import { join } from "path"

import type { Config } from "@/utils/config"

// --- Cloudflare Helper ---

export class CloudflareHelper {
	constructor(private cf: Cloudflare) {}

	async zoneById(zoneId: string) {
		const zones = await this.cf.zones.list()
		return zones.result?.find((z) => z.id === zoneId)
	}

	async tunnelByName(accountId: string, tunnelName: string) {
		const tunnels = await this.cf.zeroTrust.tunnels.cloudflared.list({
			account_id: accountId,
			is_deleted: false
		})
		return tunnels.result?.find((t) => t.name === tunnelName)
	}

	async getDNSRecord(zoneId: string, hostname: string) {
		const records = await this.cf.dns.records.list({
			zone_id: zoneId,
			name: { exact: hostname }
		})
		return records.result?.[0]
	}

	async removeDNSRecord(zoneId: string, hostname: string) {
		const record = await this.getDNSRecord(zoneId, hostname)
		if (record) {
			await this.cf.dns.records.delete(record.id, { zone_id: zoneId })
		}
	}

	async updateDNSRecord(zoneId: string, hostname: string, content: string, ttl = 1, proxied = true) {
		const record = await this.getDNSRecord(zoneId, hostname)
		if (record) {
			await this.cf.dns.records.update(record.id, {
				zone_id: zoneId,
				type: "CNAME",
				name: hostname,
				content,
				ttl,
				proxied
			})
			return true
		}
		return false
	}
}

// --- Tunnel Manager (singleton tunnel per PC) ---

export class TunnelManager {
	private cf: Cloudflare
	private cfh: CloudflareHelper
	private config: Config

	constructor(config: Config) {
		this.config = config
		this.cf = new Cloudflare({ apiToken: config.apiToken })
		this.cfh = new CloudflareHelper(this.cf)
	}

	/**
	 * Get or create the singleton tunnel for this PC.
	 * Returns the tunnel ID.
	 */
	async ensureTunnel(): Promise<string> {
		// Check for existing tunnel
		const existing = await this.cfh.tunnelByName(this.config.accountId, this.config.tunnelName)
		if (existing?.id) {
			return existing.id
		}

		// Create new tunnel with config_src: "cloudflare"
		const tunnelSecret = randomBytes(32).toString("base64")
		const tunnel = await this.cf.zeroTrust.tunnels.cloudflared.create({
			account_id: this.config.accountId,
			name: this.config.tunnelName,
			config_src: "cloudflare",
			tunnel_secret: tunnelSecret
		})

		if (!tunnel.id) {
			throw new Error(`Failed to create tunnel '${this.config.tunnelName}'`)
		}

		// Save credentials for cloudflared to use
		this.saveCredentials(tunnel.id, tunnelSecret)

		return tunnel.id
	}

	/**
	 * Add an ingress rule to the tunnel via Cloudflare API.
	 */
	async addIngress(tunnelId: string, hostname: string, service: string) {
		const current = await this.getIngress(tunnelId)
		const newIngress = [...current.filter((r) => r.hostname !== hostname), { hostname, service }]
		await this.updateIngress(tunnelId, newIngress)
	}

	/**
	 * Remove an ingress rule from the tunnel via Cloudflare API.
	 */
	async removeIngress(tunnelId: string, hostname: string) {
		const current = await this.getIngress(tunnelId)
		const newIngress = current.filter((r) => r.hostname !== hostname)
		await this.updateIngress(tunnelId, newIngress)
	}

	/**
	 * Get current ingress rules from Cloudflare API.
	 */
	async getIngress(tunnelId: string): Promise<Array<{ hostname: string; service: string }>> {
		const config = await this.cf.zeroTrust.tunnels.cloudflared.configurations.get(tunnelId, {
			account_id: this.config.accountId
		})
		return (config.config?.ingress ?? []).filter((r): r is { hostname: string; service: string } => !!r.hostname)
	}

	/**
	 * Create a DNS CNAME record pointing to the tunnel.
	 */
	async createDNS(tunnelId: string, hostname: string, zoneId: string, force?: boolean) {
		const content = `${tunnelId}.cfargotunnel.com`

		if (force) {
			const updated = await this.cfh.updateDNSRecord(zoneId, hostname, content)
			if (updated) return
		}

		const existing = await this.cfh.getDNSRecord(zoneId, hostname)
		if (existing && !force) {
			throw new Error(`DNS record '${hostname}' already exists. Use --force to overwrite.`)
		}

		await this.cf.dns.records.create({
			zone_id: zoneId,
			type: "CNAME",
			name: hostname,
			content,
			ttl: 1,
			proxied: true
		})
	}

	/**
	 * Remove a DNS record.
	 */
	async removeDNS(hostname: string, zoneId: string) {
		await this.cfh.removeDNSRecord(zoneId, hostname)
	}

	/**
	 * Resolve domain from --url argument.
	 */
	async resolveDomain(url: string | undefined, _force?: boolean): Promise<{ hostname: string; zoneId: string }> {
		const zones = await this.cf.zones.list()
		if (!zones.result?.length) throw new Error("No zones found in your Cloudflare account.")

		if (url) {
			// Check if it's a FQDN (contains dot matching a known zone)
			const zone = zones.result.find((z) => url.endsWith(`.${z.name}`) || url === z.name)
			if (zone) {
				return { hostname: url, zoneId: zone.id }
			}

			// Treat as subdomain of first zone
			const defaultZone = zones.result[0]
			return { hostname: `${url}.${defaultZone.name}`, zoneId: defaultZone.id }
		}

		// Generate random subdomain on first zone
		const randomName = randomBytes(6).toString("hex").slice(0, 12)
		const defaultZone = zones.result[0]
		return { hostname: `${randomName}.${defaultZone.name}`, zoneId: defaultZone.id }
	}

	/**
	 * Clean up stale ingress rules (ports that are no longer listening).
	 */
	async cleanStaleIngress(tunnelId: string) {
		const ingress = await this.getIngress(tunnelId)
		const stale: string[] = []

		for (const rule of ingress) {
			try {
				const url = new URL(rule.service)
				const port = parseInt(url.port || (url.protocol === "https:" ? "443" : "80"))
				const net = await import("net")
				const isOpen = await new Promise<boolean>((resolve) => {
					const socket = net.createConnection({ port, host: url.hostname }, () => {
						socket.destroy()
						resolve(true)
					})
					socket.on("error", () => resolve(false))
					socket.setTimeout(1000, () => {
						socket.destroy()
						resolve(false)
					})
				})
				if (!isOpen) stale.push(rule.hostname)
			} catch {
				stale.push(rule.hostname)
			}
		}

		if (stale.length > 0) {
			const cleaned = ingress.filter((r) => !stale.includes(r.hostname))
			await this.updateIngress(tunnelId, cleaned)

			// Also clean DNS for stale entries
			for (const hostname of stale) {
				try {
					const zones = await this.cf.zones.list()
					for (const zone of zones.result ?? []) {
						if (hostname.endsWith(`.${zone.name}`)) {
							await this.cfh.removeDNSRecord(zone.id, hostname)
							break
						}
					}
				} catch {
					// Best effort
				}
			}
		}

		return stale
	}

	get cloudflare() {
		return this.cf
	}

	get helper() {
		return this.cfh
	}

	// --- Private ---

	private async updateIngress(tunnelId: string, rules: Array<{ hostname: string; service: string }>) {
		await this.cf.zeroTrust.tunnels.cloudflared.configurations.update(tunnelId, {
			account_id: this.config.accountId,
			config: {
				ingress: [...rules.map((r) => ({ hostname: r.hostname, service: r.service })), { hostname: "", service: "http_status:404" }]
			}
		})
	}

	private saveCredentials(tunnelId: string, tunnelSecret: string) {
		const credPath = join(this.config.cloudflaredDir, `${tunnelId}.json`)
		try {
			mkdirSync(this.config.cloudflaredDir, { recursive: true })
		} catch {
			// already exists
		}
		writeFileSync(
			credPath,
			JSON.stringify(
				{
					AccountTag: this.config.accountId,
					TunnelSecret: tunnelSecret,
					TunnelID: tunnelId
				},
				null,
				2
			)
		)
	}
}

export function generateEphemeralName() {
	return randomBytes(6).toString("hex").slice(0, 12)
}
