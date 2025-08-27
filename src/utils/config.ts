import { homedir } from "os"
import { join } from "path"
import { $trycatch } from "@tszen/trycatch"
import { access, mkdir, readFile, stat, writeFile } from "fs/promises"

interface CgrokConfig {
	auth_token: string
	account_id: string
	zone_id: string
}

export class Config {
	auth_token!: string
	account_id!: string
	zone_id!: string

	private constructor(public configDir: string) {}

	private get configFilePath() {
		return join(this.configDir, "cgrok.json")
	}

	// Static factory method - returns load and save functions
	static from(configDir: string = join(homedir(), ".config", "cgrok")) {
		return {
			async load() {
				const config = new Config(configDir)
				await config.load()
				return config
			},
			async save(value: CgrokConfig) {
				const config = new Config(configDir)
				config.auth_token = value.auth_token
				config.account_id = value.account_id
				config.zone_id = value.zone_id
				await config.save()
				return config
			}
		}
	}

	// Save config to file
	async save() {
		// Ensure directory exists before saving
		try {
			const stats = await stat(this.configDir)
			if (!stats.isDirectory()) {
				throw new Error(`Path ${this.configDir} exists but is not a directory`)
			}
		} catch {
			// Path doesn't exist, create it
			await mkdir(this.configDir, { recursive: true })
		}

		await writeFile(
			this.configFilePath,
			JSON.stringify(
				{
					auth_token: this.auth_token,
					account_id: this.account_id,
					zone_id: this.zone_id
				},
				null,
				2
			)
		)
	}

	// Private method to load config from file
	private async load() {
		// Check if file exists
		const [, accessError] = await $trycatch(async () => await access(this.configFilePath))
		if (accessError) {
			throw new Error(`Configuration file not found at: ${this.configFilePath}\nPlease run 'cgrok config add-authtoken <token>' to create a new configuration.`)
		}

		// Read file content
		const [configData, readError] = await $trycatch(async () => await readFile(this.configFilePath, "utf-8"))
		if (readError) {
			throw new Error(`Failed to read configuration file: ${this.configFilePath}\nThis could be due to permission issues or the file being locked.`)
		}

		// Parse JSON
		const [loadedConfig, parseError] = await $trycatch(() => JSON.parse(configData))
		if (parseError) {
			throw new Error(`Failed to parse configuration file: ${this.configFilePath}\nThe file appears to contain invalid JSON. Please check the file format.`)
		}

		const { auth_token, account_id, zone_id } = loadedConfig

		// Validate required fields
		if (!auth_token || !account_id || !zone_id) {
			throw new Error(
				`Configuration file is missing required fields: ${this.configFilePath}\nPlease run 'cgrok config add-authtoken <token>' to create a valid configuration.`
			)
		}

		// Set properties
		this.auth_token = auth_token
		this.account_id = account_id
		this.zone_id = zone_id
	}
}
