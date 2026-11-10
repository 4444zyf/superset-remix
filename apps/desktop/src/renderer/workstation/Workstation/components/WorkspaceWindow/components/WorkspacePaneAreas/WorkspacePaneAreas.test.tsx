import { afterEach, expect, test } from "bun:test";
import { TooltipProvider } from "@superset/ui/tooltip";
import {
	act,
	cleanup,
	fireEvent,
	render,
	waitFor,
} from "@testing-library/react";
import { type ReactNode, StrictMode } from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import type {
	DirectDescriptor,
	DirectWorkstationApi,
} from "shared/direct-workstation";
import {
	fixture,
	required,
	workspace,
} from "../../../../../../../main/lib/ssh-direct/workspace-view-area-fixtures.test-data";
import type { WorkspaceViewActions } from "../../../../hooks/useWorkspaceViews/useWorkspaceViews";
import { captureWorkstationPaneRuntime } from "../../../../utils/workstation-pane-runtime/workstation-pane-runtime";
import { WorkspacePaneAreas } from "./WorkspacePaneAreas";

afterEach(cleanup);
function setup(save: () => Promise<unknown> = async () => ({})) {
	const value = fixture(),
		w = workspace(value),
		target = required(value.targets[0]);
	w.rightPaneOpen = true;
	w.panes = w.panes.map((pane) =>
		pane.kind === "browser"
			? {
					paneId: pane.paneId,
					kind: "terminal",
					resourceId: "right-pty",
					executionId: "right-execution",
				}
			: pane,
	);
	const api = {} as DirectWorkstationApi,
		descriptor: DirectDescriptor = {
			connectionId: "local",
			backendId: "backend",
			namespaceId: "namespace",
			instanceId: "instance",
			generation: 1,
			capabilities: { workspaceViewRestoreV1: true },
		};
	let writes = 0;
	const actions = {
		busy: false,
		browserEnabled: false,
		async savePaneAreas() {
			writes++;
			return save();
		},
		async savePaneLayouts() {
			writes++;
			return save();
		},
	} as unknown as WorkspaceViewActions;
	const scope = {
		connectionId: target.connectionId,
		backendId: target.backendId,
		namespaceId: target.namespaceId,
		serviceUid: target.serviceUid,
		targetRevision: target.targetRevision,
		workspaceId: w.workspaceId,
		tabId: w.tabId,
	};
	const element = (next = w, revision = 1, centerTool?: ReactNode) => (
		<StrictMode>
			<DndProvider backend={HTML5Backend}>
				<TooltipProvider>
					<WorkspacePaneAreas
						api={api}
						connection={descriptor}
						workspace={next}
						scope={scope}
						actions={actions}
						checks={[]}
						resourceRevision={revision}
						centerTool={centerTool}
						onError={() => {}}
					/>
				</TooltipProvider>
			</DndProvider>
		</StrictMode>
	);
	return {
		w,
		element,
		writes: () => writes,
		capture: () =>
			captureWorkstationPaneRuntime(api, descriptor, w.workspaceId, w.tabId),
	};
}
test("one paired parent owns both areas through StrictMode and resource reattachment", async () => {
	const f = setup(),
		view = render(f.element());
	await act(async () => {});
	const captured = required(f.capture());
	expect(captured.areas?.center.tabs).toHaveLength(1);
	expect(captured.areas?.right.tabs).toHaveLength(1);
	expect(
		view.container.querySelectorAll('[data-pane-id="terminal"]'),
	).toHaveLength(1);
	expect(
		view.container.querySelectorAll('[data-pane-id="browser"]'),
	).toHaveLength(1);
	view.rerender(f.element(structuredClone(f.w), 2));
	await act(async () => {});
	expect(captured.isCurrent()).toBe(true);
	expect(f.writes()).toBe(0);
	view.unmount();
	expect(f.capture()).toBeNull();
});
test("an incoming snapshot cannot erase the parent title while its save is outstanding", async () => {
	const gate = Promise.withResolvers<unknown>(),
		f = setup(() => gate.promise),
		view = render(f.element());
	const input = required(
		view.container.querySelector<HTMLInputElement>(
			'[data-pane-title-id="terminal"]',
		),
	);
	fireEvent.change(input, { target: { value: "Pending title" } });
	fireEvent.blur(input);
	await waitFor(() => expect(f.writes()).toBe(1));
	view.rerender(f.element(structuredClone(f.w)));
	expect(
		required(
			view.container.querySelector<HTMLInputElement>(
				'[data-pane-title-id="terminal"]',
			),
		).value,
	).toBe("Pending title");
	const saved = structuredClone(f.w);
	required(saved.panes[0]).label = "Pending title";
	view.rerender(f.element(saved));
	await act(async () => {
		gate.resolve({});
		await gate.promise;
	});
	expect(
		required(
			view.container.querySelector<HTMLInputElement>(
				'[data-pane-title-id="terminal"]',
			),
		).value,
	).toBe("Pending title");
	expect(required(f.capture()).isCurrent()).toBe(true);
	view.unmount();
});

test("a rejected parent save releases the held authoritative snapshot without retry", async () => {
	const gate = Promise.withResolvers<unknown>(),
		f = setup(() => gate.promise),
		view = render(f.element());
	const input = required(
		view.container.querySelector<HTMLInputElement>(
			'[data-pane-title-id="terminal"]',
		),
	);
	fireEvent.change(input, { target: { value: "Rejected title" } });
	fireEvent.blur(input);
	await waitFor(() => expect(f.writes()).toBe(1));
	const canonical = structuredClone(f.w);
	required(canonical.panes[0]).label = "Server title";
	view.rerender(f.element(canonical));
	expect(
		required(
			view.container.querySelector<HTMLInputElement>(
				'[data-pane-title-id="terminal"]',
			),
		).value,
	).toBe("Rejected title");
	await act(async () => {
		gate.reject(Error("Save rejected"));
		await gate.promise.catch(() => {});
	});
	await waitFor(() =>
		expect(
			required(
				view.container.querySelector<HTMLInputElement>(
					'[data-pane-title-id="terminal"]',
				),
			).value,
		).toBe("Server title"),
	);
	expect(f.writes()).toBe(1);
	view.unmount();
});

test("the original sidebar resizer changes width and resets without recreating panes or saving a layout", () => {
	const f = setup(),
		view = render(f.element());
	const separator = view.getByRole("separator"),
		initial = Number(separator.getAttribute("aria-valuenow"));
	fireEvent.mouseDown(separator, { clientX: 500 });
	expect(
		document.documentElement.hasAttribute("data-pointer-passthrough"),
	).toBe(true);
	fireEvent.mouseMove(document, { clientX: 450 });
	fireEvent.mouseUp(document);
	expect(Number(separator.getAttribute("aria-valuenow"))).toBeGreaterThan(
		initial,
	);
	expect(
		document.documentElement.hasAttribute("data-pointer-passthrough"),
	).toBe(false);
	fireEvent.doubleClick(separator);
	expect(Number(separator.getAttribute("aria-valuenow"))).toBe(initial);
	expect(f.writes()).toBe(0);
	expect(
		view.container.querySelectorAll('[data-pane-id="browser"]'),
	).toHaveLength(1);
	view.unmount();
});
test("the center Files slot preserves the right pane and the single parent runtime", () => {
	const f = setup(),
		view = render(f.element()),
		captured = required(f.capture());
	view.rerender(f.element(f.w, 1, <div data-files-fixture>Files fixture</div>));
	expect(view.container.querySelector("[data-files-fixture]")).not.toBeNull();
	expect(
		view.container.querySelectorAll('[data-pane-id="terminal"]'),
	).toHaveLength(0);
	expect(
		view.container.querySelectorAll('[data-pane-id="browser"]'),
	).toHaveLength(1);
	expect(captured.isCurrent()).toBe(true);
	expect(required(f.capture()).areas?.center.tabs).toHaveLength(1);
	view.rerender(f.element());
	expect(
		view.container.querySelectorAll('[data-pane-id="terminal"]'),
	).toHaveLength(1);
	expect(f.writes()).toBe(0);
	view.unmount();
});

test("original viewport defaults follow window resize until the user chooses a width", () => {
	const originalWidth = window.innerWidth;
	Object.defineProperty(window, "innerWidth", {
		configurable: true,
		value: 1200,
	});
	const f = setup(),
		view = render(f.element()),
		separator = view.getByRole("separator");
	try {
		expect(separator.getAttribute("aria-valuenow")).toBe("480");
		act(() => {
			Object.defineProperty(window, "innerWidth", {
				configurable: true,
				value: 1000,
			});
			window.dispatchEvent(new Event("resize"));
		});
		expect(separator.getAttribute("aria-valuemax")).toBe("750");
		expect(separator.getAttribute("aria-valuenow")).toBe("400");
		fireEvent.mouseDown(separator, { clientX: 500 });
		fireEvent.mouseMove(document, { clientX: 450 });
		fireEvent.mouseUp(document);
		expect(separator.getAttribute("aria-valuenow")).toBe("450");
		act(() => {
			Object.defineProperty(window, "innerWidth", {
				configurable: true,
				value: 1200,
			});
			window.dispatchEvent(new Event("resize"));
		});
		expect(separator.getAttribute("aria-valuenow")).toBe("450");
		fireEvent.doubleClick(separator);
		expect(separator.getAttribute("aria-valuenow")).toBe("480");
		expect(f.writes()).toBe(0);
	} finally {
		view.unmount();
		Object.defineProperty(window, "innerWidth", {
			configurable: true,
			value: originalWidth,
		});
	}
});
