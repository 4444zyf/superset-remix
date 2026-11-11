import { Workspace, type WorkspaceProps } from "@superset/panes";
import type { ReactNode } from "react";

export function RightPaneAreaView<TData>({
	workspaceProps,
	onActivate,
	headerControls,
}: {
	workspaceProps: WorkspaceProps<TData>;
	onActivate(): void;
	headerControls: ReactNode;
}) {
	return (
		<div
			className="contents"
			data-pane-area="right"
			onPointerDownCapture={(event) => {
				if (event.currentTarget.contains(event.target as Node)) onActivate();
			}}
			onFocusCapture={(event) => {
				if (event.currentTarget.contains(event.target as Node)) onActivate();
			}}
		>
			<Workspace<TData>
				{...workspaceProps}
				renderTabBarTrailing={() => (
					<div className="flex items-center gap-1 pr-1">{headerControls}</div>
				)}
			/>
		</div>
	);
}
