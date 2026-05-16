import { generateEphemeralName, tunnelNameForHostname } from "@/utils/cloudflare"

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

	describe("tunnelNameForHostname", () => {
		it("should create a stable tunnel name from a hostname", () => {
			expect(tunnelNameForHostname("Dub-Dev.crcl.es")).toBe("cgrok-dub-dev-crcl-es")
		})

		it("should cap long tunnel names and add a stable hash", () => {
			const hostname = `${"a".repeat(80)}.crcl.es`
			const name = tunnelNameForHostname(hostname)

			expect(name).toHaveLength(64)
			expect(name).toMatch(/^cgrok-a+-[a-f0-9]{8}$/)
			expect(tunnelNameForHostname(hostname)).toBe(name)
		})
	})
})
