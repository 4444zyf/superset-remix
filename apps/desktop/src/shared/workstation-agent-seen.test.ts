import { expect, test } from "bun:test";
import {
	MAX_AGENT_SEEN_MARKS,
	mergeWorkstationAgentSeenMarks,
	workstationAgentSeenKey,
} from "./workstation-agent-seen";

test("agent seen keys isolate backend, namespace, service UID, workspace and terminal without using renderer clocks", async () => {
	const scope = {
			backendId: "backend",
			serviceUid: 1000,
			namespaceId: "namespace",
			workspaceId: "workspace",
			terminalId: "terminal",
		},
		key = await workstationAgentSeenKey(scope);
	expect(key).toMatch(/^[a-f0-9]{64}$/);
	expect(await workstationAgentSeenKey({ ...scope })).toBe(key);
	expect(
		await workstationAgentSeenKey({ ...scope, serviceUid: 2000 }),
	).not.toBe(key);
	for (const field of [
		"backendId",
		"namespaceId",
		"workspaceId",
		"terminalId",
	] as const)
		expect(
			await workstationAgentSeenKey({ ...scope, [field]: "other" }),
		).not.toBe(key);
});

test("seen marks are monotonic per host event and retain most recently acknowledged entries within the cap", () => {
	const current = Array.from({ length: MAX_AGENT_SEEN_MARKS }, (_, i) => ({
			key: i.toString(16).padStart(64, "0"),
			at: 100,
		})),
		latest = { key: "f".repeat(64), at: 1 };
	const first = current[0],
		second = current[1];
	if (!first || !second) throw Error("Missing bounded fixture entries");
	const merged = mergeWorkstationAgentSeenMarks(current, [
		{ ...first, at: 99 },
		{ ...second, at: 101 },
		latest,
	]);
	expect(merged).toHaveLength(MAX_AGENT_SEEN_MARKS);
	expect(merged.some((mark) => mark.key === first.key)).toBe(false);
	expect(merged.slice(-2)).toEqual([{ ...second, at: 101 }, latest]);
	expect(second.at).toBe(100);
});
