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
