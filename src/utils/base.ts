import { Command } from "commander"

import { logger } from "./logger"

export abstract class BaseCommand extends Command {
	constructor(name: string) {
		super(name)
		this.action(this.executeInternal.bind(this))
	}

	private async executeInternal(...args: unknown[]) {
		try {
			await this.execute(...args)
		} catch (error) {
			this.logError(error)
		}
	}

	private logError(...errors: unknown[]) {
		console.error()

		for (const error of errors) {
			if (error instanceof Error) {
				logger.error("Error", error.message)

				if (error.stack) {
					console.error()
					logger.error("Stack trace", error.stack)
				}

				if (error.cause) {
					console.error()
					logger.error("Caused by", String(error.cause))
				}
			} else {
				logger.error("Message", String(error))
			}
		}

		console.error()
		logger.error("Command", this.name())
		logger.error("Time", Date.now().toString())
	}

	protected abstract execute(...args: unknown[]): Promise<void> | void
}
