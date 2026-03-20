import { parseLocalUrl } from "@/utils/helpers"

describe("parseLocalUrl", () => {
	it("should parse a port number", () => {
		expect(parseLocalUrl("3000")).toBe("http://localhost:3000")
	})

	it("should parse host:port", () => {
		expect(parseLocalUrl("127.0.0.1:8080")).toBe("http://127.0.0.1:8080")
	})

	it("should default to port 80 for a hostname", () => {
		expect(parseLocalUrl("myhost")).toBe("http://myhost:80")
	})

	it("should throw on invalid port", () => {
		expect(() => parseLocalUrl("99999")).toThrow("Invalid port number")
	})

	it("should throw on port 0", () => {
		expect(() => parseLocalUrl("0")).toThrow("Invalid port number")
	})

	it("should throw on negative port", () => {
		expect(() => parseLocalUrl("localhost:-1")).toThrow("Invalid port number")
	})

	it("should accept port 1", () => {
		expect(parseLocalUrl("1")).toBe("http://localhost:1")
	})

	it("should accept port 65535", () => {
		expect(parseLocalUrl("65535")).toBe("http://localhost:65535")
	})

	it("should accept http:// URL", () => {
		expect(parseLocalUrl("http://localhost:3000")).toBe("http://localhost:3000")
	})

	it("should accept https:// URL", () => {
		expect(parseLocalUrl("https://localhost:8443")).toBe("https://localhost:8443")
	})

	it("should accept https:// URL with hostname", () => {
		expect(parseLocalUrl("https://servername.local:9000")).toBe("https://servername.local:9000")
	})

	it("should throw on invalid URL", () => {
		expect(() => parseLocalUrl("http://")).toThrow()
	})
})
