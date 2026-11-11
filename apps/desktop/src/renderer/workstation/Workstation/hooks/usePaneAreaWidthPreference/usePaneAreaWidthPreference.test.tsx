import { afterEach, expect, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import type { DirectWorkstationApi } from "shared/direct-workstation";
import type { WorkstationPreferenceSnapshot } from "shared/workstation-preferences";
import { useWorkstationPreferences } from "../useWorkstationPreferences";
import { usePaneAreaWidthPreference } from "./usePaneAreaWidthPreference";

afterEach(cleanup);
function initial(): WorkstationPreferenceSnapshot {
	return {
		revision: 0,
		invalid: false,
		values: {
			agentNativeInputEnabled: false,
			language: null,
			themeId: "dark",
			fontSettings: {},
			fileOpenMode: "split-pane",
			fileAutoSave: "off",
			confirmOnQuit: true,
			terminalCopyOnSelect: false,
		},
	};
}
test("width waits for other settings and coalesces gestures to the latest explicit value", async () => {
	let saved = initial();
	const gate = Promise.withResolvers<void>();
	const widthGate = Promise.withResolvers<void>();
	const calls: unknown[] = [];
	const api: DirectWorkstationApi = {
		getPreferences: async () => saved,
		updatePreferences: async (input) => {
			calls.push(input);
			if (calls.length === 1) await gate.promise;
			if (calls.length === 2) await widthGate.promise;
			expect(input.expectedRevision).toBe(saved.revision);
			saved = {
				...saved,
				revision: saved.revision + 1,
				values: { ...saved.values, ...input.patch },
			};
			return saved;
		},
	} as DirectWorkstationApi;
	const errors: string[] = [];
	const view = renderHook(
		() => {
			const preferences = useWorkstationPreferences(api);
			return {
				preferences,
				width: usePaneAreaWidthPreference(preferences, true, (e) =>
					errors.push(e),
				),
			};
		},
		{ wrapper: StrictMode },
	);
	await waitFor(() =>
		expect(view.result.current.preferences.snapshot).not.toBeNull(),
	);
	let other: Promise<unknown> | undefined;
	act(() => {
		other = view.result.current.preferences.update({ language: "ja" });
	});
	act(() => {
		view.result.current.width.commit?.(500);
		view.result.current.width.commit?.(620);
	});
	expect(view.result.current.width.width).toBe(620);
	expect(calls).toHaveLength(1);
	await act(async () => {
		gate.resolve();
		await other;
	});
	await waitFor(() => expect(calls).toHaveLength(2));
	act(() => {
		view.result.current.width.commit?.(640);
		view.result.current.width.commit?.(680);
	});
	expect(calls).toHaveLength(2);
	await act(async () => {
		widthGate.resolve();
	});
	await waitFor(() => expect(saved.values.rightPaneAreaWidth).toBe(680));
	expect(calls).toEqual([
		{ expectedRevision: 0, patch: { language: "ja" } },
		{ expectedRevision: 1, patch: { rightPaneAreaWidth: 620 } },
		{ expectedRevision: 2, patch: { rightPaneAreaWidth: 680 } },
	]);
	expect(saved.values.language).toBe("ja");
	expect(errors).toEqual([]);
});
test("an unknown width reply is not retried and a later explicit gesture can save", async () => {
	let saved = initial(),
		calls = 0;
	const errors: string[] = [];
	const api = {
		getPreferences: async () => saved,
		updatePreferences: async (input: {
			expectedRevision: number;
			patch: { rightPaneAreaWidth?: number };
		}) => {
			expect(input.expectedRevision).toBe(saved.revision);
			saved = {
				...saved,
				revision: saved.revision + 1,
				values: { ...saved.values, ...input.patch },
			};
			if (++calls === 1) throw new Error("Unknown reply");
			return saved;
		},
	} as DirectWorkstationApi;
	const view = renderHook(
		() =>
			usePaneAreaWidthPreference(useWorkstationPreferences(api), true, (e) =>
				errors.push(e),
			),
		{ wrapper: StrictMode },
	);
	await act(async () => {});
	act(() => view.result.current.commit?.(500));
	await waitFor(() => expect(errors).toEqual(["Unknown reply"]));
	await act(async () => {});
	expect(calls).toBe(1);
	expect(view.result.current.width).toBe(500);
	act(() => view.result.current.commit?.(640));
	await waitFor(() => expect(calls).toBe(2));
	await waitFor(() => expect(view.result.current.width).toBe(640));
});
