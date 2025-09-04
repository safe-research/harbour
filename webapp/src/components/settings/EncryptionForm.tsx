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
import { secretHarbourAt, supportsSecretHarbourInterface, fetchEncryptionKeyRegistrationNonce } from "@/lib/harbour";

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

	const handleSignin = useCallback(async () => {
		create();
	}, [create]);

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
				const signerAddress = await signer.getAddress();
				const nonce = await fetchEncryptionKeyRegistrationNonce(signerAddress);
				const deadline = Math.ceil(Date.now() / 1000) + 600; // 10 minutes
				const signature = await signer.signTypedData(
					{
						verifyingContract: harbourAddress,
					},
					{
						EncryptionKeyRegistration: [
							{ name: "context", type: "bytes32" },
							{ name: "publicKey", type: "bytes32" },
							{ name: "harbourChainId", type: "uint256" },
							{ name: "nonce", type: "uint256" },
							{ name: "deadline", type: "uint256" },
						],
					},
					{
						...pendingRegistration,
						harbourChainId: chainId,
						nonce,
						deadline,
					},
				);
				const harbour = secretHarbourAt(harbourAddress, relayer);
				const transaction = await harbour.registerEncryptionKeyFor(
					await signer.getAddress(),
					pendingRegistration.context,
					pendingRegistration.publicKey,
					nonce,
					deadline,
					signature,
				);
				await transaction.wait();

				// reconnect the wallet for the onchain registration check.
				connect();
			}),
		[harbourAddress, wallet, provider, keys, pendingRegistration, connect],
	);

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
			{!keys && (
				<button
					type="button"
					onClick={handleSignin}
					disabled={isUpdating}
					className="px-4 py-2 text-sm font-medium bg-black text-white rounded hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
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
						Notary: <code>{keys.relayer.address}</code>{" "}
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
	const { provider } = useHarbourRpcProvider(currentSettings);
	const wallet = useBrowserProvider();
	const [supported, setSupported] = useState(false);
	const { harbourAddress } = currentSettings || {};

	const params = useMemo(() => {
		return harbourAddress && provider && wallet && supported
			? { harbourAddress, provider, wallet }
			: null;
	}, [harbourAddress, provider, wallet, supported]);

	useEffect(() => {
		let cancelled = false;
		if (harbourAddress && provider) {
			supportsSecretHarbourInterface(harbourAddress, provider).then(
				(supported) => {
					if (!cancelled) {
						setSupported(supported);
					}
				},
			);
		} else {
			setSupported(false);
		}
		return () => {
			cancelled = true;
		};
	}, [harbourAddress, provider]);

	return <>{params && <EncryptionFormInner {...params} />}</>;
}

export { EncryptionForm, type EncryptionFormParameters };
