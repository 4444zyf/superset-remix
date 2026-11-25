export const MAX_AGENT_SEEN_MARKS = 256;

export interface WorkstationAgentSeenMark {
	key: string;
	at: number;
}

export async function workstationAgentSeenKey(scope: {
	backendId: string;
	serviceUid: number;
	namespaceId: string;
	workspaceId: string;
	terminalId: string;
}): Promise<string> {
	const bytes = new TextEncoder().encode(
		JSON.stringify([
			"workstation-agent-seen-v1",
			scope.backendId,
			scope.namespaceId,
			scope.serviceUid,
			scope.workspaceId,
			scope.terminalId,
		]),
	);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest), (value) =>
		value.toString(16).padStart(2, "0"),
	).join("");
}

export function mergeWorkstationAgentSeenMarks(
	current: readonly WorkstationAgentSeenMark[],
	incoming: readonly WorkstationAgentSeenMark[],
): WorkstationAgentSeenMark[] {
	const marks = new Map(current.map((mark) => [mark.key, mark]));
	for (const mark of incoming) {
		if (mark.at <= (marks.get(mark.key)?.at ?? -1)) continue;
		marks.delete(mark.key);
		marks.set(mark.key, { ...mark });
	}
	return [...marks.values()].slice(-MAX_AGENT_SEEN_MARKS);
}
