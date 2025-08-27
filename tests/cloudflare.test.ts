import { promises as fs } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createConfigFile, generateTunnelSecret } from "@/utils/cloudflare"

describe("Cloudflare", () => {
	let testTunnelName: string
	let testTunnelId: string
	let testLocalUrl: string
	let testAccountId: string

	beforeEach(() => {
		testTunnelName = "test-tunnel"
		testTunnelId = "test-tunnel-id"
		testLocalUrl = "http://localhost:3000"
		testAccountId = "test-account-id"
	})

	afterEach(async () => {
		// Clean up temp directories created by createConfigFile
		try {
			const tempDir = join(tmpdir(), `cgrok-${testTunnelId}`)
			await fs.rm(tempDir, { recursive: true, force: true })
		} catch {
			// Ignore cleanup errors
		}
	})

	describe("createConfigFile", () => {
		it("should create config and credentials files in temp directory", async () => {
			const tunnelSecret = generateTunnelSecret()
			const configPath = createConfigFile(testTunnelName, testLocalUrl, testTunnelId, tunnelSecret, testAccountId)

			// Verify config file exists
			expect(
				await fs.access(configPath).then(
					() => true,
					() => false
				)
			).toBe(true)

			// Verify path is in temp directory
			expect(configPath).toContain(`cgrok-${testTunnelId}`)

			// Verify credentials file exists by reading the config and checking the credentials path
			const configContent = await fs.readFile(configPath, "utf-8")
			expect(configContent).toContain(`credentials-file:`)
			expect(configContent).toContain(`${testTunnelId}.json`)
		})

		it("should create valid YAML config file", async () => {
			const tunnelSecret = generateTunnelSecret()
			const configPath = createConfigFile(testTunnelName, testLocalUrl, testTunnelId, tunnelSecret, testAccountId)

			const configContent = await fs.readFile(configPath, "utf-8")

			expect(configContent).toContain(`tunnel: ${testTunnelId}`)
			expect(configContent).toContain(`credentials-file:`)
			expect(configContent).toContain(`${testTunnelId}.json`)
			expect(configContent).toContain(`hostname: ${testTunnelName}`)
			expect(configContent).toContain(`service: ${testLocalUrl}`)
			expect(configContent).toContain(`service: http_status:404`)
		})

		it("should create valid JSON credentials file", async () => {
			const tunnelSecret = generateTunnelSecret()
			const configPath = createConfigFile(testTunnelName, testLocalUrl, testTunnelId, tunnelSecret, testAccountId)

			// Read credentials path from config file
			const configContent = await fs.readFile(configPath, "utf-8")
			// Handle YAML multiline format: credentials-file: >-\n  /path/to/file
			const credentialsPathMatch = configContent.match(/credentials-file:\s*>-?\s*\n\s*(.+)/)
			expect(credentialsPathMatch).toBeTruthy()

			const credentialsPath = credentialsPathMatch![1].trim()
			const credentialsContent = await fs.readFile(credentialsPath, "utf-8")
			const credentials = JSON.parse(credentialsContent)

			expect(credentials).toEqual({
				AccountTag: testAccountId,
				TunnelSecret: tunnelSecret,
				TunnelID: testTunnelId
			})
		})

		it("should use full paths for credentials-file in config", async () => {
			const tunnelSecret = generateTunnelSecret()
			const configPath = createConfigFile(testTunnelName, testLocalUrl, testTunnelId, tunnelSecret, testAccountId)

			const configContent = await fs.readFile(configPath, "utf-8")
			expect(configContent).toContain(`cgrok-${testTunnelId}`)
			expect(configContent).toContain(`${testTunnelId}.json`)
		})

		it("should create unique temp directories for different tunnel IDs", async () => {
			const tunnelSecret1 = generateTunnelSecret()
			const tunnelSecret2 = generateTunnelSecret()
			const tunnelId1 = "tunnel-1"
			const tunnelId2 = "tunnel-2"

			const configPath1 = createConfigFile("tunnel1", testLocalUrl, tunnelId1, tunnelSecret1, testAccountId)

			const configPath2 = createConfigFile("tunnel2", testLocalUrl, tunnelId2, tunnelSecret2, testAccountId)

			expect(configPath1).toContain(`cgrok-${tunnelId1}`)
			expect(configPath2).toContain(`cgrok-${tunnelId2}`)
			expect(configPath1).not.toBe(configPath2)

			// Clean up
			await fs.rm(join(tmpdir(), `cgrok-${tunnelId1}`), { recursive: true, force: true })
			await fs.rm(join(tmpdir(), `cgrok-${tunnelId2}`), { recursive: true, force: true })
		})
	})

	describe("generateTunnelSecret", () => {
		it("should generate unique secrets", () => {
			const secret1 = generateTunnelSecret()
			const secret2 = generateTunnelSecret()

			expect(secret1).not.toBe(secret2)
			expect(secret1).toMatch(/^[A-Za-z0-9+/=]+$/) // Base64 pattern
			expect(secret2).toMatch(/^[A-Za-z0-9+/=]+$/) // Base64 pattern
		})

		it("should generate secrets of correct length", () => {
			const secret = generateTunnelSecret()
			// 32 bytes = 44 characters in base64 (with padding)
			expect(secret.length).toBe(44)
		})
	})
})
