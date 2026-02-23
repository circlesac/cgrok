import { Box, Static, Text, useApp, useStdout } from "ink"
import { useCallback, useEffect, useRef, useState } from "react"

import { ErrorDisplay } from "@/components/error-display"
import { SpinnerStep } from "@/components/spinner-step"
import type { LogEntry } from "@/hooks/use-cloudflared"
import { useCloudflared } from "@/hooks/use-cloudflared"
import { useTunnelLifecycle } from "@/hooks/use-tunnel-lifecycle"
import { logger } from "@/utils/logger"

interface HttpAppProps {
	endpoint: string
	options: { url?: string; force?: boolean; debug?: boolean }
}

export function HttpApp({ endpoint, options }: HttpAppProps) {
	const { exit } = useApp()
	const { stdout } = useStdout()
	const [shuttingDown, setShuttingDown] = useState(false)
	const shuttingDownRef = useRef(false)
	const termWidth = stdout?.columns ?? 80

	const tunnel = useTunnelLifecycle({
		endpoint,
		url: options.url,
		force: options.force,
		debug: options.debug
	})

	const cloudflared = useCloudflared({
		configPath: tunnel.configPath ?? "",
		enabled: tunnel.phase === "active" && !shuttingDown
	})

	const handleSignal = useCallback(async () => {
		if (shuttingDownRef.current) return
		shuttingDownRef.current = true
		setShuttingDown(true)

		cloudflared.stop()
		await tunnel.cleanup()
		exit()
	}, [cloudflared, tunnel, exit])

	useEffect(() => {
		const handler = () => {
			handleSignal()
		}
		process.on("SIGINT", handler)
		process.on("SIGTERM", handler)
		return () => {
			process.removeListener("SIGINT", handler)
			process.removeListener("SIGTERM", handler)
		}
	}, [handleSignal])

	useEffect(() => {
		if (tunnel.phase === "done") {
			exit()
		}
	}, [tunnel.phase, exit])

	const isSetup = tunnel.phase !== "active" && tunnel.phase !== "done" && tunnel.phase !== "error"
	const isCleanup = tunnel.phase === "cleanup-dns" || tunnel.phase === "cleanup-tunnel"

	// Setup / cleanup phase
	if (isSetup || isCleanup || tunnel.phase === "error") {
		return (
			<Box flexDirection="column">
				{tunnel.completedSteps.map((step, i) => (
					<SpinnerStep key={i} label={step.label} status={step.success ? "success" : "error"} />
				))}
				{isSetup && !isCleanup && <SpinnerStep label={tunnel.phaseLabel} status="running" />}
				{isCleanup && <SpinnerStep label={tunnel.phaseLabel} status="running" />}
				{tunnel.phase === "error" && tunnel.error && <ErrorDisplay error={tunnel.error} command="http" />}
			</Box>
		)
	}

	// Active dashboard (ngrok-style)
	const statusColor = cloudflared.status === "connected" ? "green" : cloudflared.status === "restarting" ? "yellow" : "red"
	const statusLabel = cloudflared.status === "connected" ? "online" : cloudflared.status === "restarting" ? "reconnecting" : cloudflared.status === "starting" ? "connecting" : "offline"
	const separator = "─".repeat(termWidth)

	return (
		<Box flexDirection="column">
			{/* Header */}
			<Box marginBottom={1}>
				<Text bold>cgrok</Text>
				<Text>{"  "}</Text>
				<Text dimColor>(Ctrl+C to quit)</Text>
			</Box>

			{/* Session info */}
			<SessionRow label="Session Status" value={statusLabel} valueColor={statusColor} />
			{tunnel.domain && <SessionRow label="Forwarding" value={`https://${tunnel.domain} → ${tunnel.localUrl}`} valueColor="cyan" />}
			<SessionRow label="Log File" value={logger.cloudflared.path} />
			{cloudflared.restartCount > 0 && <SessionRow label="Restarts" value={String(cloudflared.restartCount)} valueColor="yellow" />}

			{/* Separator */}
			<Box marginTop={1}>
				<Text dimColor>{separator}</Text>
			</Box>

			{/* Log stream */}
			<Static items={cloudflared.logs}>{(entry: LogEntry) => <LogLine key={entry.id} entry={entry} />}</Static>
		</Box>
	)
}

const LABEL_WIDTH = 24

function SessionRow({ label, value, valueColor }: { label: string; value?: string; valueColor?: string }) {
	if (!value) return null
	return (
		<Box>
			<Text dimColor>{label.padEnd(LABEL_WIDTH)}</Text>
			<Text color={valueColor}>{value}</Text>
		</Box>
	)
}

function LogLine({ entry }: { entry: LogEntry }) {
	const color = entry.level === "ERR" ? "red" : entry.level === "WRN" ? "yellow" : undefined

	return (
		<Text>
			{entry.timestamp && <Text dimColor>{entry.timestamp} </Text>}
			<Text color={color}>{entry.message}</Text>
		</Text>
	)
}
