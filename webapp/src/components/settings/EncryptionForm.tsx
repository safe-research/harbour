import { type BrowserProvider, ethers, type JsonRpcApiProvider } from "ethers";
import { ExternalLink } from "lucide-react";
import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	useTransition,
} from "react";
import type { SettingsFormData } from "@/components/settings/SettingsForm";
import { useSession } from "@/contexts/SessionContext";
import { useBrowserProvider } from "@/hooks/useBrowserProvider";
import { useHarbourRpcProvider } from "@/hooks/useRpcProvider";
import { secretHarbourAt, supportsSecretHarbourInterface } from "@/lib/harbour";

interface EncryptionFormParameters {
	currentSettings: Partial<SettingsFormData>;
}

function EncryptionFormInner({
	wallet,
	harbourAddress,
	provider,
}: {
	wallet: BrowserProvider;
	harbourAddress: string;
	provider: JsonRpcApiProvider;
}) {
	const { keys, pendingRegistration, isUpdating, connect, create, error } =
		useSession();
	const [relayerBalance, setRelayerBalance] = useState("");
	const [needsFunding, setNeedsFunding] = useState<boolean | null>(null);
	const [isGnosisChain, setIsGnosisChain] = useState<boolean>(false);
	const [isRegistereing, startRegistration] = useTransition();

	const connectWallet = useCallback(() => {
		connect(wallet, async (address) => {
			const harbour = secretHarbourAt(harbourAddress, provider);
			const [context, publicKey] = await harbour.retrieveEncryptionKey(address);
			return { context, publicKey };
		});
	}, [harbourAddress, provider, wallet, connect]);

	const handleSignin = useCallback(async () => {
		create(wallet, async () => {
			const { chainId } = await provider.getNetwork();
			return chainId;
		});
	}, [wallet, provider, create]);

	const handleRegistration = useCallback(
		() =>
			startRegistration(async () => {
				const relayer = keys?.relayer?.connect(provider);
				if (!pendingRegistration || !relayer) {
					throw new Error(
						"cannot register without pending registration or relayer",
					);
				}

				const { chainId } = await provider.getNetwork();
				const signer = await wallet.getSigner();
				const signature = await signer.signTypedData(
					{
						verifyingContract: harbourAddress,
						salt: ethers.toBeHex(chainId, 32),
					},
					{
						EncryptionKey: [
							{ name: "context", type: "bytes32" },
							{ name: "publicKey", type: "bytes32" },
						],
					},
					pendingRegistration,
				);
				const harbour = secretHarbourAt(harbourAddress, relayer);
				const transaction = await harbour.registerEncryptionKeyFor(
					await signer.getAddress(),
					pendingRegistration.context,
					pendingRegistration.publicKey,
					signature,
				);
				await transaction.wait();

				// reconnect the wallet for the onchain registration check.
				connectWallet();
			}),
		[
			harbourAddress,
			wallet,
			provider,
			keys,
			pendingRegistration,
			connectWallet,
		],
	);

	useEffect(() => {
		connectWallet();
	}, [connectWallet]);

	useEffect(() => {
		const relayer = keys?.relayer?.address;
		if (!relayer) {
			return () => {};
		}

		const updateBalance = async () => {
			try {
				const { chainId } = await provider.getNetwork();
				const balance = await provider.getBalance(relayer);
				const amount = ethers.formatEther(balance);
				setRelayerBalance(`Ξ${amount}`);
				setNeedsFunding(balance === 0n);
				setIsGnosisChain(chainId === 100n);
			} catch (err) {
				console.error(err);
			}
		};

		updateBalance();
		const interval = setInterval(updateBalance, 5000);
		return () => clearInterval(interval);
	}, [provider, keys]);

	return (
		<div>
			<span className="block text-sm font-medium text-gray-700 mb-1">
				Encryption
			</span>
			{!keys && !isUpdating && (
				<button
					type="button"
					onClick={handleSignin}
					className="px-4 py-2 text-sm font-medium bg-black text-white rounded hover:bg-gray-800 transition"
				>
					Sign In
				</button>
			)}
			{keys && (
				<div className="flex space-x-2 pl-4">
					<span className="text-sm">
						Public Key: <code>{keys.encryption.publicKeyHex}</code>
					</span>
				</div>
			)}
			{keys && (
				<div className="flex space-x-2 pl-4">
					<span className="text-sm">
						Notary: <code>{keys.relayer.address}</code>
						{needsFunding && isGnosisChain ? (
							<a
								className="ml-3 underline"
								target="_blank"
								rel="noopener noreferrer"
								href={`https://faucet.gnosischain.com/?address=${keys.relayer.address}`}
							>
								<ExternalLink className="inline" size={16} /> fund
							</a>
						) : (
							<span className="ml-3 text-gray-700">{relayerBalance}</span>
						)}
					</span>
					{pendingRegistration && (
						<button
							type="button"
							disabled={needsFunding !== false || isRegistereing}
							onClick={handleRegistration}
							className="px-4 py-2 text-sm font-medium bg-black text-white rounded hover:bg-gray-800 transition ml-auto disabled:opacity-50 disabled:cursor-not-allowed"
						>
							Register
						</button>
					)}
				</div>
			)}
			{error && <p className="mt-1 text-sm text-red-600">{error?.message}</p>}
		</div>
	);
}

function EncryptionForm({ currentSettings }: EncryptionFormParameters) {
	const { provider } = useHarbourRpcProvider();
	const wallet = useBrowserProvider();
	const { disconnect } = useSession();
	const [supported, setSupported] = useState(false);

	const harbourAddress = currentSettings?.harbourAddress;

	const params = useMemo(() => {
		return harbourAddress && provider && wallet && supported
			? { harbourAddress, provider, wallet }
			: null;
	}, [harbourAddress, provider, wallet, supported]);

	useEffect(() => {
		if (harbourAddress && provider) {
			supportsSecretHarbourInterface(harbourAddress, provider).then(
				setSupported,
			);
		} else {
			setSupported(false);
		}
	}, [harbourAddress, provider]);

	useEffect(() => {
		if (!params) {
			disconnect();
		}
	}, [params, disconnect]);

	return <>{params && <EncryptionFormInner {...params} />}</>;
}

export { EncryptionForm, type EncryptionFormParameters };
