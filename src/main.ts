#!/usr/bin/env node

import { Command } from "commander"

import * as commands from "@/commands"
import packageJson from "../package.json" with { type: "json" }

const program = new Command()
program.name(packageJson.name)
program.description(packageJson.description)
program.version(packageJson.version)

for (const command of Object.values(commands)) {
	program.addCommand(command)
}

program.parse()
