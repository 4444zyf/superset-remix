import { changedWorkspacePaneAreaLayouts } from "../workspace-pane-areas/workspace-pane-area-layouts";
import {
	captureWorkspacePaneAreas,
	type WorkspacePaneAreasState,
	workspacePaneAreasMetadataKey,
	workspacePaneAreasStructureKey,
} from "../workspace-pane-areas/workspace-pane-areas";

interface Edit {
	layoutTabIds?: string[];
	next: WorkspacePaneAreasState;
	before: WorkspacePaneAreasState;
}
interface Options {
	save(
		next: WorkspacePaneAreasState,
		before: WorkspacePaneAreasState,
	): Promise<unknown>;
	saveLayouts?(
		next: WorkspacePaneAreasState,
		before: WorkspacePaneAreasState,
		tabIds: readonly string[],
	): Promise<unknown>;
	onSettled?(): void;
	onError?(error: unknown): void;
	schedule?(callback: () => void, delayMs: number): () => void;
}
export function createWorkspacePaneAreaEdits(options: Options) {
	const schedule =
		options.schedule ??
		((callback, delay) => {
			const timer = setTimeout(callback, delay);
			return () => clearTimeout(timer);
		});
	const inFlight = new Set<Promise<void>>();
	let pending: Edit | undefined,
		cancel: (() => void) | undefined,
		token: object | undefined,
		disposed = false,
		dispatching = false,
		flushing: Promise<void> | undefined,
		errors: unknown[] = [];
	const same = (a: WorkspacePaneAreasState, b: WorkspacePaneAreasState) =>
		workspacePaneAreasMetadataKey(a) === workspacePaneAreasMetadataKey(b) &&
		workspacePaneAreasStructureKey(a) === workspacePaneAreasStructureKey(b);
	const cancelTimer = () => {
		const stop = cancel;
		cancel = undefined;
		token = undefined;
		stop?.();
	};
	const dispatch = () => {
		cancelTimer();
		const edit = pending;
		pending = undefined;
		if (disposed || !edit) return;
		let work: Promise<unknown>;
		dispatching = true;
		try {
			work =
				options.saveLayouts &&
				edit.layoutTabIds?.length &&
				workspacePaneAreasMetadataKey(edit.next) ===
					workspacePaneAreasMetadataKey(edit.before)
					? options.saveLayouts(edit.next, edit.before, edit.layoutTabIds)
					: options.save(edit.next, edit.before);
		} catch (error) {
			work = Promise.reject(error);
		}
		const settled = Promise.resolve(work)
			.then(
				() => {},
				(error) => {
					if (disposed) return;
					errors.push(error);
					try {
						options.onError?.(error);
					} catch (reportError) {
						errors.push(reportError);
					}
				},
			)
			.then(() => {
				inFlight.delete(settled);
				if (!disposed) {
					try {
						options.onSettled?.();
					} catch (error) {
						errors.push(error);
					}
				}
			});
		inFlight.add(settled);
		dispatching = false;
	};
	return {
		hasWork: () => !disposed && (dispatching || !!pending || inFlight.size > 0),
		push(next: WorkspacePaneAreasState, before: WorkspacePaneAreasState): void {
			if (disposed) return;
			const first = pending?.before ?? captureWorkspacePaneAreas(before);
			const layoutTabIds = options.saveLayouts
				? [
						...new Set([
							...(pending?.layoutTabIds ?? []),
							...changedWorkspacePaneAreaLayouts(next, before),
						]),
					]
				: undefined;
			cancelTimer();
			if (same(next, first) && !layoutTabIds?.length) {
				pending = undefined;
				return;
			}
			pending = {
				before: first,
				next: captureWorkspacePaneAreas(next),
				...(layoutTabIds ? { layoutTabIds } : {}),
			};
			if (
				workspacePaneAreasMetadataKey(next) !==
				workspacePaneAreasMetadataKey(first)
			) {
				dispatch();
				return;
			}
			const own = {};
			token = own;
			cancel = schedule(() => {
				if (!disposed && token === own) dispatch();
			}, 250);
		},
		flush(): Promise<void> {
			if (disposed) return Promise.resolve();
			if (flushing) return flushing;
			const work = (async () => {
				do {
					dispatch();
					await Promise.all([...inFlight]);
				} while (!disposed && (pending || inFlight.size));
				if (!disposed && errors.length) {
					const error = errors[0];
					errors = [];
					throw error;
				}
			})();
			flushing = work;
			const clear = () => {
				if (flushing === work) flushing = undefined;
			};
			void work.then(clear, clear);
			return work;
		},
		dispose(): void {
			if (disposed) return;
			disposed = true;
			cancelTimer();
			pending = undefined;
			errors = [];
		},
	};
}
