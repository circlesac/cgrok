import { promises as fs } from "fs"
import { tmpdir } from "os"
import { join } from "path"

import { Config } from "@/utils/config"

describe("Config", () => {
	let tempDir: string

	beforeEach(async () => {
		tempDir = join(tmpdir(), `cgrok-config-test-${Date.now()}`)
		await fs.mkdir(tempDir, { recursive: true })
	})

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
	})

	describe("save and load", () => {
		it("should save and load config", async () => {
			const data = { auth_token: "tok", account_id: "acc", zone_id: "zone" }
			await Config.from(tempDir).save(data)

			const config = await Config.from(tempDir).load()
			expect(config.auth_token).toBe("tok")
			expect(config.account_id).toBe("acc")
			expect(config.zone_id).toBe("zone")
		})

		it("should create config directory if it does not exist", async () => {
			const nested = join(tempDir, "a", "b")
			const data = { auth_token: "t", account_id: "a", zone_id: "z" }
			await Config.from(nested).save(data)

			const config = await Config.from(nested).load()
			expect(config.auth_token).toBe("t")
		})
	})

	describe("load errors", () => {
		it("should throw when config file does not exist", async () => {
			const missing = join(tempDir, "nope")
			await expect(Config.from(missing).load()).rejects.toThrow("Configuration file not found")
		})

		it("should throw when config file contains invalid JSON", async () => {
			await fs.writeFile(join(tempDir, "cgrok.json"), "not json")
			await expect(Config.from(tempDir).load()).rejects.toThrow("Failed to parse configuration file")
		})

		it("should throw when required fields are missing", async () => {
			await fs.writeFile(join(tempDir, "cgrok.json"), JSON.stringify({ auth_token: "t" }))
			await expect(Config.from(tempDir).load()).rejects.toThrow("missing required fields")
		})
	})
})
