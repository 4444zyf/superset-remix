import { expect, test } from "bun:test";
import { transferPaneToSplit } from "@superset/panes";
import {
	fixture,
	required,
	workspace,
} from "../../../../../main/lib/ssh-direct/workspace-view-area-fixtures.test-data";
import { buildPaneTree } from "../pane-layout/pane-layout";
import {
	applyWorkspacePaneAreaLayouts,
	captureWorkspacePaneAreaLayouts,
	changedWorkspacePaneAreaLayouts,
} from "./workspace-pane-area-layouts";
import { createWorkspacePaneAreas } from "./workspace-pane-areas";

function setup() {
	const view = fixture(),
		w = workspace(view),
		target = required(view.targets[0]);
	const areas = createWorkspacePaneAreas(w, { scheduleMicrotask() {} });
	transferPaneToSplit({
		source: areas.right,
		target: areas.center,
		paneId: "browser",
		targetPaneId: "terminal",
		position: "right",
	});
	const tab = required(areas.center.getState().tabs[0]);
	w.paneTabs = [
		{
			tabId: tab.id,
			createdAt: tab.createdAt,
			activePaneId: tab.activePaneId,
			layout: {
				type: "split",
				axis: "horizontal",
				ratio: 0.5,
				first: { type: "pane", paneId: "terminal" },
				second: { type: "pane", paneId: "browser" },
			},
		},
	];
	w.rightPaneLayout = { version: 1, tabs: [], activeTabId: null };
	const before = areas.read();
	areas.center
		.getState()
		.resizeSplit({ tabId: "center-tab", path: [], splitPercentage: 71 });
	const edits = captureWorkspacePaneAreaLayouts(
		areas.read(),
		changedWorkspacePaneAreaLayouts(areas.read(), before),
	);
	areas.dispose();
	return {
		view,
		w,
		edits,
		scope: {
			connectionId: target.connectionId,
			backendId: target.backendId,
			namespaceId: target.namespaceId,
			serviceUid: target.serviceUid,
			targetRevision: target.targetRevision,
			workspaceId: w.workspaceId,
			tabId: w.tabId,
		},
	};
}
test("explicit layout edits retain newer tabs, title, selection and resources on both sides", () => {
	const f = setup();
	const original = structuredClone(f.view);
	const newPane = {
		paneId: "new",
		kind: "terminal" as const,
		resourceId: "new-pty",
		executionId: "new-execution",
	};
	f.w.panes.push(newPane);
	f.w.layout = buildPaneTree(f.w.panes.map((pane) => pane.paneId));
	f.w.rightPaneLayout?.tabs.push({
		tabId: "new-tab",
		createdAt: 3,
		activePaneId: "new",
		layout: { type: "pane", paneId: "new" },
	});
	if (!f.w.rightPaneLayout) throw Error("Missing right layout");
	f.w.rightPaneLayout.activeTabId = "new-tab";
	f.w.activePaneArea = "right";
	f.w.rightPaneOpen = true;
	f.w.activePaneId = "new";
	required(f.w.paneTabs?.[0]).label = "New server title";
	const input = structuredClone(f.view),
		saved = required(applyWorkspacePaneAreaLayouts(f.view, f.scope, f.edits)),
		result = workspace(saved);
	expect(result.paneTabs?.[0]?.layout).toMatchObject({ ratio: 0.71 });
	expect(result.paneTabs?.[0]?.label).toBe("New server title");
	expect(result.rightPaneLayout).toEqual(
		input.targets[0]?.workspaces[0]?.rightPaneLayout,
	);
	expect(result.panes).toEqual(f.w.panes);
	expect(result.activePaneArea).toBe("right");
	expect(result.activePaneId).toBe("new");
	expect(f.view).toEqual(input);
	expect(original.targets[0]?.workspaces[0]?.panes).toHaveLength(2);
});
test("layout batches reject reused executions, changed membership, bad scopes and partial application", () => {
	const f = setup();
	for (const key of [
		"namespaceId",
		"backendId",
		"targetRevision",
		"serviceUid",
		"workspaceId",
		"tabId",
	] as const) {
		const bad = {
			...f.scope,
			[key]: typeof f.scope[key] === "number" ? 999 : "old",
		};
		expect(applyWorkspacePaneAreaLayouts(f.view, bad, f.edits)).toBeNull();
	}
	required(f.w.panes[0]).executionId = "replacement";
	expect(applyWorkspacePaneAreaLayouts(f.view, f.scope, f.edits)).toBeNull();
	required(f.w.panes[0]).executionId = "execution";
	const before = structuredClone(f.view);
	expect(
		applyWorkspacePaneAreaLayouts(f.view, f.scope, [
			...f.edits,
			{ ...required(f.edits[0]), tabId: "missing" },
		]),
	).toBeNull();
	expect(f.view).toEqual(before);
	required(f.w.paneTabs?.[0]).layout = { type: "pane", paneId: "terminal" };
	expect(applyWorkspacePaneAreaLayouts(f.view, f.scope, f.edits)).toBeNull();
});
