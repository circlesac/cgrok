import { promises as fs } from "fs"
import { tmpdir } from "os"
import { join } from "path"

import { loadConfig } from "@/utils/config"

describe("loadConfig", () => {
	let configDir: string

	beforeEach(async () => {
		configDir = join(tmpdir(), `cgrok-config-test-${Date.now()}`)
		await fs.mkdir(configDir, { recursive: true })
	})

	afterEach(async () => {
		await fs.rm(configDir, { recursive: true, force: true }).catch(() => {})
	})

	it("should throw when config file does not exist", () => {
		expect(() => loadConfig(configDir)).toThrow("cgrok is not configured")
	})

	it("should throw when config file has missing fields", async () => {
		await fs.writeFile(join(configDir, "config.json"), JSON.stringify({ apiToken: "tok" }))
		expect(() => loadConfig(configDir)).toThrow("Invalid configuration")
	})

	it("should load valid config", async () => {
		await fs.writeFile(join(configDir, "config.json"), JSON.stringify({ apiToken: "tok789", accountId: "acc456" }))

		const config = loadConfig(configDir)
		expect(config.apiToken).toBe("tok789")
		expect(config.accountId).toBe("acc456")
		expect(config.tunnelName).toMatch(/^cgrok-/)
	})
})
