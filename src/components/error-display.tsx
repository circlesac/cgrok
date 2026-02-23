import { Box, Text } from "ink"

interface ErrorDisplayProps {
	error: Error | string
	command?: string
}

export function ErrorDisplay({ error, command }: ErrorDisplayProps) {
	const isError = error instanceof Error
	const message = isError ? error.message : String(error)
	const stack = isError ? error.stack : undefined
	const cause = isError && error.cause ? String(error.cause) : undefined

	return (
		<Box flexDirection="column" marginTop={1}>
			<Text>
				<Text color="red" bold>
					Error:{" "}
				</Text>
				<Text color="red">{message}</Text>
			</Text>

			{stack && (
				<Box marginTop={1}>
					<Text color="red" dimColor>
						{stack}
					</Text>
				</Box>
			)}

			{cause && (
				<Box marginTop={1}>
					<Text>
						<Text color="red" bold>
							Caused by:{" "}
						</Text>
						<Text color="red">{cause}</Text>
					</Text>
				</Box>
			)}

			{command && (
				<Box marginTop={1}>
					<Text>
						<Text color="red" bold>
							Command:{" "}
						</Text>
						<Text color="red">{command}</Text>
					</Text>
				</Box>
			)}
		</Box>
	)
}
