import { zodResolver } from "@hookform/resolvers/zod";
import { ethers, type JsonRpcApiProvider, toBeHex } from "ethers";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Box, BoxTitle } from "@/components/Groups";
import { useBrowserProvider } from "@/hooks/useBrowserProvider";
import { useQuotaTokenStats } from "@/hooks/useQuotaStats";
import { switchToChain } from "@/lib/chains";
import { getShortAddress } from "@/lib/encoding";
import { type ERC20TokenDetails, encodeERC20Approval } from "@/lib/erc20";
import { getHarbourChainId } from "@/lib/harbour";
import { quotaManagerAt } from "@/lib/quotaManager";
import { positiveAmountSchema } from "@/lib/validators";
import { FormItem, SubmitItem } from "../Forms";

const createTokenTopUpFormSchema = () =>
	z.object({
		amount: positiveAmountSchema,
	});

type TokenTopUpFormData = z.infer<
	ReturnType<typeof createTokenTopUpFormSchema>
>;

function buildAmountLabel(
	tokenInfo: Partial<ERC20TokenDetails> | undefined,
): string {
	if (tokenInfo?.balance === undefined) return "Amount";
	return `Amount (Balance: ${ethers.formatUnits(tokenInfo.balance ?? 0, tokenInfo.decimals)})`;
}

function QuotaTokenBalance({
	signerAddress,
	harbourProvider,
	quotaManagerAddress,
	className,
}: {
	signerAddress: string | undefined;
	harbourProvider: JsonRpcApiProvider | null;
	quotaManagerAddress: string | undefined;
	className?: string;
}) {
	const provider = useBrowserProvider();
	const { quotaTokenStats, isLoading } = useQuotaTokenStats(
		harbourProvider,
		signerAddress,
		quotaManagerAddress,
	);

	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm<TokenTopUpFormData>({
		resolver: zodResolver(createTokenTopUpFormSchema()),
	});

	const onSubmit = async (data: TokenTopUpFormData) => {
		if (!provider || !quotaTokenStats || !quotaManagerAddress) return;
		const chainId = await getHarbourChainId();
		console.log({ chainId });
		await switchToChain(provider, chainId);
		const amountInAtoms = ethers.parseUnits(
			data.amount,
			quotaTokenStats.tokenInfo.decimals,
		);
		const quotaManager = quotaManagerAt(quotaManagerAddress);
		const approveTx = {
			to: quotaTokenStats.tokenInfo.address,
			data: encodeERC20Approval(quotaManagerAddress, amountInAtoms),
		};
		const depositTx = {
			to: quotaManagerAddress,
			data: quotaManager.interface.encodeFunctionData(
				"depositTokensForSigner",
				[signerAddress, amountInAtoms],
			),
		};
		try {
			const batchedResponse = await provider.send("wallet_sendCalls", [
				{
					version: "2.0.0",
					chainId: toBeHex(chainId),
					atomicRequired: false,
					calls: [approveTx, depositTx],
				},
			]);
			console.log(batchedResponse);
		} catch (_e) {
			const signer = await provider.getSigner();
			console.log(await signer.sendTransaction(approveTx));
			console.log(await signer.sendTransaction(depositTx));
		}
	};
	return (
		<div className={`grid gap-2 md:grid-cols-3 grid-cols-1 ${className}`}>
			<Box>
				<BoxTitle>Token Info</BoxTitle>
				{quotaTokenStats && (
					<div className="break-all">
						<p>
							{quotaTokenStats.tokenInfo.name
								? quotaTokenStats.tokenInfo.name
								: quotaTokenStats.tokenInfo.address}
						</p>
						{quotaTokenStats.tokenInfo.name &&
							getShortAddress(quotaTokenStats.tokenInfo.address)}
					</div>
				)}
			</Box>
			<Box>
				<BoxTitle>Locked Tokens</BoxTitle>
				{quotaTokenStats && (
					<div className="break-all">
						{ethers.formatUnits(quotaTokenStats.lockedTokens)}{" "}
						{quotaTokenStats.tokenInfo.symbol ?? ""}
					</div>
				)}
			</Box>
			<Box>
				<form onSubmit={handleSubmit(onSubmit)} className="mb-4">
					<FormItem
						id="amount"
						register={register}
						error={errors.amount}
						label={buildAmountLabel(quotaTokenStats?.tokenInfo)}
						className="w-full"
					/>
					<SubmitItem
						actionTitle="Top Up"
						isSubmitting={isLoading}
						showProcessingText={false}
						className="mw-32 h-14 mt-2"
					/>
				</form>
			</Box>
		</div>
	);
}

export { QuotaTokenBalance };
