import { afterEach, expect, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import type {
	DirectDescriptor,
	DirectSocketEvent,
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

function eventFixture(query: () => Promise<unknown[]>) {
	const listeners = new Set<(event: DirectSocketEvent) => void>();
	const opened: { path: string; id: string }[] = [],
		closed: string[] = [];
	let calls = 0;
	const api = {
		rpc: async () => {
			calls++;
			return query();
		},
		onSocket: (listener: (event: DirectSocketEvent) => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		openSocket: async (_target: DirectDescriptor, path: string, id: string) => {
			opened.push({ path, id });
		},
		closeSocket: async (id: string) => {
			closed.push(id);
		},
		sendSocket: async () => {},
	} as unknown as DirectWorkstationApi;
	const target = {
		...connection,
		connectionId: crypto.randomUUID(),
		capabilities: {
			workstationAgentFeedbackV1: true,
			workstationFileEventsV1: true,
		},
	};
	const emit = (kind: DirectSocketEvent["kind"], message?: object) => {
		const id = opened[0]?.id;
		if (!id) throw Error("Expected authenticated event socket");
		for (const listener of listeners)
			listener({
				socketId: id,
				kind,
				...(message ? { data: JSON.stringify(message) } : {}),
			} as DirectSocketEvent);
	};
	return { api, target, opened, closed, listeners, emit, calls: () => calls };
}
test("authenticated events refresh current resources without polling or trusting event clocks", async () => {
	let rows = [binding()];
	const f = eventFixture(async () => rows),
		timer = scheduler(),
		seen: WorkstationAgentSeenMark[] = [];
	const view = renderHook(() =>
		useWorkstationAgentStatuses({
			api: f.api,
			connection: f.target,
			serviceUid: 1000,
			workspace,
			seenMarks: [],
			onSeen: (mark) => {
				seen.push(mark);
			},
			schedule: timer.schedule,
			isVisible: visible,
		}),
	);
	await waitFor(() =>
		expect(view.result.current.get("terminal")).toBe("working"),
	);
	expect(f.opened).toMatchObject([{ path: "/events" }]);
	act(() => f.emit("open"));
	await waitFor(() => expect(f.calls()).toBe(2));
	await act(async () => {
		await Promise.resolve();
	});
	const calls = f.calls();
	act(() => {
		timer.poll();
		f.emit("message", {
			type: "agent:lifecycle",
			workspaceId: "other",
			terminalId: "terminal",
		});
		f.emit("message", {
			type: "agent:lifecycle",
			workspaceId: "workspace",
			terminalId: "other",
		});
		f.emit("message", { type: "agent:bindings-changed" });
	});
	expect(f.calls()).toBe(calls);
	rows = [binding("Stop", 123)];
	act(() =>
		f.emit("message", {
			type: "agent:lifecycle",
			workspaceId: "workspace",
			terminalId: "terminal",
			occurredAt: 999999999,
			eventType: "Failed",
		}),
	);
	await waitFor(() =>
		expect(view.result.current.get("terminal")).toBe("review"),
	);
	await waitFor(() => expect(seen.at(-1)?.at).toBe(123));
	act(() => f.emit("close"));
	rows = [binding("Failed", 124)];
	act(() => timer.poll());
	await waitFor(() =>
		expect(view.result.current.get("terminal")).toBe("failed"),
	);
	view.unmount();
	expect(f.listeners.size).toBe(0);
	expect(f.closed).toContain(f.opened[0]?.id as string);
	expect(timer.mounted()).toBe(0);
});
test("bursts during a pending query coalesce into one subsequent snapshot", async () => {
	const initial = Promise.withResolvers<unknown[]>();
	let first = true;
	const f = eventFixture(() => {
		if (first) {
			first = false;
			return initial.promise;
		}
		return Promise.resolve([binding("Stop", 456)]);
	});
	const timer = scheduler();
	const view = renderHook(() =>
		useWorkstationAgentStatuses({
			api: f.api,
			connection: f.target,
			serviceUid: 1000,
			workspace,
			seenMarks: [],
			schedule: timer.schedule,
			isVisible: visible,
		}),
	);
	await waitFor(() => expect(f.opened.length).toBe(1));
	act(() => {
		f.emit("open");
		for (let i = 0; i < 8; i++)
			f.emit("message", {
				type: "agent:bindings-changed",
				workspaceId: "workspace",
			});
		f.emit("message", {
			type: "terminal:lifecycle",
			workspaceId: "workspace",
			terminalId: "terminal",
			eventType: "exit",
		});
	});
	expect(f.calls()).toBe(1);
	await act(async () => initial.resolve([binding()]));
	await waitFor(() =>
		expect(view.result.current.get("terminal")).toBe("review"),
	);
	expect(f.calls()).toBe(2);
	view.unmount();
	expect(f.listeners.size).toBe(0);
});

test("catalog reads validate unopened bindings and bounds without acknowledging them", async () => {
	const timer = scheduler(),
		seen: WorkstationAgentSeenMark[] = [];
	let rows: unknown[] = [
		binding("Stop", 123),
		{ ...binding("PermissionRequest"), workspaceId: "other" },
		{ ...binding("Failed"), terminalId: "" },
		{ ...binding("Failed"), terminalId: "x".repeat(257) },
	];
	const api = { rpc: async () => rows } as unknown as DirectWorkstationApi;
	const view = renderHook(() =>
		useWorkstationAgentStatuses({
			api,
			connection,
			serviceUid: 1000,
			workspaceId: "workspace",
			seenMarks: [],
			onSeen: (mark) => {
				seen.push(mark);
			},
			isVisible: visible,
			schedule: timer.schedule,
		}),
	);
	await waitFor(() =>
		expect(view.result.current.get("terminal")).toBe("review"),
	);
	expect(view.result.current.size).toBe(1);
	expect(seen).toEqual([]);
	rows = Array.from({ length: 4097 }, () => binding());
	act(() => timer.poll());
	await waitFor(() => expect(view.result.current.size).toBe(0));
	expect(seen).toEqual([]);
});

test("catalog events refresh newly bound terminals without a saved pane", async () => {
	let rows = [binding("Stop", 123)];
	const f = eventFixture(async () => rows),
		timer = scheduler();
	const view = renderHook(() =>
		useWorkstationAgentStatuses({
			api: f.api,
			connection: f.target,
			serviceUid: 1000,
			workspaceId: "workspace",
			seenMarks: [],
			schedule: timer.schedule,
		}),
	);
	await waitFor(() =>
		expect(view.result.current.get("terminal")).toBe("review"),
	);
	act(() => f.emit("open"));
	await waitFor(() => expect(f.calls()).toBe(2));
	await act(async () => {
		await Promise.resolve();
	});
	rows = [{ ...binding("Failed", 124), terminalId: "new-unopened-terminal" }];
	act(() =>
		f.emit("message", {
			type: "agent:lifecycle",
			workspaceId: "workspace",
			terminalId: "new-unopened-terminal",
			eventType: "Failed",
			occurredAt: 124,
		}),
	);
	await waitFor(() =>
		expect(view.result.current.get("new-unopened-terminal")).toBe("failed"),
	);
	expect(view.result.current.has("terminal")).toBe(false);
	view.unmount();
	expect(f.listeners.size).toBe(0);
});
