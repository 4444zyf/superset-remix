import type { SupportedLocale } from "@superset/i18n/locales";
import type {
	FileAutoSaveMode,
	FileOpenMode,
} from "@superset/shared/file-settings";
import type { SetFontSettingsInput } from "lib/trpc/routers/settings/font-settings.utils";

import type { WorkstationAgentSeenMark } from "./workstation-agent-seen";

export interface WorkstationPreferenceValues {
	agentNativeInputEnabled: boolean;
	language: SupportedLocale | null;
	themeId: string;
	fontSettings: SetFontSettingsInput;
	fileOpenMode: FileOpenMode;
	fileAutoSave: FileAutoSaveMode;
	confirmOnQuit: boolean;
	terminalCopyOnSelect: boolean;
	rightPaneAreaWidth?: number | null;
	agentSeenMarks?: WorkstationAgentSeenMark[];
}
export type WorkstationPreferencePatch = Partial<WorkstationPreferenceValues>;
export interface WorkstationPreferenceSnapshot {
	revision: number;
	invalid: boolean;
	values: WorkstationPreferenceValues;
}
