import { Text } from "ink"
import SelectInput from "ink-select-input"

interface SelectListProps<T> {
	message: string
	items: { label: string; value: T }[]
	onSelect: (value: T) => void
}

export function SelectList<T>({ message, items, onSelect }: SelectListProps<T>) {
	return (
		<>
			<Text>{message}</Text>
			<SelectInput items={items} onSelect={(item) => onSelect(item.value)} />
		</>
	)
}
