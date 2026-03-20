import type { ChildProcess } from "child_process"
import { spawn } from "child_process"
import { useCallback, useEffect, useRef, useState } from "react"

import { logger } from "@/utils/logger"

export interface LogEntry {
	id: number
	timestamp: string
	level: string
	message: string
	raw: string
}

export type ConnectionStatus = "starting" | "connected" | "disconnected" | "restarting"

interface UseCloudflaredOptions {
	tunnelToken: string
	enabled: boolean
}

let logIdCounter = 0

function parseLogLine(raw: string): LogEntry | undefined {
	const trimmed = raw.trim()
	if (!trimmed) return

	const match = trimmed.match(/^(\S+)\s+(INF|ERR|WRN|DBG)\s+(.+)$/)
	if (match) {
		const [, timestamp, level, message] = match
		return { id: logIdCounter++, timestamp: timestamp.replace(/T/, " ").replace(/Z$/, ""), level, message, raw: trimmed }
	}

	return { id: logIdCounter++, timestamp: "", level: "INF", message: trimmed, raw: trimmed }
}

function detectConnectionStatus(line: string): ConnectionStatus | undefined {
	if (/Connection .* registered/i.test(line) || /Registered tunnel connection/i.test(line)) {
		return "connected"
	}
	if (/connection refused/i.test(line) || /connection reset/i.test(line) || /tunnel not found/i.test(line)) {
		return "disconnected"
	}
}

const MAX_RESTART_DELAY = 30000

export function useCloudflared({ tunnelToken, enabled }: UseCloudflaredOptions) {
	const [logs, setLogs] = useState<LogEntry[]>([])
	const [status, setStatus] = useState<ConnectionStatus>("starting")
	const [restartCount, setRestartCount] = useState(0)

	const shouldRestart = useRef(true)
	const childRef = useRef<ChildProcess | undefined>(undefined)
	const restartCountRef = useRef(0)

	const stop = useCallback(() => {
		shouldRestart.current = false
		if (childRef.current) {
			childRef.current.kill("SIGTERM")
		}
	}, [])

	useEffect(() => {
		if (!enabled) return

		shouldRestart.current = true
		restartCountRef.current = 0

		function appendLog(raw: string) {
			const lines = raw.split("\n")
			for (const line of lines) {
				const entry = parseLogLine(line)
				if (!entry) continue

				logger.cloudflared.log(entry.raw)
				setLogs((prev) => [...prev, entry])

				const connectionChange = detectConnectionStatus(entry.raw)
				if (connectionChange) {
					setStatus(connectionChange)
					if (connectionChange === "connected") {
						restartCountRef.current = 0
						setRestartCount(0)
					}
				}
			}
		}

		function spawnProcess() {
			setStatus("starting")

			// Use --token for remotely-managed tunnels (config_src: "cloudflare")
			const args = ["tunnel", "--no-autoupdate", "run", "--token", tunnelToken]
			const child = spawn("cloudflared", args)
			childRef.current = child

			child.stdout.on("data", (data: Buffer) => appendLog(data.toString()))
			child.stderr.on("data", (data: Buffer) => appendLog(data.toString()))

			child.on("error", (error) => {
				appendLog(`ERR Failed to start cloudflared: ${error.message}`)
				setStatus("disconnected")
			})

			child.on("close", (code) => {
				childRef.current = undefined

				if (shouldRestart.current) {
					const count = restartCountRef.current
					const delay = Math.min(1000 * 2 ** count, MAX_RESTART_DELAY)
					setStatus("restarting")
					restartCountRef.current = count + 1
					setRestartCount(count + 1)

					appendLog(`INF cloudflared exited with code ${code}, restarting in ${delay}ms...`)
					setTimeout(spawnProcess, delay)
				}
			})
		}

		spawnProcess()

		return () => {
			shouldRestart.current = false
			if (childRef.current) {
				childRef.current.kill("SIGTERM")
				childRef.current = undefined
			}
		}
	}, [tunnelToken, enabled])

	return { logs, status, restartCount, stop }
}
