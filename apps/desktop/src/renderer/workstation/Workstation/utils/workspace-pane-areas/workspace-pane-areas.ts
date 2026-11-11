import {
	createWorkspaceStore,
	transferAllTabs,
	type WorkspaceState,
} from "@superset/panes";
import {
	expandPaneArea,
	restorePaneArea,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/expandPaneArea";
import type { WorkspaceViewV3 } from "../../../../../shared/workspace-view-v3";
import { toPaneState } from "../pane-adapter/pane-adapter";
import { paneStateMetadataKey } from "../workspace-pane-state/workspace-pane-state";
import { workstationPaneRuntimeStructure } from "../workstation-pane-runtime/workstation-pane-runtime";

import { canonicalWorkspacePaneState } from "./canonical-workspace-pane-state";

type PaneData = WorkspaceViewV3["panes"][number];
type State = WorkspaceState<PaneData>;
export type WorkspacePaneArea = "center" | "right";
export interface WorkspacePaneAreasState {
	center: State;
	right: State;
	activePaneArea: WorkspacePaneArea;
	rightPaneOpen: boolean;
	rightPaneAreaExpansion?: WorkspaceViewV3["rightPaneAreaExpansion"];
}
export function captureWorkspacePaneAreas(
	state: WorkspacePaneAreasState,
): WorkspacePaneAreasState {
	const area = (value: State): State => ({
		version: 1,
		activeTabId: value.activeTabId,
		tabs: structuredClone(value.tabs),
	});
	return {
		activePaneArea: state.activePaneArea,
		rightPaneOpen: state.rightPaneOpen,
		...(state.rightPaneAreaExpansion
			? {
					rightPaneAreaExpansion: structuredClone(state.rightPaneAreaExpansion),
				}
			: {}),
		center: area(state.center),
		right: area(state.right),
	};
}
export function stateForLegacyMetadataMerge(
	state: WorkspacePaneAreasState,
): State {
	const tabs = [...state.center.tabs, ...state.right.tabs].sort((a, b) =>
		a.id.localeCompare(b.id),
	);
	return canonicalWorkspacePaneState({
		version: 1,
		tabs,
		activeTabId: tabs[0]?.id ?? null,
	});
}
export function selectedWorkspacePane(state: State): string | null {
	return (
		state.tabs.find((tab) => tab.id === state.activeTabId)?.activePaneId ?? null
	);
}
type EditListener = (
	next: WorkspacePaneAreasState,
	before: WorkspacePaneAreasState,
) => void;

function readArea(
	workspace: WorkspaceViewV3,
	groups: WorkspaceViewV3["paneTabs"],
	selected: WorkspaceViewV3["activePaneTabId"],
): State {
	const state = toPaneState({
		...workspace,
		paneTabs: groups,
		activePaneTabId: selected,
	});
	const data = new Map(workspace.panes.map((pane) => [pane.paneId, pane]));
	return {
		...state,
		tabs: state.tabs.map((tab) => ({
			...tab,
			panes: Object.fromEntries(
				Object.entries(tab.panes).map(([id, pane]) => {
					const original = data.get(id);
					if (!original) throw new Error("Workspace pane data is unavailable");
					return [
						id,
						{
							...pane,
							data: { ...original },
							...(original.pinned === undefined
								? {}
								: { pinned: original.pinned }),
						},
					];
				}),
			),
		})),
	};
}
export function readWorkspacePaneAreas(
	workspace: WorkspaceViewV3,
): WorkspacePaneAreasState {
	const right = workspace.rightPaneLayout;
	return {
		center: readArea(workspace, workspace.paneTabs, workspace.activePaneTabId),
		right: right
			? readArea(workspace, right.tabs, right.activeTabId)
			: { version: 1, tabs: [], activeTabId: null },
		activePaneArea: workspace.activePaneArea ?? "center",
		rightPaneOpen: workspace.rightPaneOpen ?? false,
		...(workspace.rightPaneAreaExpansion
			? {
					rightPaneAreaExpansion: structuredClone(
						workspace.rightPaneAreaExpansion,
					),
				}
			: {}),
	};
}
export function workspacePaneAreasMetadataKey(
	state: WorkspacePaneAreasState,
): string {
	const area = (value: State) => ({
		metadata: paneStateMetadataKey(value),
		pins: value.tabs.map((tab) => [
			tab.id,
			Object.values(tab.panes)
				.sort((a, b) => a.id.localeCompare(b.id))
				.map((pane) => [pane.id, pane.pinned]),
		]),
	});
	return JSON.stringify({
		center: area(state.center),
		right: area(state.right),
		activePaneArea: state.activePaneArea,
		rightPaneOpen: state.rightPaneOpen,
		rightPaneAreaExpansion: state.rightPaneAreaExpansion,
	});
}
export function workspacePaneAreasStructureKey(
	state: WorkspacePaneAreasState,
): string {
	try {
		return JSON.stringify([
			workstationPaneRuntimeStructure(
				canonicalWorkspacePaneState(state.center),
			),
			workstationPaneRuntimeStructure(canonicalWorkspacePaneState(state.right)),
			...(state.rightPaneAreaExpansion ? [state.rightPaneAreaExpansion] : []),
		]);
	} catch {
		return "invalid-pane-area-layout";
	}
}
function fingerprint(state: WorkspacePaneAreasState): string {
	const layouts = (value: State) =>
		value.tabs.map((tab) => [tab.id, tab.layout]);
	return JSON.stringify({
		metadata: workspacePaneAreasMetadataKey(state),
		center: layouts(state.center),
		right: layouts(state.right),
	});
}

export function createWorkspacePaneAreas(
	workspace: WorkspaceViewV3,
	options: { scheduleMicrotask?(callback: () => void): void } = {},
) {
	const initial = readWorkspacePaneAreas(workspace);
	const center = createWorkspaceStore<PaneData>({
		initialState: initial.center,
	});
	const right = createWorkspaceStore<PaneData>({ initialState: initial.right });
	const schedule = options.scheduleMicrotask ?? queueMicrotask;
	const edits = new Set<{ listener: EditListener }>(),
		snapshots = new Set<{ listener(): void }>();
	let activePaneArea = initial.activePaneArea,
		rightPaneOpen = initial.rightPaneOpen,
		expansion = initial.rightPaneAreaExpansion;
	let expandedInWindow = false;
	let lastNotified: WorkspacePaneAreasState | undefined;
	let cached: WorkspacePaneAreasState | undefined,
		pending: WorkspacePaneAreasState | undefined,
		token: object | undefined;
	let syncing = false,
		disposed = false;
	const read = (): WorkspacePaneAreasState => {
		const c = center.getState(),
			r = right.getState();
		if (
			cached?.center === c &&
			cached.right === r &&
			cached.activePaneArea === activePaneArea &&
			cached.rightPaneOpen === rightPaneOpen &&
			cached.rightPaneAreaExpansion === expansion
		)
			return cached;
		cached = {
			center: c,
			right: r,
			activePaneArea,
			rightPaneOpen,
			...(expansion ? { rightPaneAreaExpansion: expansion } : {}),
		};
		return cached;
	};
	const notifySnapshots = () => {
		const snapshot = read();
		if (snapshot === lastNotified) return;
		lastNotified = snapshot;
		for (const entry of [...snapshots]) {
			if (disposed) break;
			if (snapshots.has(entry)) entry.listener();
		}
	};
	const flush = (): boolean => {
		const before = pending;
		pending = undefined;
		token = undefined;
		if (disposed || !before) return false;
		const next = read(),
			changed = fingerprint(next) !== fingerprint(before);
		try {
			if (changed)
				for (const entry of [...edits]) {
					if (disposed) break;
					if (edits.has(entry)) entry.listener(next, before);
				}
		} finally {
			if (!disposed && next !== before) notifySnapshots();
		}
		return changed;
	};
	const queue = (before: WorkspacePaneAreasState) => {
		if (disposed || syncing || pending) return;
		pending = before;
		const own = {};
		token = own;
		schedule(() => {
			if (!disposed && token === own) flush();
		});
	};
	const changed = (area: WorkspacePaneArea, previous: State) => {
		if (disposed || syncing) return;
		const before = { ...read(), [area]: previous };
		if (activePaneArea === "right" && !right.getState().activeTabId)
			activePaneArea = "center";
		queue(before);
	};
	const restoreExpansion = () => {
		if (disposed || !expansion) return false;
		const before = read();
		queue(before);
		restorePaneArea({ center, right, snapshot: expansion });
		expansion = undefined;
		expandedInWindow = false;
		if (activePaneArea === "right" && !right.getState().activeTabId)
			activePaneArea = "center";
		return true;
	};
	const offCenter = center.subscribe((_state, previous) =>
		changed("center", previous),
	);
	const offRight = right.subscribe((_state, previous) =>
		changed("right", previous),
	);
	const listen = <T>(entries: Set<{ listener: T }>, listener: T) => {
		const entry = { listener };
		if (!disposed) entries.add(entry);
		return () => {
			entries.delete(entry);
		};
	};
	return {
		center,
		right,
		read,
		flush,
		isExpandedInWindow: () => expandedInWindow && !!expansion,
		expandRightPaneArea(): boolean {
			if (disposed || expansion) return false;
			const before = read();
			queue(before);
			expansion = expandPaneArea({ center, right });
			expandedInWindow = true;
			rightPaneOpen = true;
			activePaneArea = right.getState().activeTabId ? "right" : "center";
			notifySnapshots();
			return true;
		},
		restoreRightPaneArea(): boolean {
			if (!restoreExpansion()) return false;
			notifySnapshots();
			return true;
		},
		mergeRightPaneArea(): boolean {
			if (disposed) return false;
			const before = read();
			queue(before);
			expansion = undefined;
			expandedInWindow = false;
			transferAllTabs({ source: right, target: center });
			rightPaneOpen = false;
			activePaneArea = "center";
			if (read() !== before) notifySnapshots();
			return true;
		},
		subscribe: (listener: () => void) => listen(snapshots, listener),
		subscribeEdits: (listener: EditListener) => listen(edits, listener),
		activate(area: WorkspacePaneArea): boolean {
			if (disposed || (area === "right" && !right.getState().activeTabId))
				return false;
			const before = read();
			activePaneArea = area;
			if (area === "right") rightPaneOpen = true;
			queue(before);
			if (read() !== before) notifySnapshots();
			return true;
		},
		setRightPaneOpen(open: boolean): void {
			if (disposed) return;
			const before = read();
			if (!open) restoreExpansion();
			rightPaneOpen = open;
			if (!open && activePaneArea === "right") activePaneArea = "center";
			queue(before);
			if (read() !== before) notifySnapshots();
		},
		replaceFromRuntime(area: WorkspacePaneArea, next: State): boolean {
			if (disposed) return false;
			flush();
			if (disposed) return false;
			const before = read();
			syncing = true;
			try {
				(area === "center" ? center : right).getState().replaceState(next);
				if (activePaneArea === "right" && !right.getState().activeTabId)
					activePaneArea = "center";
			} finally {
				syncing = false;
			}
			if (read() !== before) notifySnapshots();
			return true;
		},
		replaceAreasFromRuntime(next: WorkspacePaneAreasState): boolean {
			if (disposed) return false;
			flush();
			if (disposed) return false;
			const before = read();
			syncing = true;
			try {
				activePaneArea = next.activePaneArea;
				rightPaneOpen = next.rightPaneOpen;
				if (
					JSON.stringify(expansion) !==
					JSON.stringify(next.rightPaneAreaExpansion)
				)
					expandedInWindow = false;
				expansion = next.rightPaneAreaExpansion
					? structuredClone(next.rightPaneAreaExpansion)
					: undefined;
				if (!expansion) expandedInWindow = false;
				center.getState().replaceState(next.center);
				right.getState().replaceState(next.right);
				if (activePaneArea === "right" && !right.getState().activeTabId)
					activePaneArea = "center";
			} finally {
				syncing = false;
			}
			if (read() !== before) notifySnapshots();
			return true;
		},
		synchronize(next: WorkspaceViewV3): void {
			if (disposed) return;
			flush();
			if (disposed) return;
			const before = read(),
				state = readWorkspacePaneAreas(next);
			syncing = true;
			try {
				activePaneArea = state.activePaneArea;
				rightPaneOpen = state.rightPaneOpen;
				if (
					JSON.stringify(expansion) !==
					JSON.stringify(state.rightPaneAreaExpansion)
				)
					expandedInWindow = false;
				expansion = state.rightPaneAreaExpansion;
				if (!expansion) expandedInWindow = false;
				center.getState().replaceState(state.center);
				right.getState().replaceState(state.right);
			} finally {
				syncing = false;
			}
			if (read() !== before) notifySnapshots();
		},
		dispose(): void {
			if (disposed) return;
			disposed = true;
			pending = undefined;
			token = undefined;
			offCenter();
			offRight();
			edits.clear();
			snapshots.clear();
		},
	};
}
