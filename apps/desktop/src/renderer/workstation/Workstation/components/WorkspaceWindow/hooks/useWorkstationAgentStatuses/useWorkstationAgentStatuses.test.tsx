import { afterEach, expect, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import type {
	DirectDescriptor,
	DirectWorkstationApi,
} from "shared/direct-workstation";
import type { WorkspaceViewV3 } from "shared/workspace-view-v3";
import {
	type WorkstationAgentSeenMark,
	workstationAgentSeenKey,
} from "shared/workstation-agent-seen";
import { useWorkstationAgentStatuses } from "./useWorkstationAgentStatuses";

afterEach(cleanup);
const connection: DirectDescriptor = {
	connectionId: "connection",
	generation: 1,
	backendId: "backend",
	namespaceId: "namespace",
	instanceId: "instance",
	capabilities: { workstationAgentFeedbackV1: true },
};
const workspace: WorkspaceViewV3 = {
	tabId: "workspace-tab",
	workspaceId: "workspace",
	activeTool: "terminal",
	activePaneArea: "center",
	activePaneId: "pane",
	panes: [
		{
			paneId: "pane",
			kind: "terminal",
			resourceId: "terminal",
			executionId: "execution",
		},
	],
	layout: { type: "pane", paneId: "pane" },
};
const binding = (event = "Start", at = 100) => ({
	terminalId: "terminal",
	workspaceId: "workspace",
	agentId: "claude",
	lastEventType: event,
	lastEventAt: at,
	startedAt: 1,
});
function scheduler() {
	let poll: () => void = () => {};
	let mounted = 0;
	return {
		schedule: (callback: () => void) => {
			poll = callback;
			mounted++;
			return () => {
				mounted--;
			};
		},
		poll: () => poll(),
		mounted: () => mounted,
	};
}
const visible = () => true;
test("binding statuses come from the selected workspace resources and original lifecycle semantics", async () => {
	const timer = scheduler();
	let rows: unknown[] = [
		binding(),
		{ ...binding("Failed"), workspaceId: "other" },
		{ ...binding("PermissionRequest"), terminalId: "other" },
	];
	let calls = 0;
	const api = {
		rpc: async () => {
			calls++;
			return rows;
		},
	} as unknown as DirectWorkstationApi;
	const view = renderHook(
		() =>
			useWorkstationAgentStatuses({
				serviceUid: 1000,
				api,
				connection,
				workspace,
				seenMarks: [],
				schedule: timer.schedule,
				isVisible: visible,
			}),
		{ wrapper: StrictMode },
	);
	await waitFor(() =>
		expect(view.result.current.get("terminal")).toBe("working"),
	);
	expect(view.result.current.size).toBe(1);
	expect(timer.mounted()).toBe(1);
	rows = [binding("PermissionRequest")];
	act(() => timer.poll());
	await waitFor(() =>
		expect(view.result.current.get("terminal")).toBe("permission"),
	);
	rows = [{ ...binding("Failed"), endedAt: 200 }];
	act(() => timer.poll());
	await waitFor(() =>
		expect(view.result.current.get("terminal")).toBe("failed"),
	);
	expect(calls).toBeGreaterThanOrEqual(3);
});
test("late replies from an old namespace never appear under a new owner", async () => {
	const old = Promise.withResolvers<unknown[]>(),
		timer = scheduler();
	const api = {
		rpc: async (request: { connectionId: string }) =>
			request.connectionId === "connection"
				? old.promise
				: [binding("PermissionRequest")],
	} as unknown as DirectWorkstationApi;
	const view = renderHook(
		({ target }) =>
			useWorkstationAgentStatuses({
				serviceUid: 1000,
				api,
				connection: target,
				workspace,
				seenMarks: [],
				schedule: timer.schedule,
				isVisible: visible,
			}),
		{ initialProps: { target: connection } },
	);
	view.rerender({
		target: {
			...connection,
			connectionId: "other",
			namespaceId: "other",
			generation: 2,
		},
	});
	expect(view.result.current.size).toBe(0);
	await waitFor(() =>
		expect(view.result.current.get("terminal")).toBe("permission"),
	);
	await act(async () => old.resolve([binding("Failed")]));
	expect(view.result.current.get("terminal")).toBe("permission");
});
test("old backends make no status queries and disabled or malformed responses clear prior status", async () => {
	const timer = scheduler();
	let bad = false,
		calls = 0;
	const api = {
		rpc: async () => {
			calls++;
			return bad ? {} : [binding()];
		},
	} as unknown as DirectWorkstationApi;
	const view = renderHook(
		({ enabled }) =>
			useWorkstationAgentStatuses({
				serviceUid: 1000,
				api,
				connection: {
					...connection,
					capabilities: { workstationAgentFeedbackV1: enabled },
				},
				workspace,
				seenMarks: [],
				schedule: timer.schedule,
				isVisible: visible,
			}),
		{ initialProps: { enabled: false } },
	);
	expect(calls).toBe(0);
	expect(timer.mounted()).toBe(0);
	view.rerender({ enabled: true });
	await waitFor(() =>
		expect(view.result.current.get("terminal")).toBe("working"),
	);
	bad = true;
	act(() => timer.poll());
	await waitFor(() => expect(view.result.current.size).toBe(0));
	view.rerender({ enabled: false });
	expect(timer.mounted()).toBe(0);
});
test("only visible active terminal reviews acknowledge the host event clock", async () => {
	const timer = scheduler(),
		seen: WorkstationAgentSeenMark[] = [];
	let event = "Stop";
	const api = {
		rpc: async () => [binding(event, 123)],
	} as unknown as DirectWorkstationApi;
	const key = await workstationAgentSeenKey({
		backendId: connection.backendId,
		serviceUid: 1000,
		namespaceId: connection.namespaceId,
		workspaceId: workspace.workspaceId,
		terminalId: "terminal",
	});
	const onSeen = (mark: WorkstationAgentSeenMark) => seen.push(mark);
	const view = renderHook(
		({ selected, marks }) =>
			useWorkstationAgentStatuses({
				serviceUid: 1000,
				api,
				connection,
				workspace: selected,
				seenMarks: marks,
				onSeen,
				schedule: timer.schedule,
				isVisible: visible,
			}),
		{
			initialProps: {
				selected: {
					...workspace,
					activeTool: "files" as const,
				} as WorkspaceViewV3,
				marks: [] as WorkstationAgentSeenMark[],
			},
		},
	);
	await waitFor(() =>
		expect(view.result.current.get("terminal")).toBe("review"),
	);
	expect(seen).toEqual([]);
	view.rerender({
		selected: { ...workspace, activeTool: "terminal" as const },
		marks: [],
	});
	await waitFor(() => expect(seen).toEqual([{ key, at: 123 }]));
	view.rerender({
		selected: { ...workspace, activeTool: "terminal" as const },
		marks: [{ key, at: 123 }],
	});
	expect(view.result.current.has("terminal")).toBe(false);
	event = "PermissionRequest";
	act(() => timer.poll());
	await waitFor(() =>
		expect(view.result.current.get("terminal")).toBe("permission"),
	);
	expect(seen).toHaveLength(1);
});
