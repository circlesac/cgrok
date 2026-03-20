import { useCallback, useEffect, useRef, useState } from "react"
import { TunnelManager } from "@/utils/cloudflare"
import { ensureCloudflared, loadConfig } from "@/utils/config"
import { parseLocalUrl } from "@/utils/helpers"

export type Phase = "init" | "tunnel" | "dns" | "ingress" | "launch" | "active" | "cleanup" | "done" | "error"

interface Step {
	label: string
	success: boolean
}

export interface TunnelState {
	phase: Phase
	phaseLabel: string
	hostname?: string
	localUrl?: string
	tunnelId?: string
	tunnelToken?: string
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

	const cleanup = useCallback(async () => {
		if (cleanupRef.current) {
			await cleanupRef.current()
		}
	}, [])

	useEffect(() => {
		let cancelled = false

		async function run() {
			try {
				// Init — check cloudflared & load config
				ensureCloudflared()
				const config = loadConfig()
				const tm = new TunnelManager(config)
				const localUrl = parseLocalUrl(endpoint)

				if (cancelled) return

				// Ensure singleton tunnel exists
				setPhase("tunnel", `Ensuring tunnel '${config.tunnelName}'`)
				const tunnelId = await tm.ensureTunnel()
				if (cancelled) return
				addStep(`Tunnel '${config.tunnelName}' ready`, true)

				// Clean stale ingress from previous crashes
				const stale = await tm.cleanStaleIngress(tunnelId)
				if (stale.length > 0) {
					addStep(`Cleaned ${stale.length} stale ingress rule(s)`, true)
				}

				// Resolve domain
				const { hostname, zoneId } = await tm.resolveDomain(url, force)
				if (cancelled) return

				// Create DNS record
				setPhase("dns", `Setting up DNS for '${hostname}'`)
				await tm.createDNS(tunnelId, hostname, zoneId, force)
				if (cancelled) return
				addStep(`DNS record '${hostname}' configured`, true)

				// Add ingress rule via API
				setPhase("ingress", `Adding ingress rule for '${hostname}'`)
				await tm.addIngress(tunnelId, hostname, localUrl)
				if (cancelled) return
				addStep(`Ingress rule added`, true)

				// Get tunnel token for cloudflared
				const token = await tm.cloudflare.zeroTrust.tunnels.cloudflared.token.get(tunnelId, {
					account_id: config.accountId
				})

				// Register cleanup
				cleanupRef.current = async () => {
					setState((prev) => ({ ...prev, phase: "cleanup", phaseLabel: "Cleaning up..." }))

					try {
						await tm.removeIngress(tunnelId, hostname)
						setState((prev) => ({ ...prev, completedSteps: [...prev.completedSteps, { label: "Ingress rule removed", success: true }] }))
					} catch {
						setState((prev) => ({ ...prev, completedSteps: [...prev.completedSteps, { label: "Failed to remove ingress rule", success: false }] }))
					}

					try {
						await tm.removeDNS(hostname, zoneId)
						setState((prev) => ({ ...prev, completedSteps: [...prev.completedSteps, { label: "DNS record removed", success: true }] }))
					} catch {
						setState((prev) => ({ ...prev, completedSteps: [...prev.completedSteps, { label: "Failed to remove DNS record", success: false }] }))
					}

					// Check if any ingress rules remain
					const remaining = await tm.getIngress(tunnelId)
					setState((prev) => ({
						...prev,
						phase: "done",
						// Signal to stop cloudflared if no ingress rules remain
						phaseLabel: remaining.length === 0 ? "stop-cloudflared" : ""
					}))
				}

				// Transition to active
				setState((prev) => ({
					...prev,
					phase: "active",
					phaseLabel: "",
					hostname,
					localUrl,
					tunnelId,
					tunnelToken: token as string
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
