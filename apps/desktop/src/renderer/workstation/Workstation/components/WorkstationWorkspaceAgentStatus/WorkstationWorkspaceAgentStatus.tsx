import { highestAgentStatus } from "@superset/shared/agent-status";
import type {
	DirectDescriptor,
	DirectWorkstationApi,
} from "shared/direct-workstation";
import type { WorkstationAgentSeenMark } from "shared/workstation-agent-seen";
import { useWorkstationAgentStatuses } from "../../hooks/useWorkstationAgentStatuses";
import { WorkstationAgentStatus } from "../WorkstationAgentStatus";

export function WorkstationWorkspaceAgentStatus({
	api,
	connection,
	workspaceId,
	seenMarks,
}: {
	api: DirectWorkstationApi;
	connection: DirectDescriptor | null;
	workspaceId: string;
	seenMarks: readonly WorkstationAgentSeenMark[];
}) {
	const serviceUid = connection?.serviceUid;
	const verified =
		typeof serviceUid === "number" &&
		Number.isSafeInteger(serviceUid) &&
		serviceUid >= 1;
	const statuses = useWorkstationAgentStatuses({
		api,
		connection: verified ? connection : null,
		serviceUid: serviceUid ?? 0,
		workspaceId,
		seenMarks,
	});
	return (
		<WorkstationAgentStatus
			status={highestAgentStatus(statuses.values()) ?? undefined}
		/>
	);
}
