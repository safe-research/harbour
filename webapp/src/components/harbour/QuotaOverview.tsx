import { zodResolver } from "@hookform/resolvers/zod";
import { useConnectWallet } from "@web3-onboard/react";
import { getAddress } from "ethers";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Box, BoxTitle } from "@/components/Groups";
import type { SettingsFormData } from "@/components/settings/SettingsForm";
import { useQuotaStats } from "@/hooks/useQuotaStats";
import { useHarbourRpcProvider } from "@/hooks/useRpcProvider";
import { checkedAddressSchema } from "@/lib/validators";
import { FormItem, SubmitItem } from "../Forms";

const createQuotaStatsFormSchema = () =>
	z.object({
		signerAddress: z.union([checkedAddressSchema, z.literal("")]),
	});

type QuotaStatsFormData = z.infer<
	ReturnType<typeof createQuotaStatsFormSchema>
>;

function QuotaOverview({
	currentSettings,
	className,
}: {
	currentSettings: Partial<SettingsFormData>;
	className: string;
}) {
	const [{ wallet }] = useConnectWallet();
	const [signerAddress, setSignerAddress] = useState<string | undefined>();
	const { provider: harbourProvider } = useHarbourRpcProvider();
	const {
		quotaStats,
		isLoading: isLoadingQuota,
		refresh,
	} = useQuotaStats(
		harbourProvider,
		signerAddress,
		currentSettings.harbourAddress,
	);

	const {
		register,
		handleSubmit,
		formState: { errors },
		reset,
	} = useForm<QuotaStatsFormData>({
		resolver: zodResolver(createQuotaStatsFormSchema()),
	});
	useEffect(() => {
		const accAddress = wallet?.accounts[0]?.address;
		if (!accAddress) return;
		const checkedAccAddress = getAddress(accAddress);
		setSignerAddress(checkedAccAddress);
		reset({ signerAddress: checkedAccAddress });
	}, [wallet, reset]);

	const onSubmit = async (data: QuotaStatsFormData) => {
		setSignerAddress(data.signerAddress);
		refresh();
	};

	return (
		<Box className={className}>
			<form
				onSubmit={handleSubmit(onSubmit)}
				className="flex flex-row-reverse gap-4 mb-4"
			>
				<SubmitItem
					actionTitle="Refresh"
					isSubmitting={isLoadingQuota}
					showProcessingText={false}
					className="mw-32 h-14 mt-2"
				/>
				<FormItem
					id="signerAddress"
					register={register}
					error={errors.signerAddress}
					label="Signer Address"
					className="w-full"
				/>
			</form>
			<div className={"grid gap-2 md:grid-cols-3 grid-cols-1"}>
				<Box>
					<BoxTitle>Available Quota</BoxTitle>
					{isLoadingQuota ? "-" : quotaStats.availableFreeQuota}
				</Box>
				<Box>
					<BoxTitle>Used Quota</BoxTitle>
					{isLoadingQuota ? "-" : quotaStats.usedSignerQuota}
				</Box>
				<Box>
					<BoxTitle>Next Reset</BoxTitle>
					{isLoadingQuota
						? "-"
						: new Date(quotaStats.nextSignerQuotaReset * 1000).toLocaleString()}
				</Box>
			</div>
		</Box>
	);
}

export { QuotaOverview };
