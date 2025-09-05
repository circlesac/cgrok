import { build } from "bun"
import packageJson from "./package.json" with { type: "json" }

console.info("Building...")

// Get external dependencies from package.json
const external = Object.keys(packageJson.dependencies || {})
console.info(`External dependencies: ${external.join(", ")}`)

const result = await build({
	entrypoints: ["src/main.ts"],
	outdir: "dist",
	target: "node",
	format: "esm",
	minify: true,
	sourcemap: "external",
	external
})

if (result.success) {
	console.info("Build successful!")
} else {
	console.error("Build failed!")
}
