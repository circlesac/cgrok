export function parseLocalUrl(value: string) {
	// Support full URLs: https://localhost:8443, http://servername:3000
	if (value.startsWith("http://") || value.startsWith("https://")) {
		new URL(value) // validate
		return value
	}

	let host: string
	let port: number

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
