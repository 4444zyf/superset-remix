import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";

export function canDropWorkspaceItem<T>(
	item: { paneId?: string; tabId?: string; store?: unknown },
	stores: readonly StoreApi<WorkspaceStore<T>>[],
): boolean {
	const source = stores.find((candidate) => candidate === item.store);
	if (!source) return false;
	if (item.paneId) return !!source.getState().getPane(item.paneId);
	return !!item.tabId && !!source.getState().getTab(item.tabId);
}
