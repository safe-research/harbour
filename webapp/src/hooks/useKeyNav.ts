import { useState } from "react";

/**
 * Hook for keyboard navigation in lists
 */
export function useKeyNav(listLength: number) {
	const [index, setIndex] = useState(-1);

	const onKey = (e: React.KeyboardEvent) => {
		if (!listLength) return;
		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				setIndex((i) => (i + 1) % listLength);
				break;
			case "ArrowUp":
				e.preventDefault();
				setIndex((i) => (i - 1 + listLength) % listLength);
				break;
			case "Escape":
				setIndex(-1);
				break;
		}
	};

	return {
		index,
		onKey,
		reset: () => setIndex(-1),
	};
}
