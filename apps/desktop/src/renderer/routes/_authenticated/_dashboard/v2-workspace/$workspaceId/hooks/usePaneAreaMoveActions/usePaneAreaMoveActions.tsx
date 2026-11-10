import { useLingui } from "@lingui/react/macro";
import {
	type ContextMenuActionConfig,
	transferPaneToNewTab,
	type WorkspaceStore,
} from "@superset/panes";
import { useMemo } from "react";
import { LuArrowLeftToLine, LuArrowRightToLine } from "react-icons/lu";
import type { StoreApi } from "zustand/vanilla";

export function usePaneAreaMoveActions<TData>({
	defaults,
	enabled,
	source,
	target,
	direction,
	onMoved,
}: {
	defaults: ContextMenuActionConfig<TData>[];
	enabled: boolean;
	source: StoreApi<WorkspaceStore<TData>>;
	target: StoreApi<WorkspaceStore<TData>>;
	direction: "right" | "center";
	onMoved?: () => void;
}): ContextMenuActionConfig<TData>[] {
	const { t } = useLingui();
	return useMemo(() => {
		if (!enabled) return defaults;
		return [
			...defaults,
			{ key: "pane-area-move-separator", type: "separator" },
			{
				key: "pane-area-move",
				label:
					direction === "right"
						? t({ message: "Move to Right Side" })
						: t({ message: "Move to Center" }),
				icon:
					direction === "right" ? (
						<LuArrowRightToLine />
					) : (
						<LuArrowLeftToLine />
					),
				onSelect: (ctx) => {
					transferPaneToNewTab({ source, target, paneId: ctx.pane.id });
					onMoved?.();
				},
			},
		];
	}, [defaults, enabled, source, target, direction, onMoved, t]);
}
