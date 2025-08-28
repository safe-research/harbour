import { renderHook } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";

import { useOutsideClick } from "./useOutsideClick";

describe("useOutsideClick", () => {
	it("calls handler when clicking outside refs", () => {
		const handler = vi.fn();
		const ref1 = {
			current: document.createElement("div"),
		} as React.RefObject<HTMLElement>;
		const ref2 = {
			current: document.createElement("div"),
		} as React.RefObject<HTMLElement>;
		if (ref1.current) {
			document.body.appendChild(ref1.current);
		}
		if (ref2.current) {
			document.body.appendChild(ref2.current);
		}
		renderHook(() => useOutsideClick([ref1, ref2], handler));

		// Simulate click outside
		const outside = document.createElement("div");
		document.body.appendChild(outside);
		outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
		expect(handler).toHaveBeenCalled();
	});

	it("does not call handler when clicking inside any ref", () => {
		const handler = vi.fn();
		const ref1 = {
			current: document.createElement("div"),
		} as React.RefObject<HTMLElement>;
		if (ref1.current) {
			document.body.appendChild(ref1.current);
		}
		renderHook(() => useOutsideClick([ref1], handler));

		// Simulate click inside
		ref1.current?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
		expect(handler).not.toHaveBeenCalled();
	});
});
