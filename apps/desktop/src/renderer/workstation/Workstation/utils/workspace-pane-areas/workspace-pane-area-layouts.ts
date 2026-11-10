import type { PaneTree } from "../../../../../shared/workspace-view";
import {
	validateWorkspaceViewV3,
	type WorkspaceViewInputV3,
} from "../../../../../shared/workspace-view-v3";
import { fromPaneLayout } from "../pane-adapter/pane-adapter";
import { canonicalWorkspacePaneState } from "./canonical-workspace-pane-state";
import type { WorkspacePaneAreasState } from "./workspace-pane-areas";
import type { WorkspacePaneAreasScope } from "./workspace-pane-areas-state";

type Pane =
	WorkspaceViewInputV3["targets"][number]["workspaces"][number]["panes"][number];
export interface WorkspacePaneAreaLayoutEdit {
	tabId: string;
	layout: PaneTree;
	panes: Pick<Pane, "paneId" | "kind" | "resourceId" | "executionId">[];
}
const tabs = (state: WorkspacePaneAreasState) =>
	[
		canonicalWorkspacePaneState(state.center),
		canonicalWorkspacePaneState(state.right),
	].flatMap((area) => area.tabs);
export function changedWorkspacePaneAreaLayouts(
	next: WorkspacePaneAreasState,
	before: WorkspacePaneAreasState,
): string[] {
	const previous = new Map(tabs(before).map((tab) => [tab.id, tab.layout]));
	return tabs(next)
		.filter(
			(tab) =>
				previous.has(tab.id) &&
				JSON.stringify(tab.layout) !== JSON.stringify(previous.get(tab.id)),
		)
		.map((tab) => tab.id);
}
export function captureWorkspacePaneAreaLayouts(
	state: WorkspacePaneAreasState,
	tabIds: readonly string[],
): WorkspacePaneAreaLayoutEdit[] {
	if (tabIds.length > 64 || new Set(tabIds).size !== tabIds.length)
		throw Error("Invalid pane layout edit batch");
	const source = tabs(state);
	return tabIds.map((id) => {
		const tab = source.find((tab) => tab.id === id);
		if (!tab) throw Error("Pane layout tab is unavailable");
		return {
			tabId: id,
			layout: fromPaneLayout(tab.layout),
			panes: Object.values(tab.panes).map((pane) => ({
				paneId: pane.id,
				kind: pane.data.kind,
				resourceId: pane.data.resourceId,
				...(pane.data.executionId === undefined
					? {}
					: { executionId: pane.data.executionId }),
			})),
		};
	});
}
export function applyWorkspacePaneAreaLayouts(
	value: WorkspaceViewInputV3,
	scope: WorkspacePaneAreasScope,
	edits: readonly WorkspacePaneAreaLayoutEdit[],
): WorkspaceViewInputV3 | null {
	try {
		if (
			!edits.length ||
			edits.length > 64 ||
			new Set(edits.map((edit) => edit.tabId)).size !== edits.length
		)
			return null;
		const view = validateWorkspaceViewV3(value),
			target = view.targets.find(
				(target) => target.connectionId === scope.connectionId,
			);
		if (
			!target ||
			(
				["backendId", "namespaceId", "serviceUid", "targetRevision"] as const
			).some((key) => target[key] !== scope[key])
		)
			return null;
		const workspace = target.workspaces.find(
			(workspace) =>
				workspace.workspaceId === scope.workspaceId &&
				workspace.tabId === scope.tabId,
		);
		if (!workspace) return null;
		const groups = [
			...(workspace.paneTabs ?? []),
			...(workspace.rightPaneLayout?.tabs ?? []),
		];
		for (const edit of edits) {
			if (
				!Array.isArray(edit.panes) ||
				!edit.panes.length ||
				edit.panes.length > 64 ||
				new Set(edit.panes.map((pane) => pane.paneId)).size !==
					edit.panes.length
			)
				return null;
			const group = groups.find((group) => group.tabId === edit.tabId);
			if (!group) return null;
			const leafIds = (layout: PaneTree) => {
				const leaves: string[] = [];
				let nodes = 0;
				const visit = (tree: PaneTree, depth: number) => {
					if (!tree || depth > 16 || ++nodes > 127 || leaves.length >= 64)
						throw Error("Invalid pane layout");
					if (tree.type === "pane") leaves.push(tree.paneId);
					else if (tree.type === "split") {
						visit(tree.first, depth + 1);
						visit(tree.second, depth + 1);
					} else throw Error("Invalid pane layout");
				};
				visit(layout, 0);
				return leaves;
			};
			const leaves = leafIds(group.layout),
				requested = leafIds(edit.layout);
			if (
				requested.length !== leaves.length ||
				new Set(requested).size !== requested.length ||
				requested.some((id) => !leaves.includes(id))
			)
				return null;
			if (leaves.length !== edit.panes.length) return null;
			for (const id of leaves) {
				const expected = edit.panes.find((pane) => pane.paneId === id),
					actual = workspace.panes.find((pane) => pane.paneId === id);
				if (
					!expected ||
					!actual ||
					(["kind", "resourceId", "executionId"] as const).some(
						(key) => actual[key] !== expected[key],
					)
				)
					return null;
			}
			group.layout = structuredClone(edit.layout);
		}
		return validateWorkspaceViewV3(view);
	} catch {
		return null;
	}
}
