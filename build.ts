#!/usr/bin/env bun

// @ts-expect-error - Bun types
import { build } from "bun"

console.log("Building cgrok...")

const result = await build({
	entrypoints: ["src/main.ts"],
	outdir: "dist",
	target: "node",
	format: "esm",
	minify: false,
	sourcemap: "external",
	external: ["commander", "cloudflare", "chalk", "inquirer"],
	preserveEntrySignatures: "strict"
})

if (result.success) {
	console.log("Build successful!")
} else {
	console.error("Build failed!")
	process.exit(1)
}
