import { Cloudflare } from "cloudflare"
import { Box, Text, useApp } from "ink"
import { useEffect, useState } from "react"

import { ErrorDisplay } from "@/components/error-display"
import { SelectList } from "@/components/select-list"
import { SpinnerStep } from "@/components/spinner-step"
import { Config } from "@/utils/config"

type Phase = "validating" | "select-account" | "select-zone" | "saving" | "done" | "error"

interface ConfigAppProps {
	authToken: string
}

interface Account {
	id: string
	name: string
}

interface Zone {
	id: string
	name: string
}

export function ConfigApp({ authToken }: ConfigAppProps) {
	const { exit } = useApp()
	const [phase, setPhase] = useState<Phase>("validating")
	const [accounts, setAccounts] = useState<Account[]>([])
	const [zones, setZones] = useState<Zone[]>([])
	const [selectedAccount, setSelectedAccount] = useState<Account>()
	const [selectedZone, setSelectedZone] = useState<Zone>()
	const [error, setError] = useState<Error>()
	const [cf, setCf] = useState<Cloudflare>()

	// Validate token and fetch accounts
	useEffect(() => {
		async function validate() {
			try {
				const client = new Cloudflare({ apiToken: authToken })
				setCf(client)

				const accountsResult = await client.accounts.list()
				if (!accountsResult.result?.length) {
					throw new Error("Failed to get account ID from Cloudflare API")
				}

				const accts = accountsResult.result.map((a) => ({ id: a.id, name: a.name }))

				if (accts.length === 1) {
					setSelectedAccount(accts[0])
				} else {
					setAccounts(accts)
					setPhase("select-account")
				}
			} catch (err) {
				setError(err instanceof Error ? err : new Error(String(err)))
				setPhase("error")
			}
		}
		validate()
	}, [authToken])

	// Once account is selected, fetch zones
	useEffect(() => {
		if (!selectedAccount || !cf) return
		if (phase === "select-zone" || phase === "saving" || phase === "done") return

		async function fetchZones() {
			try {
				const zonesResult = await cf!.zones.list()
				if (!zonesResult.result?.length) {
					throw new Error("No zones found for this account. A zone is required to use cgrok.")
				}

				const zs = zonesResult.result.map((z) => ({ id: z.id, name: z.name }))

				if (zs.length === 1) {
					setSelectedZone(zs[0])
					setPhase("saving")
				} else {
					setZones(zs)
					setPhase("select-zone")
				}
			} catch (err) {
				setError(err instanceof Error ? err : new Error(String(err)))
				setPhase("error")
			}
		}
		fetchZones()
	}, [selectedAccount, cf, phase])

	// Save config
	useEffect(() => {
		if (phase !== "saving" || !selectedAccount || !selectedZone) return

		async function save() {
			try {
				await Config.from().save({
					auth_token: authToken,
					account_id: selectedAccount!.id,
					zone_id: selectedZone!.id
				})
				setPhase("done")
			} catch (err) {
				setError(err instanceof Error ? err : new Error(String(err)))
				setPhase("error")
			}
		}
		save()
	}, [phase, selectedAccount, selectedZone, authToken])

	// Exit when done or on error
	useEffect(() => {
		if (phase === "done" || phase === "error") {
			exit()
		}
	}, [phase, exit])

	return (
		<Box flexDirection="column">
			<SpinnerStep label="Validating auth token..." status={phase === "validating" ? "running" : phase === "error" ? "error" : "success"} />

			{selectedAccount && phase !== "validating" && <SpinnerStep label={`Account: ${selectedAccount.name} (${selectedAccount.id})`} status="success" />}

			{phase === "select-account" && (
				<SelectList
					message={`Found ${accounts.length} accounts. Please select one:`}
					items={accounts.map((a) => ({ label: `${a.name} (${a.id})`, value: a }))}
					onSelect={(account) => {
						setSelectedAccount(account)
					}}
				/>
			)}

			{selectedZone && <SpinnerStep label={`Zone: ${selectedZone.name} (${selectedZone.id})`} status="success" />}

			{phase === "select-zone" && (
				<SelectList
					message={`Found ${zones.length} zones. Please select one:`}
					items={zones.map((z) => ({ label: `${z.name} (${z.id})`, value: z }))}
					onSelect={(zone) => {
						setSelectedZone(zone)
						setPhase("saving")
					}}
				/>
			)}

			{phase === "done" && (
				<Box marginTop={1}>
					<Text color="green">✔ Configuration saved successfully!</Text>
				</Box>
			)}

			{phase === "error" && error && <ErrorDisplay error={error} command="config add-authtoken" />}
		</Box>
	)
}
