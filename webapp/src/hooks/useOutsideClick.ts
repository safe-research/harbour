import { useEffect } from "react";

/**
 * Hook that calls handler when user clicks outside of any of the provided refs
 */
export function useOutsideClick(refs: React.RefObject<HTMLElement | null>[], handler: () => void) {
	useEffect(() => {
		const listener = (e: MouseEvent) => {
			if (refs.some((r) => r.current?.contains(e.target as Node))) return;
			handler();
		};
		document.addEventListener("mousedown", listener);
		return () => document.removeEventListener("mousedown", listener);
	}, [refs, handler]);
}
