import { highestAgentStatus } from "@superset/shared/agent-status";
import type {
	DirectDescriptor,
	DirectWorkstationApi,
} from "shared/direct-workstation";
import type { ActivePaneStatus } from "shared/tabs-types";
import type { WorkspaceViewV3 } from "shared/workspace-view-v3";
import type { WorkstationAgentSeenMark } from "shared/workstation-agent-seen";
import { useWorkstationAgentStatuses } from "../../../../hooks/useWorkstationAgentStatuses";
import { WorkstationAgentStatus } from "../../../WorkstationAgentStatus";

export function WorkspaceTabAgentStatus({
	api,
	connection,
	serviceUid,
	workspace,
	seenMarks,
	activeStatuses,
}: {
	api: DirectWorkstationApi;
	connection: DirectDescriptor | null;
	serviceUid: number;
	workspace: WorkspaceViewV3;
	seenMarks: readonly WorkstationAgentSeenMark[];
	activeStatuses?: ReadonlyMap<string, ActivePaneStatus>;
}) {
	const backgroundStatuses = useWorkstationAgentStatuses({
		api,
		connection: activeStatuses ? null : connection,
		serviceUid,
		workspace: activeStatuses ? undefined : workspace,
		seenMarks,
	});
	const statuses = activeStatuses ?? backgroundStatuses;
	return (
		<WorkstationAgentStatus
			status={highestAgentStatus(statuses.values()) ?? undefined}
		/>
	);
}
