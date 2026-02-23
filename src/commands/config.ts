import { Command } from "commander"
import { render } from "ink"
import React from "react"

import { ConfigApp } from "@/components/config-app"
import { BaseCommand } from "@/utils/base"

class AddAuthTokenCommand extends BaseCommand {
	constructor() {
		super("add-authtoken")
		this.description("Add Cloudflare API token")
		this.argument("<auth-token>", "Cloudflare API token")
	}

	protected async execute(authToken: string) {
		const { waitUntilExit } = render(React.createElement(ConfigApp, { authToken }))
		await waitUntilExit()
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
