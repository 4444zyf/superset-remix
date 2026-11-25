import { expect, test } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import { canDropWorkspaceItem } from "./canDropWorkspaceItem";

function store() {
	const value = createWorkspaceStore<string>();
	value.getState().addTab({
		id: "tab",
		panes: [{ id: "pane", kind: "terminal", data: "resource" }],
	});
	return value;
}

test("pane split targets accept existing panes and whole tabs from their own store", () => {
	const own = store();
	expect(canDropWorkspaceItem({ store: own, paneId: "pane" }, [own])).toBe(
		true,
	);
	expect(canDropWorkspaceItem({ store: own, tabId: "tab" }, [own])).toBe(true);
});

test("pane split targets accept linked area tabs and reject stale items", () => {
	const own = store(),
		linked = store(),
		allowed = [own, linked];
	expect(canDropWorkspaceItem({ store: linked, paneId: "pane" }, allowed)).toBe(
		true,
	);
	expect(canDropWorkspaceItem({ store: linked, tabId: "tab" }, allowed)).toBe(
		true,
	);
	linked.getState().removeTab("tab");
	expect(canDropWorkspaceItem({ store: linked, paneId: "pane" }, allowed)).toBe(
		false,
	);
	expect(canDropWorkspaceItem({ store: linked, tabId: "tab" }, allowed)).toBe(
		false,
	);
});

test("matching IDs from an unrelated store never authorize a split transfer", () => {
	const own = store(),
		foreign = store();
	for (const source of [foreign, undefined, {}]) {
		expect(canDropWorkspaceItem({ store: source, paneId: "pane" }, [own])).toBe(
			false,
		);
		expect(canDropWorkspaceItem({ store: source, tabId: "tab" }, [own])).toBe(
			false,
		);
	}
	expect(canDropWorkspaceItem({ store: own }, [own])).toBe(false);
	expect(canDropWorkspaceItem({ store: own, tabId: "missing" }, [own])).toBe(
		false,
	);
	expect(
		canDropWorkspaceItem({ store: own, paneId: "missing", tabId: "tab" }, [
			own,
		]),
	).toBe(false);
});
