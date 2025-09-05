import { Cloudflare } from "cloudflare"
import { Command } from "commander"
import inquirer from "inquirer"

import { BaseCommand } from "@/utils/base"
import { Config } from "@/utils/config"

class AddAuthTokenCommand extends BaseCommand {
	constructor() {
		super("add-authtoken")
		this.description("Add Cloudflare API token")
		this.argument("<auth-token>", "Cloudflare API token")
	}

	protected async execute(authToken: string) {
		console.info("Validating auth token...")

		// Initialize Cloudflare client to validate token
		const cf = new Cloudflare({ apiToken: authToken })

		// Get account ID
		const accounts = await cf.accounts.list()
		if (!accounts.result || accounts.result.length === 0) {
			throw new Error("Failed to get account ID from Cloudflare API")
		}

		const { accountId, accountName } = await this.selectAccount(accounts.result)

		// Get zones for the selected account
		const zones = await cf.zones.list()
		if (zones.result.length === 0) {
			throw new Error("No zones found for this account. A zone is required to use cgrok.")
		}

		const { zoneId, zoneName } = await this.selectZone(zones.result)

		// Create and save config
		await Config.from().save({
			auth_token: authToken,
			account_id: accountId,
			zone_id: zoneId
		})
		console.info("✔ Configuration saved successfully!")
		console.info(`  Account: ${accountName}`)
		console.info(`  Zone: ${zoneName}`)
	}

	private async selectAccount(accounts: { id: string; name: string }[]) {
		if (accounts.length === 1) {
			// Only one account, use it automatically
			const account = accounts[0]
			console.info(`Account: ${account.name} (${account.id})`)
			return { accountId: account.id, accountName: account.name }
		}

		// Multiple accounts, let user choose
		console.info(`Found ${accounts.length} accounts. Please select one:`)

		const accountChoices = accounts.map((acc) => ({
			name: `${acc.name} (${acc.id})`,
			value: { id: acc.id, name: acc.name }
		}))

		const accountAnswer = await inquirer.prompt([
			{
				type: "list",
				name: "account",
				message: "Select an account:",
				choices: accountChoices
			}
		])

		console.info(`Selected Account: ${accountAnswer.account.name} (${accountAnswer.account.id})`)
		return { accountId: accountAnswer.account.id, accountName: accountAnswer.account.name }
	}

	private async selectZone(zones: { id: string; name: string }[]) {
		if (zones.length === 1) {
			// Only one zone, use it automatically
			const zone = zones[0]
			console.info(`Zone: ${zone.name} (${zone.id})`)
			return { zoneId: zone.id, zoneName: zone.name }
		}

		// Multiple zones, let user choose
		console.info(`Found ${zones.length} zones. Please select one:`)

		const zoneChoices = zones.map((zone) => ({
			name: `${zone.name} (${zone.id})`,
			value: { id: zone.id, name: zone.name }
		}))

		const zoneAnswer = await inquirer.prompt([
			{
				type: "list",
				name: "zone",
				message: "Select a zone:",
				choices: zoneChoices
			}
		])

		console.info(`Selected Zone: ${zoneAnswer.zone.name} (${zoneAnswer.zone.id})`)
		return { zoneId: zoneAnswer.zone.id, zoneName: zoneAnswer.zone.name }
	}
}

class ConfigCommand extends Command {
	constructor() {
		super("config")
		this.description("Manage cgrok configuration")
		this.addCommand(new AddAuthTokenCommand())
	}
}

export const config = new ConfigCommand()
