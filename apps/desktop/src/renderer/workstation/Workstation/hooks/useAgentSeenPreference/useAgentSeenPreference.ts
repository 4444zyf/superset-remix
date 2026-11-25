import { errorMessage } from "@superset/i18n/errors";
import { useEffect, useMemo, useRef } from "react";
import type { WorkstationAgentSeenMark } from "shared/workstation-agent-seen";
import type { useWorkstationPreferences } from "../useWorkstationPreferences";
import { AgentSeenQueue } from "./agent-seen-queue";

const EMPTY: readonly WorkstationAgentSeenMark[] = [];
export function useAgentSeenPreference(
	preferences: ReturnType<typeof useWorkstationPreferences>,
	available: boolean,
	onError: (message: string) => void,
) {
	const current = useRef(onError);
	current.current = onError;
	const queue = useMemo(
		() =>
			new AgentSeenQueue(preferences.client, (error) =>
				current.current(errorMessage(error)),
			),
		[preferences.client],
	);
	useEffect(
		() => (available ? queue.connect() : undefined),
		[queue, available],
	);
	return {
		marks: preferences.snapshot?.values.agentSeenMarks ?? EMPTY,
		commit:
			available && !preferences.snapshot?.invalid ? queue.enqueue : undefined,
	};
}
