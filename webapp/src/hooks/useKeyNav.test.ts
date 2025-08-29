import { act, renderHook } from "@testing-library/react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { describe, expect, it } from "vitest";
import { useKeyNav } from "./useKeyNav";

// Create a real DOM KeyboardEvent and retype it to React's KeyboardEvent
// This is so the event has a proper type and we don't have to use 'any' type which the linter doesn't like.
const reactKeyEvt = (key: string): ReactKeyboardEvent<Element> => {
	const e = new KeyboardEvent("keydown", { key });
	return e as unknown as ReactKeyboardEvent<Element>;
};

describe("useKeyNav", () => {
	it("starts with index -1", () => {
		const { result } = renderHook(() => useKeyNav(3));
		expect(result.current.index).toBe(-1);
	});

	it("ArrowDown increments index and wraps", () => {
		const { result } = renderHook(() => useKeyNav(3));

		act(() => result.current.onKey(reactKeyEvt("ArrowDown")));
		expect(result.current.index).toBe(0);

		act(() => result.current.onKey(reactKeyEvt("ArrowDown")));
		expect(result.current.index).toBe(1);

		act(() => result.current.onKey(reactKeyEvt("ArrowDown")));
		expect(result.current.index).toBe(2);

		act(() => result.current.onKey(reactKeyEvt("ArrowDown")));
		expect(result.current.index).toBe(0);
	});

	it("ArrowUp decrements index and wraps", () => {
		const { result } = renderHook(() => useKeyNav(3));

		act(() => result.current.onKey(reactKeyEvt("ArrowUp")));
		expect(result.current.index).toBe(1);
		act(() => result.current.onKey(reactKeyEvt("ArrowUp")));
		expect(result.current.index).toBe(0);
	});

	it("Escape resets index to -1", () => {
		const { result } = renderHook(() => useKeyNav(3));

		act(() => result.current.onKey(reactKeyEvt("ArrowDown")));
		expect(result.current.index).toBe(0);
		act(() => result.current.onKey(reactKeyEvt("Escape")));

		act(() => {
			result.current.onKey({
				key: "ArrowDown",
				preventDefault: () => {},
			} as any);
		});
		expect(result.current.index).toBe(0);
		act(() => {
			result.current.onKey({ key: "Escape", preventDefault: () => {} } as any);
		});

		expect(result.current.index).toBe(-1);
	});

	it("reset sets index to -1", () => {
		const { result } = renderHook(() => useKeyNav(3));

		act(() => result.current.onKey(reactKeyEvt("ArrowDown")));
		expect(result.current.index).toBe(0);
		act(() => result.current.reset());
		expect(result.current.index).toBe(-1);
	});

	it("does nothing if listLength is 0", () => {
		const { result } = renderHook(() => useKeyNav(0));

		act(() => result.current.onKey(reactKeyEvt("ArrowDown")));

		expect(result.current.index).toBe(-1);
	});
});
