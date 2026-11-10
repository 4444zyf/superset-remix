import { Trans, useLingui } from "@lingui/react/macro";
import { transferAllTabs } from "@superset/panes";
import { DropdownMenuItem } from "@superset/ui/dropdown-menu";
import { ArrowLeftToLine, PanelRight } from "lucide-react";
import {
	type ComponentProps,
	type ReactNode,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { RightPaneAreaView } from "renderer/components/RightPaneAreaView";
import { RightPaneHeaderButton } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/RightPaneArea/components/RightPaneHeaderButton";
import { useShellInteractionPassthrough } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useShellInteractionPassthrough/useShellInteractionPassthrough";
import { ResizablePanel } from "renderer/screens/main/components/ResizablePanel/ResizablePanel";
import type { WorkspaceViewV3 } from "shared/workspace-view-v3";
import { createWorkspacePaneAreaEdits } from "../../../../utils/workspace-pane-area-edits/workspace-pane-area-edits";
import { captureWorkspacePaneAreaLayouts } from "../../../../utils/workspace-pane-areas/workspace-pane-area-layouts";
import {
	createWorkspacePaneAreas,
	type WorkspacePaneArea,
	workspacePaneAreasStructureKey,
} from "../../../../utils/workspace-pane-areas/workspace-pane-areas";
import type { WorkspacePaneAreasScope } from "../../../../utils/workspace-pane-areas/workspace-pane-areas-state";
import { registerWorkstationPaneRuntime } from "../../../../utils/workstation-pane-runtime/workstation-pane-runtime";
import { PaneGrid } from "../PaneGrid/PaneGrid";

type Props = Omit<
	ComponentProps<typeof PaneGrid>,
	"workspace" | "controlled"
> & {
	workspace: WorkspaceViewV3;
	scope: WorkspacePaneAreasScope;
	centerTool?: ReactNode;
	resourceRevision: number;
	onError(message: string): void;
};
export function WorkspacePaneAreas(props: Props) {
	const { t } = useLingui();
	const failureLabel = useRef("");
	failureLabel.current = t({ message: "This window could not be saved." });
	const current = useRef(props);
	current.current = props;
	const ownerKey = JSON.stringify([
		props.scope,
		props.connection?.connectionId,
		props.connection?.generation,
		props.connection?.backendId,
		props.connection?.namespaceId,
		props.connection?.instanceId,
	]);
	const owner = useMemo(
		() => ({
			key: ownerKey,
			areas: createWorkspacePaneAreas(current.current.workspace),
			scope: { ...current.current.scope },
			lease: undefined as object | undefined,
		}),
		[ownerKey],
	);
	const state = useSyncExternalStore(
		owner.areas.subscribe,
		owner.areas.read,
		owner.areas.read,
	);
	const [saveEpoch, settled] = useState(0);
	const [panelWidth, setPanelWidth] = useState(() =>
		Math.floor(window.innerWidth * 0.4),
	);
	const [resizing, setResizing] = useState(false);
	const [availableWidth, setAvailableWidth] = useState(window.innerWidth);
	const container = useRef<HTMLDivElement>(null);
	const interaction = useShellInteractionPassthrough({
		sidebarOpen: state.rightPaneOpen,
	});
	useLayoutEffect(() => {
		const element = container.current;
		if (!element) return;
		const observer = new ResizeObserver((entries) => {
			const width = entries[0]?.contentRect.width;
			if (width && width > 0) setAvailableWidth(width);
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	const maxWidth = Math.max(1, Math.floor(availableWidth * 0.75));
	const minWidth = Math.min(240, maxWidth);

	const runtime = useRef<
		| {
				owner: typeof owner;
				edits: ReturnType<typeof createWorkspacePaneAreaEdits>;
		  }
		| undefined
	>(undefined);
	const {
		api,
		connection,
		workspace,
		actions,
		onError: _onError,
		resourceRevision,
		centerTool,
		scope: _scope,
		...gridProps
	} = props;
	useLayoutEffect(() => {
		const lease = {};
		owner.lease = lease;
		const edits = createWorkspacePaneAreaEdits({
			async save(next, before) {
				if (
					!(await current.current.actions.savePaneAreas(
						owner.scope.workspaceId,
						next,
						before,
						owner.scope,
					))
				)
					throw Error("Workspace pane area save rejected");
			},
			async saveLayouts(next, _before, ids) {
				if (
					!(await current.current.actions.savePaneLayouts(
						owner.scope.workspaceId,
						captureWorkspacePaneAreaLayouts(next, ids),
						owner.scope,
					))
				)
					throw Error("Workspace pane layout save rejected");
			},
			onError() {
				if (owner.lease === lease)
					current.current.onError(failureLabel.current);
			},
			onSettled() {
				if (owner.lease === lease) settled((value) => value + 1);
			},
		});
		runtime.current = { owner, edits };
		const offEdit = owner.areas.subscribeEdits((next, before) =>
			edits.push(next, before),
		);
		const descriptor = current.current.connection;
		const offRuntime = descriptor
			? registerWorkstationPaneRuntime(
					api,
					descriptor,
					owner.scope.workspaceId,
					owner.scope.tabId,
					{
						read: () => owner.areas.center.getState(),
						readAreas: owner.areas.read,
						fingerprint: () =>
							workspacePaneAreasStructureKey(owner.areas.read()),
						subscribe: owner.areas.subscribe,
						replace(next) {
							if (!owner.areas.replaceFromRuntime("center", next))
								throw Error("Workspace pane area retired");
						},
						async flush() {
							owner.areas.flush();
							await edits.flush();
						},
					},
				)
			: undefined;
		return () => {
			offRuntime?.();
			owner.areas.flush();
			const pending = edits.flush();
			offEdit();
			owner.lease = undefined;
			if (runtime.current?.edits === edits) runtime.current = undefined;
			void pending.catch(() => {}).finally(() => edits.dispose());
			queueMicrotask(() => {
				if (!owner.lease) owner.areas.dispose();
			});
		};
	}, [api, owner]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: A settled save retries the snapshot held while its write was pending.
	useLayoutEffect(() => {
		if (runtime.current?.owner !== owner) return;
		owner.areas.flush();
		if (!runtime.current.edits.hasWork()) owner.areas.synchronize(workspace);
	}, [owner, workspace, saveEpoch]);
	const activate = (area: WorkspacePaneArea) => {
		owner.areas.activate(area);
	};
	const add = (
		area: WorkspacePaneArea,
		axis: "horizontal" | "vertical",
		newTab: boolean,
	) => {
		activate(area);
		owner.areas.flush();
		void actions.newTerminal(workspace.workspaceId, axis, undefined, {
			area,
			...(newTab ? { placement: "new-tab" as const } : {}),
		});
	};
	const toggle = () =>
		owner.areas.setRightPaneOpen(!owner.areas.read().rightPaneOpen);
	const sidebarButton = (
		<RightPaneHeaderButton
			label={t({ message: "Toggle sidebar" })}
			onClick={toggle}
		>
			<PanelRight size={14} />
		</RightPaneHeaderButton>
	);
	const menu = (area: WorkspacePaneArea) => (
		<>
			<DropdownMenuItem
				disabled={!connection?.capabilities?.durableOperations || actions.busy}
				onSelect={() => add(area, "horizontal", true)}
			>
				<Trans>New terminal</Trans>
			</DropdownMenuItem>
			{actions.browserEnabled && (
				<DropdownMenuItem
					onSelect={() => {
						void actions.newBrowser(
							workspace.workspaceId,
							undefined,
							"new-tab",
							connection ?? undefined,
							area,
						);
					}}
				>
					<Trans>Browser</Trans>
				</DropdownMenuItem>
			)}
		</>
	);
	const grid = (area: WorkspacePaneArea) => (
		<PaneGrid
			{...gridProps}
			api={api}
			connection={connection}
			actions={actions}
			workspace={workspace}
			key={`${area}:${resourceRevision}`}
			controlled={{
				store: owner.areas[area],
				linkedStores: [owner.areas[area === "center" ? "right" : "center"]],
				area,
				active: state.activePaneArea === area,
				onInteractionStateChange: interaction.onWorkspaceInteractionStateChange,
				onActivate: () => activate(area),
				onMoved: () => activate(area === "center" ? "right" : "center"),
				onNewTerminal: (axis, newTab) => add(area, axis, newTab),
				renderAddTabMenu: () => menu(area),
				renderTabBarTrailing:
					area === "center" ? () => sidebarButton : undefined,
				renderWorkspace:
					area === "right"
						? (workspaceProps) => (
								<RightPaneAreaView
									onActivate={() => activate("right")}
									workspaceProps={workspaceProps}
									headerControls={
										<>
											<RightPaneHeaderButton
												label={t({ message: "Merge into center" })}
												onClick={() => {
													transferAllTabs({
														source: owner.areas.right,
														target: owner.areas.center,
													});
													activate("center");
												}}
											>
												<ArrowLeftToLine size={14} />
											</RightPaneHeaderButton>
											{sidebarButton}
										</>
									}
								/>
							)
						: undefined,
			}}
		/>
	);
	return (
		<div
			ref={container}
			className="flex min-h-0 flex-1"
			data-workstation-pane-areas
		>
			<div
				className="flex min-h-0 min-w-0 flex-1 flex-col"
				data-pane-area="center"
			>
				{centerTool ? (
					<>
						<div className="flex justify-end">{sidebarButton}</div>
						{centerTool}
					</>
				) : (
					grid("center")
				)}
			</div>
			{state.rightPaneOpen && (
				<ResizablePanel
					width={Math.max(minWidth, Math.min(maxWidth, panelWidth))}
					onWidthChange={setPanelWidth}
					isResizing={resizing}
					onResizingChange={(active) => {
						setResizing(active);
						interaction.onSidebarResizeDragging(active);
					}}
					minWidth={minWidth}
					maxWidth={maxWidth}
					handleSide="left"
					onDoubleClickHandle={() =>
						setPanelWidth(Math.floor(availableWidth * 0.4))
					}
					className="flex min-h-0 min-w-0 flex-col"
				>
					{grid("right")}
				</ResizablePanel>
			)}
		</div>
	);
}
