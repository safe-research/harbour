import { zodResolver } from "@hookform/resolvers/zod";
import { useConnectWallet } from "@web3-onboard/react";
import { getAddress } from "ethers";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Box } from "@/components/Groups";
import type { SettingsFormData } from "@/components/settings/SettingsForm";
import { useHarbourRpcProvider } from "@/hooks/useRpcProvider";
import { checkedAddressSchema } from "@/lib/validators";
import { FormItem, SubmitItem } from "../Forms";
import { QuotaStats } from "./QuotaStats";
import { QuotaTokenBalance } from "./QuotaTokenBalance";

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
	const [refreshCounter, setRefreshCounter] = useState<number>(0);
	const [isLoadingQuota, setIsLoadingQuota] = useState<boolean>(false);
	const { provider: harbourProvider } = useHarbourRpcProvider();

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
		setRefreshCounter((prev) => prev + 1);
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
			<QuotaStats
				harbourAddress={currentSettings.harbourAddress}
				signerAddress={signerAddress}
				harbourProvider={harbourProvider}
				refreshTrigger={refreshCounter}
				updateIsLoading={(loading) => setIsLoadingQuota(loading)}
			/>
			<QuotaTokenBalance
				key={refreshCounter}
				harbourAddress={currentSettings.harbourAddress}
				signerAddress={signerAddress}
				harbourProvider={harbourProvider}
				className="mt-2"
			/>
		</Box>
	);
}

export { QuotaOverview };
