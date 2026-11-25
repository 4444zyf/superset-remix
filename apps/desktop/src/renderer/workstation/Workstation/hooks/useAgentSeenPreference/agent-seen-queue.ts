import {
	MAX_AGENT_SEEN_MARKS,
	mergeWorkstationAgentSeenMarks,
	type WorkstationAgentSeenMark,
} from "shared/workstation-agent-seen";
import type { PreferenceClient } from "../useWorkstationPreferences/preference-client";

export class AgentSeenQueue {
	private active = false;
	private inFlight = false;
	private readonly pending = new Map<string, WorkstationAgentSeenMark>();
	private readonly attempted = new Map<string, number>();
	constructor(
		private readonly client: Pick<
			PreferenceClient,
			"getSnapshot" | "subscribe" | "update"
		>,
		private readonly onError: (error: unknown) => void,
	) {}
	connect(): () => void {
		this.active = true;
		const unsubscribe = this.client.subscribe(() => this.flush());
		this.flush();
		return () => {
			this.active = false;
			this.pending.clear();
			unsubscribe();
		};
	}
	enqueue = (mark: WorkstationAgentSeenMark): void => {
		if (
			!/^[a-f0-9]{64}$/.test(mark.key) ||
			!Number.isSafeInteger(mark.at) ||
			mark.at < 0
		)
			throw Error("Invalid agent seen mark");
		if (
			mark.at <= (this.attempted.get(mark.key) ?? -1) ||
			mark.at <= (this.pending.get(mark.key)?.at ?? -1)
		)
			return;
		this.pending.delete(mark.key);
		this.pending.set(mark.key, { ...mark });
		if (this.pending.size > MAX_AGENT_SEEN_MARKS) {
			const oldest = this.pending.keys().next().value;
			if (oldest !== undefined) this.pending.delete(oldest);
		}
		this.flush();
	};
	private flush(): void {
		const state = this.client.getSnapshot();
		if (
			!this.active ||
			this.inFlight ||
			!this.pending.size ||
			state.loading ||
			state.saving ||
			!state.snapshot ||
			state.snapshot.invalid
		)
			return;
		const batch = [...this.pending.values()];
		this.pending.clear();
		for (const mark of batch) {
			this.attempted.delete(mark.key);
			this.attempted.set(mark.key, mark.at);
			if (this.attempted.size > MAX_AGENT_SEEN_MARKS) {
				const oldest = this.attempted.keys().next().value;
				if (oldest !== undefined) this.attempted.delete(oldest);
			}
		}
		const before = state.snapshot.values.agentSeenMarks ?? [],
			next = mergeWorkstationAgentSeenMarks(before, batch);
		if (JSON.stringify(before) === JSON.stringify(next)) return;
		this.inFlight = true;
		void this.client
			.update({ agentSeenMarks: next })
			.catch((error) => {
				if (this.active) this.onError(error);
			})
			.finally(() => {
				this.inFlight = false;
				this.flush();
			});
	}
}
