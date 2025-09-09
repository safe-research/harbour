import { createFileRoute } from "@tanstack/react-router";
import { ConditionalBackButton } from "@/components/BackButton";
import { Box, Container, ContainerTitle } from "@/components/Groups";
import { QuotaOverview } from "@/components/harbour/QuotaOverview";
import { EncryptionForm } from "@/components/settings/EncryptionForm";
import {
	SettingsForm,
	useCurrentSettings,
} from "@/components/settings/SettingsForm";
import { WakuForm } from "@/components/settings/WakuForm";
import { useSupportsEncryption } from "@/hooks/useSupportsEncryption";

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
	const [currentSettings, loadSettings] = useCurrentSettings();
	const { data: supportsEncryption } = useSupportsEncryption(currentSettings);

	return (
		<Container>
			<ConditionalBackButton />
			<ContainerTitle>Settings</ContainerTitle>
			{currentSettings ? (
				<>
					<Box>
						<WakuForm currentSettings={currentSettings} />
					</Box>
					{supportsEncryption && (
						<Box className="mt-4">
							<EncryptionForm currentSettings={currentSettings} />
						</Box>
					)}
					<Box className="mt-4">
						<SettingsForm
							currentSettings={currentSettings}
							onSubmitted={loadSettings}
						/>
					</Box>
					{currentSettings.quotaManagerAddress && (
						<QuotaOverview
							quotaManagerAddress={currentSettings.quotaManagerAddress}
							className="mt-4"
						/>
					)}
				</>
			) : (
				<Box>Loading...</Box>
			)}
		</Container>
	);
}
