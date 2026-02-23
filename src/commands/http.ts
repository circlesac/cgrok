import { render } from "ink"
import React from "react"

import { HttpApp } from "@/components/http-app"
import { BaseCommand } from "@/utils/base"

class HttpCommand extends BaseCommand {
	constructor() {
		super("http")
		this.description("Start HTTP tunnel")
		this.argument("<address:port|port>", "Local endpoint: port (e.g., 8080) or address:port (e.g., localhost:3000)")
		this.option("-u, --url <url>", "Custom tunnel URL (e.g., myapp.example.com)")
		this.option("-f, --force", "Force overwrite DNS record even if it exists")
		this.option("--debug", "Enable debug logging")
	}

	protected async execute(endpoint: string, options: { url?: string; force?: boolean; debug?: boolean }) {
		const { waitUntilExit } = render(React.createElement(HttpApp, { endpoint, options }))
		await waitUntilExit()
	}
}

export const http = new HttpCommand()
