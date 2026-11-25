import { afterEach, expect, test } from "bun:test";
import { TooltipProvider } from "@superset/ui/tooltip";
import {
	act,
	cleanup,
	fireEvent,
	render,
	waitFor,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { WorkspaceWindow } from "./WorkspaceWindow";

afterEach(cleanup);
test("Run attaches in an original dedicated tab and reuses the prior Run resource on restart", async () => {
	const attachments: unknown[][] = [];
	const connection = {
		connectionId: "remote",
		backendId: "backend",
		namespaceId: "namespace",
		instanceId: "instance",
		generation: 1,
		capabilities: { workstationWorkspaceRunV1: true, durableOperations: true },
	};
	const props = {
		api: {
			rpc: async () => ({
				projectId: "project",
				definition: null,
				definitionVersion: null,
				definitionError: null,
				run: {
					workspaceId: "workspace",
					operationId: "run",
					terminalId: "run-terminal",
					previousTerminalId: "previous-run",
					executionId: "execution",
					state: "active",
					commands: ["echo run"],
					foregroundSeen: true,
					startedAt: 1,
				},
			}),
		},
		connection,
		target: {
			connectionId: "remote",
			targetRevision: 1,
			backendId: "backend",
			namespaceId: "namespace",
			serviceUid: 1000,
			autoConnect: true,
			activeTabId: "tab",
			workspaces: [
				{
					tabId: "tab",
					workspaceId: "workspace",
					activeTool: "terminal",
					activePaneId: null,
					panes: [],
					layout: null,
				},
			],
		},
		checks: [],
		resourceRevision: 0,
		restore: null,
		actions: {
			busy: false,
			addPane: async (...args: unknown[]) => {
				attachments.push(args);
			},
		},
		ports: { busy: false, forward: null, onOpen() {}, onClose() {} },
		onNewSession() {},
		onRefresh() {},
		onPending() {},
		onProjectSettings() {},
		onBrowse() {},
		onMachines() {},
		onError() {},
	} as unknown as ComponentProps<typeof WorkspaceWindow>;
	render(
		<DndProvider backend={HTML5Backend}>
			<TooltipProvider>
				<WorkspaceWindow {...props} />
			</TooltipProvider>
		</DndProvider>,
	);
	await waitFor(() => expect(attachments).toHaveLength(1));
	expect(attachments[0]?.[3]).toMatchObject({
		connection,
		newTab: true,
		replaceResourceId: "previous-run",
	});
});
test("loading Run state does not insert an action before New terminal", async () => {
	let resolve!: (value: unknown) => void;
	const terminals: unknown[][] = [];
	const props = {
		api: {
			rpc: () =>
				new Promise((r) => {
					resolve = r;
				}),
		},
		connection: {
			connectionId: "remote",
			generation: 1,
			backendId: "backend",
			namespaceId: "namespace",
			instanceId: "instance",
			capabilities: {
				workspaceViewRestoreV1: true,
				workstationWorkspaceRunV1: true,
				durableOperations: true,
				terminals: true,
			},
		},
		target: {
			connectionId: "remote",
			targetRevision: 1,
			backendId: "backend",
			namespaceId: "namespace",
			serviceUid: 1000,
			autoConnect: true,
			activeTabId: "tab",
			workspaces: [
				{
					tabId: "tab",
					workspaceId: "workspace",
					label: "Example",
					activeTool: "terminal",
					activePaneId: null,
					panes: [],
					layout: null,
				},
			],
		},
		checks: [],
		resourceRevision: 0,
		restore: null,
		actions: {
			busy: false,
			newTerminal: (...args: unknown[]) => {
				terminals.push(args);
			},
		},
		onNewSession() {},
		onRefresh() {},
		onPending() {},
		onProjectSettings() {},
		ports: { busy: false, forward: null, onOpen() {}, onClose() {} },
		onBrowse() {},
		onMachines() {},
		onError() {},
	} as unknown as ComponentProps<typeof WorkspaceWindow>;
	const view = render(
		<DndProvider backend={HTML5Backend}>
			<TooltipProvider>
				<WorkspaceWindow {...props} />
			</TooltipProvider>
		</DndProvider>,
	);
	const first = () =>
		view.container
			.querySelectorAll(".ws-window-toolbar")[1]
			?.querySelector("button")
			?.textContent?.trim();
	expect(first()).toBe("New terminal");
	await waitFor(() => expect(typeof resolve).toBe("function"));
	await act(async () =>
		resolve({
			projectId: "project",
			definition: null,
			definitionVersion: null,
			definitionError: null,
			run: null,
		}),
	);
	expect(first()).toBe("New terminal");
	const button = view.container
		.querySelectorAll(".ws-window-toolbar")[1]
		?.querySelector("button");
	if (!button) throw new Error("Missing New terminal action");
	fireEvent.click(button);
	expect(terminals).toEqual([
		["workspace", "horizontal", undefined, { placement: "new-tab" }],
	]);
});

test("terminal navigation reaches the existing file viewer through the original pane grid", async () => {
	const handlers: import("renderer/lib/terminal/terminal-link-manager").TerminalLinkHandlers[] =
		[];
	const requests: import("../../../../../shared/direct-workstation").DirectRpc[] =
		[];
	const selected: unknown[] = [];
	const connection = {
		connectionId: "remote",
		backendId: "backend",
		namespaceId: "namespace",
		instanceId: "instance",
		generation: 1,
		capabilities: {
			workspaceViewRestoreV1: true,
			workstationFilesV1: true,
			files: true,
		},
	};
	const workspace = {
		tabId: "tab",
		workspaceId: "workspace",
		activeTool: "terminal",
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
	const props = {
		api: {
			onSocket: () => () => {},
			openRestoredTerminal: async () => {},
			closeSocket: async () => {},
			rpc: async (
				request: import("../../../../../shared/direct-workstation").DirectRpc,
			) => {
				requests.push(request);
				if (request.path === "workspace.get")
					return { worktreePath: "/remote/repo" };
				if (request.path === "filesystem.listDirectory") return { entries: [] };
				if (request.path === "filesystem.readFile")
					return {
						kind: "bytes",
						content: btoa("one\ntwo\nthree\nfour"),
						revision: "r1",
						exceededLimit: false,
					};
				throw new Error(`Unexpected request ${request.path}`);
			},
		},
		connection,
		target: {
			connectionId: "remote",
			targetRevision: 1,
			backendId: "backend",
			namespaceId: "namespace",
			serviceUid: 1000,
			autoConnect: true,
			activeTabId: "tab",
			workspaces: [workspace],
		},
		checks: [
			{
				workspaceId: "workspace",
				kind: "terminal",
				resourceId: "terminal",
				executionId: "execution",
				state: "live",
			},
		],
		resourceRevision: 0,
		restore: null,
		actions: {
			busy: false,
			setTool: (id: string, tool: string) => {
				selected.push([id, tool]);
			},
			focusPane() {},
		},
		ports: { busy: false, forward: null, onOpen() {}, onClose() {} },
		onNewSession() {},
		onRefresh() {},
		onPending() {},
		onProjectSettings() {},
		onBrowse() {},
		onMachines() {},
		onError(message: string) {
			throw new Error(message);
		},
		createEmulator: () => ({
			terminal: {
				cols: 80,
				rows: 24,
				write() {},
				writeln() {},
				dispose() {},
				onData: () => ({ dispose() {} }),
				onResize: () => ({ dispose() {} }),
			},
			fit() {},
			installLinkHandlers(
				value: import("renderer/lib/terminal/terminal-link-manager").TerminalLinkHandlers,
			) {
				handlers.push(value);
				return () => {};
			},
		}),
	} as unknown as ComponentProps<typeof WorkspaceWindow>;
	const fixture = () => (
		<DndProvider backend={HTML5Backend}>
			<TooltipProvider>
				<WorkspaceWindow {...props} />
			</TooltipProvider>
		</DndProvider>
	);
	const view = render(fixture());
	await waitFor(() => expect(handlers).toHaveLength(1));
	const activate = handlers[0]?.onFileLinkClick;
	if (!activate) throw new Error("File handler missing");
	await act(async () =>
		activate(new MouseEvent("click", { ctrlKey: true }), {
			text: "note.txt:3",
			startIndex: 0,
			endIndex: 10,
			resolvedPath: "/remote/repo/note.txt",
			isDirectory: false,
			row: 3,
			col: undefined,
			rowEnd: undefined,
			colEnd: undefined,
		}),
	);
	expect(selected).toEqual([["workspace", "files"]]);
	const currentWorkspace = props.target.workspaces[0];
	if (!currentWorkspace) throw new Error("Workspace missing");
	currentWorkspace.activeTool = "files";
	view.rerender(fixture());
	await waitFor(() =>
		expect(view.container.querySelector(".cm-editor")).not.toBeNull(),
	);
	expect(
		requests.find((request) => request.path === "filesystem.readFile"),
	).toMatchObject({
		connectionId: "remote",
		generation: 1,
		type: "query",
		input: { workspaceId: "workspace", absolutePath: "/remote/repo/note.txt" },
	});
});

test("background workspace tabs aggregate original Agent priorities without acknowledging unread events", async () => {
	const calls: string[] = [],
		seen: unknown[] = [];
	const props = {
		api: {
			rpc: async (request: {
				path: string;
				input: { workspaceId: string };
			}) => {
				expect(request.path).toBe("terminalAgents.listByWorkspace");
				calls.push(request.input.workspaceId);
				return [
					{
						workspaceId: "background",
						terminalId: "review-terminal",
						lastEventType: "Stop",
						lastEventAt: 123,
					},
					{
						workspaceId: "background",
						terminalId: "failed-terminal",
						lastEventType: "Failed",
						lastEventAt: 124,
					},
					{
						workspaceId: "other",
						terminalId: "failed-terminal",
						lastEventType: "PermissionRequest",
						lastEventAt: 125,
					},
				];
			},
		},
		connection: {
			connectionId: "remote",
			backendId: "backend",
			namespaceId: "namespace",
			instanceId: "instance",
			generation: 1,
			capabilities: { workstationAgentFeedbackV1: true },
		},
		target: {
			connectionId: "remote",
			targetRevision: 1,
			backendId: "backend",
			namespaceId: "namespace",
			serviceUid: 1000,
			autoConnect: true,
			activeTabId: "selected",
			workspaces: [
				{
					tabId: "selected",
					workspaceId: "selected",
					activeTool: "terminal",
					activePaneId: null,
					panes: [],
					layout: null,
				},
				{
					tabId: "background-tab",
					workspaceId: "background",
					activeTool: "terminal",
					activePaneId: "review-pane",
					panes: [
						{
							paneId: "review-pane",
							kind: "terminal",
							resourceId: "review-terminal",
							executionId: "review-exec",
						},
						{
							paneId: "failed-pane",
							kind: "terminal",
							resourceId: "failed-terminal",
							executionId: "failed-exec",
						},
					],
					layout: { type: "pane", paneId: "review-pane" },
				},
			],
		},
		checks: [],
		resourceRevision: 0,
		restore: null,
		actions: { busy: false },
		ports: { busy: false, forward: null, onOpen() {}, onClose() {} },
		onAgentSeen(mark: unknown) {
			seen.push(mark);
		},
		onNewSession() {},
		onRefresh() {},
		onPending() {},
		onProjectSettings() {},
		onBrowse() {},
		onMachines() {},
		onError() {},
	} as unknown as ComponentProps<typeof WorkspaceWindow>;
	const view = render(
		<DndProvider backend={HTML5Backend}>
			<TooltipProvider>
				<WorkspaceWindow {...props} />
			</TooltipProvider>
		</DndProvider>,
	);
	await waitFor(() =>
		expect(
			view.container.querySelector(
				'.ws-workspace-tabs [data-tab-id="background-tab"] [data-workstation-agent-status="failed"]',
			),
		).not.toBeNull(),
	);
	expect(calls).toEqual(["background"]);
	expect(seen).toEqual([]);
	expect(
		view.container.querySelector(
			'.ws-workspace-tabs [data-tab-id="selected"] [data-workstation-agent-status]',
		),
	).toBeNull();
	view.unmount();
});
