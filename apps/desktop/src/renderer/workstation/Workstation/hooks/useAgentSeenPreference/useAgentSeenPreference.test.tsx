import { afterEach, expect, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import type { DirectWorkstationApi } from "shared/direct-workstation";
import type { WorkstationPreferenceSnapshot } from "shared/workstation-preferences";
import { useWorkstationPreferences } from "../useWorkstationPreferences";
import { useAgentSeenPreference } from "./useAgentSeenPreference";

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
function fixture(gate?: (call: number) => Promise<void>) {
	let saved = initial();
	const calls: unknown[] = [],
		errors: string[] = [];
	const api = {
		getPreferences: async () => saved,
		updatePreferences: async (input: {
			expectedRevision: number;
			patch: object;
		}) => {
			calls.push(input);
			await gate?.(calls.length);
			expect(input.expectedRevision).toBe(saved.revision);
			saved = {
				...saved,
				revision: saved.revision + 1,
				values: { ...saved.values, ...input.patch },
			};
			return saved;
		},
	} as DirectWorkstationApi;
	const view = renderHook(
		() => {
			const preferences = useWorkstationPreferences(api);
			return {
				preferences,
				seen: useAgentSeenPreference(preferences, true, (e) => errors.push(e)),
			};
		},
		{ wrapper: StrictMode },
	);
	return { view, calls, errors };
}
const mark = (key: string, at: number) => ({ key: key.repeat(64), at });
test("seen marks wait for unrelated settings and coalesce to host timestamps", async () => {
	const gate = Promise.withResolvers<void>(),
		f = fixture((n) => (n === 1 ? gate.promise : Promise.resolve()));
	await waitFor(() =>
		expect(f.view.result.current.preferences.snapshot).not.toBeNull(),
	);
	let other: Promise<unknown> | undefined;
	act(() => {
		other = f.view.result.current.preferences.update({ language: "ja" });
	});
	act(() => {
		f.view.result.current.seen.commit?.(mark("a", 1));
		f.view.result.current.seen.commit?.(mark("a", 3));
		f.view.result.current.seen.commit?.(mark("b", 2));
	});
	expect(f.calls).toHaveLength(1);
	await act(async () => {
		gate.resolve();
		await other;
	});
	await waitFor(() =>
		expect(f.view.result.current.seen.marks).toEqual([
			mark("a", 3),
			mark("b", 2),
		]),
	);
	expect(f.calls).toHaveLength(2);
	expect(f.view.result.current.preferences.snapshot?.values.language).toBe(
		"ja",
	);
	expect(f.errors).toEqual([]);
});
test("newer acknowledgments arriving during a save merge against its accepted snapshot", async () => {
	const gate = Promise.withResolvers<void>(),
		f = fixture((n) => (n === 1 ? gate.promise : Promise.resolve()));
	await waitFor(() =>
		expect(f.view.result.current.preferences.snapshot).not.toBeNull(),
	);
	act(() => f.view.result.current.seen.commit?.(mark("a", 10)));
	act(() => {
		f.view.result.current.seen.commit?.(mark("a", 11));
		f.view.result.current.seen.commit?.(mark("b", 1));
	});
	await act(async () => {
		gate.resolve();
	});
	await waitFor(() =>
		expect(f.view.result.current.seen.marks).toEqual([
			mark("a", 11),
			mark("b", 1),
		]),
	);
	expect(f.calls).toHaveLength(2);
	expect(f.errors).toEqual([]);
});
test("unknown save replies are not retried by repeated status polling", async () => {
	const f = fixture(async () => {
		throw Error("Unknown reply");
	});
	await waitFor(() =>
		expect(f.view.result.current.preferences.snapshot).not.toBeNull(),
	);
	act(() => f.view.result.current.seen.commit?.(mark("a", 1)));
	await waitFor(() => expect(f.errors).toHaveLength(1));
	act(() => f.view.result.current.seen.commit?.(mark("a", 1)));
	expect(f.calls).toHaveLength(1);
	expect(f.view.result.current.seen.marks).toEqual([]);
	act(() => f.view.result.current.seen.commit?.(mark("a", 2)));
	await waitFor(() => expect(f.errors).toHaveLength(2));
	expect(f.calls).toHaveLength(2);
});
test("StrictMode and unmount do not replay an in-flight acknowledgement or dispatch queued work", async () => {
	const gate = Promise.withResolvers<void>(),
		f = fixture(() => gate.promise);
	await waitFor(() =>
		expect(f.view.result.current.preferences.snapshot).not.toBeNull(),
	);
	act(() => {
		f.view.result.current.seen.commit?.(mark("a", 1));
		f.view.result.current.seen.commit?.(mark("a", 1));
		f.view.result.current.seen.commit?.(mark("b", 2));
	});
	expect(f.calls).toHaveLength(1);
	f.view.unmount();
	await act(async () => {
		gate.resolve();
	});
	expect(f.calls).toHaveLength(1);
	expect(f.errors).toEqual([]);
});
