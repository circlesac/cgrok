import { Command } from "commander"
import { BaseCommand } from "@/utils/base"
import { saveAuthToken } from "@/utils/config"

class AddAuthTokenCommand extends BaseCommand {
	constructor() {
		super("add-authtoken")
		this.description("Save a Cloudflare API token (requires Zone DNS Edit, Tunnel Edit, Zone Read)")
		this.argument("<token>", "Cloudflare API token")
		this.requiredOption("--account <account>", "Cloudflare account ID or name")
	}

	protected async execute(token: string, options: { account?: string }) {
		process.stdout.write("Validating token permissions...\n")
		await saveAuthToken(token, options.account)
		process.stdout.write("Token saved successfully! You can now use 'cgrok http <port>'.\n")
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
