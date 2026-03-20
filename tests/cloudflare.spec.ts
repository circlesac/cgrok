import { generateEphemeralName } from "@/utils/cloudflare"

describe("Cloudflare", () => {
	describe("generateEphemeralName", () => {
		it("should generate a 12-character hex string", () => {
			const name = generateEphemeralName()
			expect(name).toHaveLength(12)
			expect(name).toMatch(/^[a-f0-9]+$/)
		})

		it("should generate unique names", () => {
			const names = new Set(Array.from({ length: 10 }, () => generateEphemeralName()))
			expect(names.size).toBe(10)
		})
	})
})
