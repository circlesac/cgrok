import sharedConfig from "@piondev/shared-configs/eslint"

export default [
	...sharedConfig,
	{
		ignores: ["dist/", "node_modules/"],
		rules: {
			"no-console": "off", // Allow console statements for CLI applications
			"@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }]
		}
	}
]
