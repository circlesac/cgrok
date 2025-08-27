import { appendFileSync, existsSync, mkdirSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import chalk from "chalk"

export class Logger {
	private static instance: Logger
	private _logFilePath: string

	static getInstance(): Logger {
		if (!Logger.instance) {
			Logger.instance = new Logger()
		}
		return Logger.instance
	}

	private constructor() {
		// Create log file in temp directory
		const logDir = join(tmpdir(), "cgrok-logs")
		if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })

		this._logFilePath = join(logDir, `cloudflared-${Date.now()}.log`)
	}

	get cloudflared() {
		return {
			log: (data: string) => {
				try {
					appendFileSync(this._logFilePath, `${data}\n`)
				} catch {}
			},
			path: this._logFilePath
		}
	}

	error(title: string, message: string) {
		const multiline = message.includes("\n")
		if (multiline) {
			console.error(`${chalk.red(title)}:\n${message}`)
		} else {
			console.error(`${chalk.red(title)}: ${message}`)
		}
	}
}

export const logger = Logger.getInstance()
