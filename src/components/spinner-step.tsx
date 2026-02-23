import { Text } from "ink"
import Spinner from "ink-spinner"

interface SpinnerStepProps {
	label: string
	status: "pending" | "running" | "success" | "error"
	error?: string
}

export function SpinnerStep({ label, status, error }: SpinnerStepProps) {
	if (status === "pending") return null

	if (status === "running") {
		return (
			<Text>
				<Text color="yellow">
					<Spinner type="dots" />
				</Text>
				<Text> {label}</Text>
			</Text>
		)
	}

	if (status === "success") {
		return (
			<Text>
				<Text color="green">✔</Text>
				<Text> {label}</Text>
			</Text>
		)
	}

	return (
		<>
			<Text>
				<Text color="red">✖</Text>
				<Text> {label}</Text>
			</Text>
			{error && <Text color="red"> {error}</Text>}
		</>
	)
}
