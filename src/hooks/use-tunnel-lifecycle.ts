import { Cloudflare } from "cloudflare"
import { useCallback, useEffect, useRef, useState } from "react"
import { parse } from "tldts"

import { CloudflareHelper, createConfigFile, generateTunnelSecret, getTunnelSecrets } from "@/utils/cloudflare"
import { Config } from "@/utils/config"
import { generateEphemeralName, parseLocalUrl } from "@/utils/helpers"

export type Phase = "init" | "domain" | "check-tunnel" | "create-tunnel" | "dns" | "launch" | "active" | "cleanup-dns" | "cleanup-tunnel" | "done" | "error"

interface Step {
	label: string
	success: boolean
}

export interface TunnelState {
	phase: Phase
	phaseLabel: string
	domain?: string
	localUrl?: string
	logPath?: string
	configPath?: string
	error?: Error
	completedSteps: Step[]
}

interface TunnelLifecycleOptions {
	endpoint: string
	url?: string
	force?: boolean
	debug?: boolean
}

export function useTunnelLifecycle({ endpoint, url, force, debug }: TunnelLifecycleOptions) {
	const [state, setState] = useState<TunnelState>({
		phase: "init",
		phaseLabel: "Initializing...",
		completedSteps: []
	})

	const cleanupRef = useRef<(() => Promise<void>) | undefined>(undefined)

	const addStep = useCallback((label: string, success: boolean) => {
		setState((prev) => ({
			...prev,
			completedSteps: [...prev.completedSteps, { label, success }]
		}))
	}, [])

	const setPhase = useCallback((phase: Phase, phaseLabel: string) => {
		setState((prev) => ({ ...prev, phase, phaseLabel }))
	}, [])

	const setError = useCallback((error: Error) => {
		setState((prev) => ({ ...prev, phase: "error" as Phase, error }))
	}, [])

	// Cleanup function exposed for SIGINT handling
	const cleanup = useCallback(async () => {
		if (cleanupRef.current) {
			await cleanupRef.current()
		}
	}, [])

	useEffect(() => {
		let cancelled = false

		async function run() {
			try {
				// Init
				const config = await Config.from().load()
				const cf = new Cloudflare({ apiToken: config.auth_token })
				const cfh = new CloudflareHelper(cf)
				const tunnelSecrets = getTunnelSecrets()
				const localUrl = parseLocalUrl(endpoint)

				if (cancelled) return

				// Domain resolution
				setPhase("domain", "Checking domain availability")
				let domain: { zone: { id: string; name: string }; name: string }

				if (url) {
					domain = await resolveFullDomain(cf, cfh, config, url, force)
				} else {
					domain = await resolveEphemeralDomain(cf, cfh, config, force)
				}

				if (cancelled) return
				addStep(`Domain '${domain.name}' resolved`, true)

				// Check existing tunnel
				setPhase("check-tunnel", `Checking if tunnel '${domain.name}' is available`)
				let tunnel_id: string | undefined
				let tunnel_secret: string | undefined

				const existing = await checkExistingTunnel(cf, cfh, config, tunnelSecrets, domain.name)
				tunnel_id = existing.tunnel_id
				tunnel_secret = existing.tunnel_secret

				if (cancelled) return

				if (tunnel_id) {
					addStep(`Existing tunnel found`, true)
				} else {
					addStep(`No existing tunnel`, true)

					// Create new tunnel
					setPhase("create-tunnel", `Creating tunnel '${domain.name}'`)
					const newTunnel = await createNewTunnel(cf, config, tunnelSecrets, domain.name)
					tunnel_id = newTunnel.tunnel_id
					tunnel_secret = newTunnel.tunnel_secret

					if (cancelled) return
					addStep(`Tunnel '${domain.name}' created`, true)
				}

				if (!tunnel_id || !tunnel_secret) {
					throw new Error(`Failed to create tunnel ${domain.name}`)
				}

				// DNS
				setPhase("dns", force ? `Updating DNS record '${domain.name}'` : `Creating DNS record '${domain.name}'`)
				await createDNSRecord(cf, cfh, domain, tunnel_id, force)

				if (cancelled) return
				addStep(`DNS record configured`, true)

				// Create config file and transition to active
				const configPath = await createConfigFile(domain.name, localUrl, tunnel_id, tunnel_secret, config.account_id)

				// Register cleanup function
				cleanupRef.current = async () => {
					setState((prev) => ({ ...prev, phase: "cleanup-dns", phaseLabel: `Removing DNS record: ${domain.name}` }))
					try {
						await cfh.removeDNSRecord(config.zone_id, domain.name)
						setState((prev) => ({ ...prev, completedSteps: [...prev.completedSteps, { label: `DNS record removed`, success: true }] }))
					} catch {
						setState((prev) => ({ ...prev, completedSteps: [...prev.completedSteps, { label: `Failed to remove DNS record`, success: false }] }))
					}

					setState((prev) => ({ ...prev, phase: "cleanup-tunnel", phaseLabel: `Removing tunnel: ${domain.name}` }))
					try {
						const tunnels = await cf.zeroTrust.tunnels.cloudflared.list({ account_id: config.account_id, is_deleted: false })
						const tunnel = tunnels.result.find((t) => t.name === domain.name)
						if (tunnel && tunnel.id) {
							await cf.zeroTrust.tunnels.cloudflared.delete(tunnel.id, { account_id: config.account_id })
						}
						setState((prev) => ({ ...prev, completedSteps: [...prev.completedSteps, { label: `Tunnel removed`, success: true }] }))
					} catch {
						setState((prev) => ({ ...prev, completedSteps: [...prev.completedSteps, { label: `Failed to remove tunnel`, success: false }] }))
					}

					setState((prev) => ({ ...prev, phase: "done" }))
				}

				// Transition to active - cloudflared managed by useCloudflared hook
				setState((prev) => ({
					...prev,
					phase: "active",
					phaseLabel: "",
					domain: domain.name,
					localUrl,
					configPath
				}))
			} catch (error) {
				if (!cancelled) {
					setError(error instanceof Error ? error : new Error(String(error)))
				}
			}
		}

		run()

		return () => {
			cancelled = true
		}
	}, [endpoint, url, force, debug, addStep, setPhase, setError])

	return { ...state, cleanup }
}

// --- Business logic functions (extracted from HttpCommand) ---

async function resolveFullDomain(cf: Cloudflare, cfh: CloudflareHelper, config: Config, value: string, force?: boolean) {
	let domainName = value
	const zones = await cf.zones.list()
	let zone = zones.result.find((z) => value.endsWith(`.${z.name}`) || value === z.name)

	if (!zone) {
		zone = zones.result.find((z) => z.id === config.zone_id)
		if (!zone) throw new Error(`Cloudflare zone '${config.zone_id}' not found`)
		domainName = `${value}.${zone.name}`
	}

	const { subdomain } = parse(domainName)
	if (subdomain?.includes(".")) throw new Error("Subdomain cannot contain a dot")

	const record = await cfh.getDNSRecord(zone.id, domainName)
	if (record && !force) {
		throw new Error(`Domain ${domainName} already exists in DNS`)
	}

	return { zone: { id: zone.id, name: zone.name }, name: domainName }
}

async function resolveEphemeralDomain(cf: Cloudflare, cfh: CloudflareHelper, config: Config, force?: boolean) {
	for (let attempt = 1; attempt <= 5; attempt++) {
		const result = await resolveFullDomain(cf, cfh, config, generateEphemeralName(), force)
		if (result) return result
	}
	throw new Error("Failed to generate unique ephemeral domain after 5 attempts")
}

async function checkExistingTunnel(cf: Cloudflare, cfh: CloudflareHelper, config: Config, tunnelSecrets: ReturnType<typeof getTunnelSecrets>, domainName: string) {
	const tunnel = await cfh.tunnelByName(config.account_id, domainName)

	if (tunnel && tunnel.id) {
		// Try local storage first
		let tunnel_secret = await tunnelSecrets.getSecret(tunnel.id)
		if (tunnel_secret) {
			return { tunnel_id: tunnel.id, tunnel_secret }
		}

		// Get token from Cloudflare API
		const token = await cf.zeroTrust.tunnels.cloudflared.token.get(tunnel.id, { account_id: config.account_id })

		try {
			const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf-8"))
			tunnel_secret = decoded.s as string

			if (tunnel_secret) {
				await tunnelSecrets.saveSecret(tunnel.id, tunnel_secret)
			}
		} catch {
			// Failed to decode token
		}

		if (tunnel_secret && typeof tunnel_secret === "string" && tunnel_secret.length > 0) {
			return { tunnel_id: tunnel.id, tunnel_secret }
		}

		const msgs = [
			`Could not get the tunnel secret for '${domainName}' (ID: ${tunnel.id})\n`,
			`The tunnel may have been created with a different configuration. You may need to delete the existing tunnel, run:`,
			`  cloudflared tunnel delete ${tunnel.id}`
		]
		throw new Error(msgs.join("\n"))
	}

	return { tunnel_id: undefined, tunnel_secret: undefined }
}

async function createNewTunnel(cf: Cloudflare, config: Config, tunnelSecrets: ReturnType<typeof getTunnelSecrets>, domainName: string) {
	const tunnel_secret = generateTunnelSecret()
	const tunnel = await cf.zeroTrust.tunnels.cloudflared.create({
		account_id: config.account_id,
		name: domainName,
		config_src: "local",
		tunnel_secret
	})

	if (tunnel.id) {
		await tunnelSecrets.saveSecret(tunnel.id, tunnel_secret)
		return { tunnel_id: tunnel.id, tunnel_secret }
	}

	return { tunnel_id: undefined, tunnel_secret: undefined as string | undefined }
}

async function createDNSRecord(cf: Cloudflare, cfh: CloudflareHelper, domain: { name: string; zone: { id: string } }, tunnel_id: string, force?: boolean) {
	const content = `${tunnel_id}.cfargotunnel.com`
	const ttl = 1
	const proxied = true

	if (force) {
		const updated = await cfh.updateDNSRecord(domain.zone.id, domain.name, content, ttl, proxied)
		if (updated) return
	}

	await cf.dns.records.create({
		zone_id: domain.zone.id,
		type: "CNAME",
		name: domain.name,
		content,
		ttl,
		proxied
	})
}
