import { appendFile, mkdir } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"

export class Logger {
	private static instance: Logger
	private _logFilePath: string
	private ready: Promise<void>

	static getInstance() {
		if (!Logger.instance) {
			Logger.instance = new Logger()
		}
		return Logger.instance
	}

	private constructor() {
		const logDir = join(tmpdir(), "cgrok-logs")
		this._logFilePath = join(logDir, `cloudflared-${Date.now()}.log`)
		this.ready = mkdir(logDir, { recursive: true }).then(() => {})
	}

	get cloudflared() {
		return {
			log: (data: string) => {
				this.ready.then(() => appendFile(this._logFilePath, `${data}\n`)).catch(() => {})
			},
			path: this._logFilePath
		}
	}
}

export const logger = Logger.getInstance()
