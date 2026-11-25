import { useEffect, useMemo, useState } from "react";
import type { TerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { deriveTerminalAgentStatus } from "renderer/hooks/host-service/useTerminalAgentStatuses/deriveTerminalAgentStatus";
import type {
	DirectDescriptor,
	DirectWorkstationApi,
} from "shared/direct-workstation";
import type { ActivePaneStatus } from "shared/tabs-types";
import type { WorkspaceViewV3 } from "shared/workspace-view-v3";
import {
	type WorkstationAgentSeenMark,
	workstationAgentSeenKey,
} from "shared/workstation-agent-seen";
import { getWorkstationEventBus } from "../../../../providers/WorkstationFileEvents/get-workstation-event-bus";

interface Entry {
	binding: TerminalAgentBinding;
	key: string;
}
const EMPTY = new Map<string, Entry>();
const hostIsVisible = () =>
	document.hasFocus() && document.visibilityState === "visible";
const schedulePoll = (callback: () => void) => {
	const timer = setInterval(callback, 2000);
	return () => clearInterval(timer);
};
export function useWorkstationAgentStatuses({
	api,
	connection,
	serviceUid,
	workspace,
	seenMarks,
	onSeen,
	schedule = schedulePoll,
	isVisible = hostIsVisible,
}: {
	api: DirectWorkstationApi;
	connection: DirectDescriptor | null;
	serviceUid: number;
	workspace: WorkspaceViewV3 | undefined;
	seenMarks: readonly WorkstationAgentSeenMark[];
	onSeen?: (mark: WorkstationAgentSeenMark) => void;
	schedule?: (callback: () => void) => () => void;
	isVisible?: () => boolean;
}): ReadonlyMap<string, ActivePaneStatus> {
	const workspaceId = workspace?.workspaceId;
	const owner = JSON.stringify([
		connection?.connectionId,
		connection?.generation,
		connection?.backendId,
		connection?.namespaceId,
		serviceUid,
		connection?.instanceId,
		workspace?.workspaceId,
	]);
	const terminalIds = JSON.stringify(
		workspace?.panes
			.filter((p) => p.kind === "terminal")
			.map((p) => p.resourceId)
			.sort() ?? [],
	);
	const [state, setState] = useState<{
		owner: string;
		entries: Map<string, Entry>;
	}>({ owner: "", entries: EMPTY });
	useEffect(() => {
		if (
			!connection ||
			!workspaceId ||
			connection.capabilities?.workstationAgentFeedbackV1 !== true
		)
			return;
		const resources = new Set<string>(JSON.parse(terminalIds));
		if (!resources.size) return;
		let alive = true,
			busy = false,
			requested = false,
			streamOpen = false;
		const refresh = async () => {
			if (!alive) return;
			if (busy) {
				requested = true;
				return;
			}
			busy = true;
			requested = false;
			try {
				const bindings = await api.rpc<TerminalAgentBinding[]>({
					connectionId: connection.connectionId,
					generation: connection.generation,
					path: "terminalAgents.listByWorkspace",
					type: "query",
					input: { workspaceId },
				});
				if (!Array.isArray(bindings)) throw Error("Invalid agent bindings");
				const current = new Map<string, TerminalAgentBinding>();
				for (const binding of bindings) {
					if (
						binding.workspaceId !== workspaceId ||
						!resources.has(binding.terminalId) ||
						typeof binding.lastEventType !== "string" ||
						!Number.isSafeInteger(binding.lastEventAt) ||
						binding.lastEventAt < 0
					)
						continue;
					const previous = current.get(binding.terminalId);
					if (!previous || binding.lastEventAt >= previous.lastEventAt)
						current.set(binding.terminalId, binding);
				}
				const entries = new Map(
					await Promise.all(
						[...current].map(
							async ([id, binding]) =>
								[
									id,
									{
										binding,
										key: await workstationAgentSeenKey({
											backendId: connection.backendId,
											namespaceId: connection.namespaceId,
											serviceUid,
											workspaceId,
											terminalId: id,
										}),
									},
								] as const,
						),
					),
				);
				if (alive) setState({ owner, entries });
			} catch {
				if (alive) setState({ owner, entries: EMPTY });
			} finally {
				busy = false;
				if (requested && alive) void refresh();
			}
		};
		void refresh();
		const bus =
			connection.capabilities?.workstationFileEventsV1 === true
				? getWorkstationEventBus(api, connection)
				: null;
		const release = bus?.retain();
		const offAgent = bus?.on("agent:lifecycle", workspaceId, (id, payload) => {
			if (id === workspaceId && resources.has(payload.terminalId))
				void refresh();
		});
		const offBindings = bus?.on("agent:bindings-changed", workspaceId, (id) => {
			if (id === workspaceId) void refresh();
		});
		const offTerminal = bus?.on(
			"terminal:lifecycle",
			workspaceId,
			(id, payload) => {
				if (id === workspaceId && resources.has(payload.terminalId))
					void refresh();
			},
		);
		const updateConnection = () => {
			const open = bus?.getConnectionStatus().state === "open";
			const opened = open && !streamOpen;
			streamOpen = open;
			if (opened) void refresh();
		};
		const offStatus = bus?.subscribeConnectionStatus(updateConnection);
		if (bus) updateConnection();
		const stop = schedule(() => {
			if (!streamOpen) void refresh();
		});
		const focus = () => void refresh();
		window.addEventListener("focus", focus);
		document.addEventListener("visibilitychange", focus);
		return () => {
			alive = false;
			stop();
			offStatus?.();
			offAgent?.();
			offBindings?.();
			offTerminal?.();
			release?.();
			window.removeEventListener("focus", focus);
			document.removeEventListener("visibilitychange", focus);
		};
	}, [api, connection, serviceUid, owner, terminalIds, schedule, workspaceId]);
	const entries =
		state.owner === owner &&
		connection?.capabilities?.workstationAgentFeedbackV1 === true
			? state.entries
			: EMPTY;
	const seen = useMemo(
		() => new Map(seenMarks.map((mark) => [mark.key, mark.at])),
		[seenMarks],
	);
	const statuses = useMemo(() => {
		const result = new Map<string, ActivePaneStatus>();
		for (const [id, { binding, key }] of entries) {
			const status = deriveTerminalAgentStatus({
				lastEventType: binding.lastEventType,
				lastEventAt: binding.lastEventAt,
				lastSeenAt: seen.get(key),
			});
			if (status !== "idle") result.set(id, status);
		}
		return result;
	}, [entries, seen]);
	const active = workspace?.panes.find(
		(p) => p.paneId === workspace.activePaneId && p.kind === "terminal",
	);
	const activeResourceId = active?.resourceId;
	const visible =
		workspace?.activePaneArea === "right"
			? workspace.rightPaneOpen === true
			: workspace?.activeTool !== "files";
	useEffect(() => {
		if (
			!activeResourceId ||
			!visible ||
			!onSeen ||
			!isVisible() ||
			statuses.get(activeResourceId) !== "review"
		)
			return;
		const entry = entries.get(activeResourceId);
		if (entry) onSeen({ key: entry.key, at: entry.binding.lastEventAt });
	}, [activeResourceId, visible, onSeen, entries, statuses, isVisible]);
	return statuses;
}
