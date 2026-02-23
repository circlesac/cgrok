import { Box, Text } from "ink"

interface StatusTableProps {
	rows: [string, string][]
}

export function StatusTable({ rows }: StatusTableProps) {
	const labelWidth = Math.max(...rows.map(([label]) => label.length)) + 2

	return (
		<Box flexDirection="column" marginTop={1}>
			{rows.map(([label, value]) => (
				<Box key={label}>
					<Text bold>{label.padEnd(labelWidth)}</Text>
					<Text>{value}</Text>
				</Box>
			))}
		</Box>
	)
}
