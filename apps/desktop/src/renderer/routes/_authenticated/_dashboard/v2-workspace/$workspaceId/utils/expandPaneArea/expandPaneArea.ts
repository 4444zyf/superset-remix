import { transferTabToIndex, type WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";

type Store<TData> = StoreApi<WorkspaceStore<TData>>;

export interface ExpandedPaneAreaSnapshot {
	movedTabIds: string[];
	centerActiveTabId: string | null;
	rightActiveTabId: string | null;
}

export function expandPaneArea<TData>({
	center,
	right,
}: {
	center: Store<TData>;
	right: Store<TData>;
}): ExpandedPaneAreaSnapshot {
	const { tabs, activeTabId: centerActiveTabId } = center.getState();
	const rightActiveTabId = right.getState().activeTabId;
	const movedTabIds = tabs.map((tab) => tab.id);
	movedTabIds.forEach((tabId, index) => {
		transferTabToIndex({
			source: center,
			target: right,
			tabId,
			toIndex: index,
		});
	});
	const activeTabId = rightActiveTabId ?? centerActiveTabId;
	if (activeTabId) right.getState().setActiveTab(activeTabId);
	return { movedTabIds, centerActiveTabId, rightActiveTabId };
}

export function restorePaneArea<TData>({
	center,
	right,
	snapshot,
}: {
	center: Store<TData>;
	right: Store<TData>;
	snapshot: ExpandedPaneAreaSnapshot;
}): void {
	for (const tabId of snapshot.movedTabIds) {
		transferTabToIndex({ source: right, target: center, tabId });
	}
	if (snapshot.centerActiveTabId) {
		center.getState().setActiveTab(snapshot.centerActiveTabId);
	}
	if (snapshot.rightActiveTabId) {
		right.getState().setActiveTab(snapshot.rightActiveTabId);
	}
}
