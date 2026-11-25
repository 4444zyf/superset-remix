import { expect, test } from "bun:test";
import type {
	DirectDescriptor,
	DirectSocketEvent,
	DirectWorkstationApi,
} from "shared/direct-workstation";
import { getWorkstationEventBus } from "./get-workstation-event-bus";

test("file and agent consumers share one owned transport and isolate API, namespace, generation and instance", async () => {
	const opened: string[] = [],
		closed: string[] = [];
	const listeners = new Set<(event: DirectSocketEvent) => void>();
	const api = {
		onSocket: (listener: (event: DirectSocketEvent) => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		openSocket: async (
			_connection: DirectDescriptor,
			path: string,
			id: string,
		) => {
			expect(path).toBe("/events");
			opened.push(id);
		},
		closeSocket: async (id: string) => {
			closed.push(id);
		},
		sendSocket: async () => {},
	} as unknown as DirectWorkstationApi;
	const connection: DirectDescriptor = {
		connectionId: "connection",
		generation: 1,
		namespaceId: "namespace",
		backendId: "backend",
		instanceId: "instance",
	};
	const file = getWorkstationEventBus(api, connection),
		agent = getWorkstationEventBus(api, { ...connection });
	const releaseFile = file.retain(),
		releaseAgent = agent.retain();
	await Promise.resolve();
	expect(opened.length).toBe(1);
	const isolated = [
		getWorkstationEventBus({ ...api }, connection),
		getWorkstationEventBus(api, { ...connection, namespaceId: "other" }),
		getWorkstationEventBus(api, { ...connection, generation: 2 }),
		getWorkstationEventBus(api, { ...connection, instanceId: "other" }),
	].map((bus) => bus.retain());
	await Promise.resolve();
	expect(opened.length).toBe(5);
	releaseFile();
	expect(closed).toEqual([]);
	releaseAgent();
	expect(closed).toEqual([opened[0] as string]);
	for (const release of isolated) release();
	expect(closed.length).toBe(5);
	expect(listeners.size).toBe(0);
	const releaseAgain = agent.retain();
	await Promise.resolve();
	expect(opened.length).toBe(6);
	releaseAgain();
	expect(listeners.size).toBe(0);
});
