import { $trycatch } from "@tszen/trycatch"
import { Cloudflare } from "cloudflare"
import { randomBytes } from "crypto"
import { mkdirSync, writeFileSync } from "fs"
import { access, mkdir, readFile, stat, writeFile } from "fs/promises"
import { dump } from "js-yaml"
import { homedir, tmpdir } from "os"
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

	async updateDNSRecord(zone_id: string, hostname: string, content: string, ttl: number = 1, proxied: boolean = true) {
		const records = await this.cf.dns.records.list({
			zone_id,
			name: {
				exact: hostname
			}
		})

		if (records.result && records.result.length > 0) {
			const record = records.result[0]
			await this.cf.dns.records.update(record.id, {
				zone_id,
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

// Tunnel secrets storage - stores tunnel_id -> tunnel_secret mappings locally
class TunnelSecrets {
	private secretsFilePath: string
	private configDir: string

	constructor(configDir: string = join(homedir(), ".config", "cgrok")) {
		this.configDir = configDir
		this.secretsFilePath = join(configDir, "tunnel-secrets.json")
	}

	private async ensureDir() {
		try {
			const stats = await stat(this.configDir)
			if (!stats.isDirectory()) {
				throw new Error(`Path ${this.configDir} exists but is not a directory`)
			}
		} catch {
			await mkdir(this.configDir, { recursive: true })
		}
	}

	async getSecret(tunnelId: string): Promise<string | undefined> {
		const [, accessError] = await $trycatch(async () => await access(this.secretsFilePath))
		if (accessError) {
			return
		}

		const [data, readError] = await $trycatch(async () => await readFile(this.secretsFilePath, "utf-8"))
		if (readError) {
			return
		}

		const [secrets, parseError] = await $trycatch(() => JSON.parse(data))
		if (parseError) {
			return
		}

		return secrets[tunnelId] as string | undefined
	}

	async saveSecret(tunnelId: string, tunnelSecret: string) {
		await this.ensureDir()

		let secrets: Record<string, string> = {}
		const [, accessError] = await $trycatch(async () => await access(this.secretsFilePath))
		if (!accessError) {
			const [data, readError] = await $trycatch(async () => await readFile(this.secretsFilePath, "utf-8"))
			if (!readError) {
				const [parsed, parseError] = await $trycatch(() => JSON.parse(data))
				if (!parseError) {
					secrets = parsed
				}
			}
		}

		secrets[tunnelId] = tunnelSecret

		await writeFile(this.secretsFilePath, JSON.stringify(secrets, null, 2))
	}
}

export function getTunnelSecrets(configDir?: string) {
	return new TunnelSecrets(configDir)
}
