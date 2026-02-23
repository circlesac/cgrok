import { Command } from "commander"

export abstract class BaseCommand extends Command {
	constructor(name: string) {
		super(name)
		this.action(this.executeInternal.bind(this))
	}

	private async executeInternal(...args: unknown[]) {
		try {
			await this.execute(...args)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			process.stderr.write(`\nFatal error: ${message}\n`)
			process.exit(1)
		}
	}

	protected abstract execute(...args: unknown[]): Promise<void> | void
}
