import { execSync } from "child_process"
import { mkdirSync, readFileSync, writeFileSync } from "fs"
import { hostname } from "os"
import { join } from "path"

export interface Config {
	apiToken: string
	accountId: string
	tunnelName: string
	cloudflaredDir: string
}

const DEFAULT_CONFIG_DIR = join(process.env.HOME ?? process.env.USERPROFILE ?? "", ".config", "cgrok")

export function loadConfig(configDir?: string): Config {
	const cgrokConfigDir = configDir ?? DEFAULT_CONFIG_DIR
	const configFile = join(cgrokConfigDir, "config.json")
	const cloudflaredDir = join(process.env.HOME ?? process.env.USERPROFILE ?? "", ".cloudflared")

	// Check cloudflared is installed
	try {
		execSync("which cloudflared", { stdio: "ignore" })
	} catch {
		const platform = process.platform
		const installCmd =
			platform === "darwin"
				? "brew install cloudflared"
				: platform === "linux"
					? "sudo apt install cloudflared  # or: sudo yum install cloudflared"
					: "https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
		throw new Error(`cloudflared is not installed.\nInstall it with:\n  ${installCmd}`)
	}

	// Read config
	let configData: { apiToken: string; accountId: string }
	try {
		configData = JSON.parse(readFileSync(configFile, "utf-8"))
	} catch {
		throw new Error(
			`cgrok is not configured.\nRun 'cgrok config add-authtoken <TOKEN>' to set up.\nCreate a token at https://dash.cloudflare.com/profile/api-tokens with:\n  - Zone > DNS > Edit\n  - Account > Cloudflare Tunnel > Edit\n  - Zone > Zone > Read`
		)
	}

	if (!configData.apiToken || !configData.accountId) {
		throw new Error(`Invalid configuration.\nRun 'cgrok config add-authtoken <TOKEN>' to reconfigure.`)
	}

	return {
		apiToken: configData.apiToken,
		accountId: configData.accountId,
		tunnelName: `cgrok-${hostname()}`,
		cloudflaredDir
	}
}

/**
 * Save API token after validating permissions.
 * Checks Zone > DNS > Edit, Account > Cloudflare Tunnel > Edit, Zone > Zone > Read.
 */
export async function saveAuthToken(token: string, accountIdArg?: string, configDir?: string) {
	const dir = configDir ?? DEFAULT_CONFIG_DIR
	const configFile = join(dir, "config.json")

	// Verify token can list zones (Zone > Zone > Read)
	const zonesRes = await fetch("https://api.cloudflare.com/client/v4/zones", {
		headers: { Authorization: `Bearer ${token}` }
	})
	const zonesData = (await zonesRes.json()) as { success: boolean; result?: Array<{ id: string; name: string }> }

	if (!zonesData.success || !zonesData.result?.length) {
		throw new Error("Invalid token: cannot list zones.\nMake sure the token has Zone > Zone > Read permission.")
	}

	// Verify DNS permission (Zone > DNS > Edit)
	const zoneId = zonesData.result[0].id
	const dnsRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?per_page=1`, {
		headers: { Authorization: `Bearer ${token}` }
	})
	const dnsData = (await dnsRes.json()) as { success: boolean }

	if (!dnsData.success) {
		throw new Error("Invalid token: cannot manage DNS records.\nMake sure the token has Zone > DNS > Edit permission.")
	}

	// Verify tunnel permission (Account > Cloudflare Tunnel > Edit)
	// Get account ID from zones
	const accountsRes = await fetch("https://api.cloudflare.com/client/v4/accounts", {
		headers: { Authorization: `Bearer ${token}` }
	})
	const accountsData = (await accountsRes.json()) as { success: boolean; result?: Array<{ id: string; name: string }> }

	if (!accountsData.success || !accountsData.result?.length) {
		throw new Error("Invalid token: cannot list accounts.\nMake sure the token has Account > Cloudflare Tunnel > Edit permission.")
	}

	if (!accountIdArg) {
		throw new Error("--account is required.")
	}

	const match = accountsData.result.find((a) => a.id === accountIdArg || a.name === accountIdArg)
	if (!match) {
		const available = accountsData.result.map((a) => `  - ${a.name} (${a.id})`).join("\n")
		throw new Error(`Account '${accountIdArg}' not found.\nAvailable accounts:\n${available}`)
	}
	const accountId = match.id

	const tunnelRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/cfd_tunnel?per_page=1`, {
		headers: { Authorization: `Bearer ${token}` }
	})
	const tunnelData = (await tunnelRes.json()) as { success: boolean }

	if (!tunnelData.success) {
		throw new Error("Invalid token: cannot manage tunnels.\nMake sure the token has Account > Cloudflare Tunnel > Edit permission.")
	}

	// Save
	mkdirSync(dir, { recursive: true })
	writeFileSync(configFile, JSON.stringify({ apiToken: token, accountId }, null, 2))
}
