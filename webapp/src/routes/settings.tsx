import { createFileRoute } from "@tanstack/react-router";
import { ConditionalBackButton } from "@/components/BackButton";
import { Box, Container, ContainerTitle } from "@/components/Groups";
import {
	SettingsForm,
	useCurrentSettings,
} from "@/components/settings/SettingsForm";

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
				{currentSettings ? (
					<SettingsForm currentSettings={currentSettings} />
				) : (
					"Loading..."
				)}
			</Box>
		</Container>
	);
}
