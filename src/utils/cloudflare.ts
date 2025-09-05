import { Cloudflare } from "cloudflare"
import { randomBytes } from "crypto"
import { mkdirSync, writeFileSync } from "fs"
import { dump } from "js-yaml"
import { tmpdir } from "os"
import { join } from "path"

export interface TunnelCredentials {
	AccountTag: string
	TunnelSecret: string
	TunnelID: string
}

export interface TunnelConfig {
	tunnel: string
	"credentials-file": string
	ingress: Array<{
		hostname?: string
		service: string
	}>
}

export class CloudflareHelper {
	constructor(private cf: Cloudflare) {}

	async zoneById(zoneId: string) {
		const zones = await this.cf.zones.list()
		if (!zones.result || zones.result.length === 0) return

		return zones.result.find((z) => z.id === zoneId)
	}

	async tunnelByName(accountId: string, tunnelName: string) {
		const tunnels = await this.cf.zeroTrust.tunnels.cloudflared.list({
			account_id: accountId,
			is_deleted: false
		})

		if (!tunnels.result || tunnels.result.length === 0) return

		return tunnels.result.find((tunnel) => tunnel.name === tunnelName)
	}

	async getDNSRecord(zone_id: string, hostname: string) {
		const records = await this.cf.dns.records.list({
			zone_id,
			name: { exact: hostname }
		})
		if (records.result && records.result.length > 0) {
			return records.result[0]
		}
		return
	}

	async removeDNSRecord(zone_id: string, hostname: string) {
		const records = await this.cf.dns.records.list({
			zone_id,
			name: {
				exact: hostname
			}
		})

		if (records.result && records.result.length > 0) {
			await this.cf.dns.records.delete(records.result[0].id, {
				zone_id
			})
		}
	}
}

export function createConfigFile(tunnelName: string, localUrl: string, tunnelId: string, tunnelSecret: string, accountId: string) {
	// tmp
	const tempDir = join(tmpdir(), `cgrok-${tunnelId}`)
	mkdirSync(tempDir, { recursive: true })

	// credentials file
	const credentialsPath = join(tempDir, `${tunnelId}.json`)
	const credentials: TunnelCredentials = {
		AccountTag: accountId,
		TunnelSecret: tunnelSecret,
		TunnelID: tunnelId
	}
	writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2))

	// config file
	const configPath = join(tempDir, `${tunnelName}.yml`)
	const configData: TunnelConfig = {
		tunnel: tunnelId,
		"credentials-file": credentialsPath,
		ingress: [
			{
				hostname: tunnelName,
				service: localUrl
			},
			{
				service: "http_status:404"
			}
		]
	}

	const configContent = dump(configData)
	writeFileSync(configPath, configContent)

	return configPath
}

export function generateTunnelSecret() {
	return randomBytes(32).toString("base64")
}
