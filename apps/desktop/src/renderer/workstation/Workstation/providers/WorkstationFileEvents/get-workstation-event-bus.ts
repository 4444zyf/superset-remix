import { getEventBusForTransport } from "@superset/workspace-client/event-bus-core";
import type {
	DirectDescriptor,
	DirectWorkstationApi,
} from "shared/direct-workstation";
import { WorkstationEventSocket } from "./workstation-event-socket";

const apiIds = new WeakMap<DirectWorkstationApi, string>();
export function getWorkstationEventBus(
	api: DirectWorkstationApi,
	connection: DirectDescriptor,
) {
	let apiId = apiIds.get(api);
	if (!apiId) {
		apiId = crypto.randomUUID();
		apiIds.set(api, apiId);
	}
	const key = JSON.stringify([
		"workstation",
		apiId,
		connection.connectionId,
		connection.backendId,
		connection.namespaceId,
		connection.generation,
		connection.instanceId,
	]);
	return getEventBusForTransport(
		key,
		() => new WorkstationEventSocket(api, connection),
	);
}
