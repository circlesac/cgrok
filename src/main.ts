#!/usr/bin/env node

import { Command } from "commander"

import * as commands from "@/commands"
import packageJson from "../package.json" with { type: "json" }
import { checkForUpdate } from "./lib/update-check.ts"

await checkForUpdate()

const program = new Command()
program.name(packageJson.name)
program.description(packageJson.description)
program.version(packageJson.version)

for (const command of Object.values(commands)) {
	program.addCommand(command)
}

// ngrok-compatible "version" subcommand
program
	.command("version")
	.description("Print the version string")
	.action(() => {
		process.stdout.write(`cgrok ${packageJson.version}\n`)
	})

program.parse()
