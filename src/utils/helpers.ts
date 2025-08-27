import { createSpinner } from "nanospinner"

export function generateEphemeralName() {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
	let result = ""
	for (let i = 0; i < 12; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length))
	}
	return result
}

export function parseLocalUrl(value: string) {
	let host
	let port

	if (value.includes(":")) {
		// Format: "host:port"
		const [_host, _port] = value.split(":")
		host = _host
		port = +_port
	} else if (isNaN(+value)) {
		host = value
		port = 80
	} else {
		host = "localhost"
		port = +value
	}

	if (isNaN(port) || port < 1 || port > 65535) {
		throw new Error("Invalid port number. Must be between 1 and 65535.")
	}

	const url = `http://${host}:${port}`
	new URL(url)

	return url
}

type Spinner = ReturnType<typeof createSpinner>
type Options = Parameters<typeof createSpinner>[1]

export async function spinner<T>(func: (spinner: Spinner) => Promise<T>, options?: Options) {
	const spinner = createSpinner(options?.text, options).start()
	let manualCompletion = false

	// tracks manual completion calls
	const proxySpinner = new Proxy(spinner, {
		get(target, prop) {
			if (prop === "success" || prop === "error" || prop === "warn") {
				manualCompletion = true
			}
			return target[prop as keyof Spinner]
		}
	})

	try {
		const result = await func(proxySpinner)
		if (!manualCompletion) spinner.success()
		return result
	} catch (error) {
		if (!manualCompletion) spinner.error()
		throw error
	}
}
