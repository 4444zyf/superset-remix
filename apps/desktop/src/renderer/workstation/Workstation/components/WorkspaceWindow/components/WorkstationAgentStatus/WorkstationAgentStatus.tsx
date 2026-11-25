import { useLingui } from "@lingui/react/macro";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import type { ActivePaneStatus } from "shared/tabs-types";
export function WorkstationAgentStatus({
	status,
}: {
	status: ActivePaneStatus | undefined;
}) {
	const { t } = useLingui();
	if (!status) return null;
	const labels = {
		working: t({ message: "Working" }),
		permission: t({ message: "Needs input" }),
		failed: t({ message: "Failed" }),
		review: t({ message: "Ready for review" }),
	};
	return (
		<output
			className="inline-flex shrink-0 items-center"
			aria-label={labels[status]}
			title={labels[status]}
			data-workstation-agent-status={status}
		>
			<StatusIndicator status={status} />
		</output>
	);
}
