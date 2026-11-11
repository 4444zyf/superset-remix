import { errorMessage } from "@superset/i18n/errors";
import { useCallback, useEffect, useRef, useState } from "react";
import type { useWorkstationPreferences } from "../useWorkstationPreferences";

type Preferences = ReturnType<typeof useWorkstationPreferences>;

export function usePaneAreaWidthPreference(
	preferences: Preferences,
	available: boolean,
	onError: (message: string) => void,
) {
	const [intent, setIntent] = useState<{ width: number } | null>(null);
	const [processing, setProcessing] = useState(false);
	const inFlight = useRef(false);
	const current = useRef({ preferences, onError });
	current.current = { preferences, onError };
	const enabled = available && !preferences.snapshot?.invalid;
	useEffect(() => {
		if (!enabled) {
			setIntent(null);
			return;
		}
		if (
			!intent ||
			processing ||
			inFlight.current ||
			preferences.loading ||
			preferences.saving ||
			!preferences.snapshot
		)
			return;
		inFlight.current = true;
		setProcessing(true);
		void current.current.preferences
			.update({ rightPaneAreaWidth: intent.width })
			.catch((error) => current.current.onError(errorMessage(error)))
			.finally(() => {
				inFlight.current = false;
				setIntent((pending) => (pending === intent ? null : pending));
				setProcessing(false);
			});
	}, [
		enabled,
		intent,
		processing,
		preferences.loading,
		preferences.saving,
		preferences.snapshot,
	]);
	const commit = useCallback((width: number) => setIntent({ width }), []);
	return {
		width:
			(enabled ? intent?.width : undefined) ??
			preferences.snapshot?.values.rightPaneAreaWidth,
		commit: enabled ? commit : undefined,
	};
}
