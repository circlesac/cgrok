import { createHash } from "crypto"
import type { Header, Options } from "tty-table"
import TtyTable from "tty-table"

export class Table {
	private data: (string[] | object)[] = []
	private lastRenderedLines = 0

	private _render?: Promise<void>
	private _hash?: string

	constructor(
		private columnCount: number,
		private options?: Options
	) {}

	push(...rows: (string[] | object)[]) {
		this.data.push(...rows)
	}

	clear() {
		this.data = []
	}

	async render() {
		if (this._render) return this._render

		return (this._render = new Promise<void>((resolve) => {
			do {
				if (this._hash == this.hash()) resolve()

				this._hash = this.hash()
				this.renderInternal()
			} while (this._hash != this.hash())

			resolve()
			this._render = undefined
		}))
	}

	private renderInternal() {
		// clear
		if (this.lastRenderedLines > 0) {
			process.stdout.write(`\x1B[${this.lastRenderedLines}A\x1B[0J`)
		}

		// render
		const table = this.create()
		const output = table.render()
		const cleaned = this.clean(output)

		console.info(cleaned)
		this.lastRenderedLines = cleaned.split("\n").length
	}

	private create() {
		const headers: Header[] = Array.from({ length: this.columnCount }, () => ({
			value: "",
			align: "left",
			paddingLeft: 0,
			paddingRight: 0,
			marginLeft: 0,
			width: "auto"
		}))

		return TtyTable(headers, this.data, {
			borderStyle: "none",
			compact: true,
			...this.options
		})
	}

	private clean(tableOutput: string) {
		return tableOutput
			.split("\n")
			.map((line) => line.replace(/^\s+/, ""))
			.filter((line) => line.trim() !== "")
			.join("\n")
	}

	private hash() {
		const dataString = JSON.stringify(this.data)
		return createHash("md5").update(dataString).digest("hex")
	}
}
