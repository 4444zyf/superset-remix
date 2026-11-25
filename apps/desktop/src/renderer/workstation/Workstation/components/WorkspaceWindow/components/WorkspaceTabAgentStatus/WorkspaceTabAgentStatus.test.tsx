import { afterEach, expect, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { workstationAgentSeenKey } from "shared/workstation-agent-seen";
import { WorkspaceTabAgentStatus } from "./WorkspaceTabAgentStatus";

afterEach(cleanup);
function fixture() {
	let calls = 0;
	const props = {
		api: {
			rpc: async () => {
				calls++;
				return [
					{
						workspaceId: "workspace",
						terminalId: "terminal",
						lastEventType: "Stop",
						lastEventAt: 123,
					},
				];
			},
		},
		connection: {
			connectionId: "remote",
			generation: 1,
			backendId: "backend",
			namespaceId: "namespace",
			instanceId: "instance",
			capabilities: { workstationAgentFeedbackV1: true },
		},
		serviceUid: 1000,
		workspace: {
			workspaceId: "workspace",
			tabId: "tab",
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
		},
		seenMarks: [],
	} as unknown as ComponentProps<typeof WorkspaceTabAgentStatus>;
	return { props, calls: () => calls };
}
test("a background review remains unread until the persisted mark changes", async () => {
	const { props, calls } = fixture();
	const view = render(<WorkspaceTabAgentStatus {...props} />);
	await waitFor(() =>
		expect(
			view.container.querySelector('[data-workstation-agent-status="review"]'),
		).not.toBeNull(),
	);
	const key = await workstationAgentSeenKey({
		backendId: "backend",
		namespaceId: "namespace",
		serviceUid: 1000,
		workspaceId: "workspace",
		terminalId: "terminal",
	});
	view.rerender(
		<WorkspaceTabAgentStatus {...props} seenMarks={[{ key, at: 123 }]} />,
	);
	await waitFor(() =>
		expect(
			view.container.querySelector("[data-workstation-agent-status]"),
		).toBeNull(),
	);
	expect(calls()).toBe(1);
});
test("the active workspace reuses its existing statuses without another binding query", () => {
	const { props, calls } = fixture();
	const view = render(
		<WorkspaceTabAgentStatus
			{...props}
			activeStatuses={new Map([["terminal", "permission"]])}
		/>,
	);
	expect(
		view.container.querySelector(
			'[data-workstation-agent-status="permission"]',
		),
	).not.toBeNull();
	expect(calls()).toBe(0);
	view.rerender(
		<WorkspaceTabAgentStatus {...props} activeStatuses={new Map()} />,
	);
	expect(
		view.container.querySelector("[data-workstation-agent-status]"),
	).toBeNull();
	expect(calls()).toBe(0);
});
