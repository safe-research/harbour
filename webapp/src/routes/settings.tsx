import { createFileRoute } from "@tanstack/react-router";
import { ConditionalBackButton } from "@/components/BackButton";
import { Box, Container, ContainerTitle } from "@/components/Groups";
import { QuotaOverview } from "@/components/harbour/QuotaOverview";
import {
	SettingsForm,
	useCurrentSettings,
} from "@/components/settings/SettingsForm";
import { WakuForm } from "@/components/settings/WakuForm";

/**
 * Page component for the Harbour settings.
 * @returns JSX element for the dashboard page.
 */
export const Route = createFileRoute("/settings")({
	component: SettingsPage,
});
/**
 *
 * Page component for the Harbour settings.
 * @returns JSX element for the dashboard page.
 */
export function SettingsPage() {
	const [currentSettings] = useCurrentSettings();

	return (
		<Container>
			<ConditionalBackButton />
			<ContainerTitle>Settings</ContainerTitle>
			<Box>
				<WakuForm />
			</Box>
			<Box className="mt-4">
				{currentSettings ? (
					<SettingsForm currentSettings={currentSettings} />
				) : (
					"Loading..."
				)}
			</Box>
			{currentSettings && (
				<QuotaOverview currentSettings={currentSettings} className="mt-4" />
			)}
		</Container>
	);
}
