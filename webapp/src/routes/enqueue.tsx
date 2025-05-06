import { useSafeConfiguration } from "@/hooks/useSafeConfiguration";
import { HARBOUR_ABI, HARBOUR_ADDRESS } from "@/lib/contract";
import { Link, createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { useConnectWallet } from "@web3-onboard/react";
import { BrowserProvider, Contract, isAddress, parseEther } from "ethers";
import { useEffect, useState } from "react";
import { z } from "zod";

// Zero address constant
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Define the route before the component so Route is in scope
export const Route = createFileRoute("/enqueue")({
	validateSearch: zodValidator(
		z.object({
			rpcUrl: z.string().url("Invalid RPC URL"),
			safe: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Safe address"),
		}),
	),
	component: EnqueuePage,
});

export function EnqueuePage() {
	// Read validated RPC URL and Safe address from search params
	const { rpcUrl, safe: safeAddress } = Route.useSearch();

	// Wallet connection
	const [{ wallet: primaryWallet }, connect] = useConnectWallet();

	// Fetch current Safe configuration to get nonce
	const {
		data: configResult,
		isLoading: isLoadingConfig,
		error: configError,
	} = useSafeConfiguration(rpcUrl, safeAddress);

	// Form state
	const [to, setTo] = useState("");
	const [value, setValue] = useState("");
	const [dataInput, setDataInput] = useState("");
	const [nonce, setNonce] = useState("");

	// Transaction state
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [txHash, setTxHash] = useState<string>();
	const [error, setError] = useState<string>();

	// Input validation
	const isToValid = to === "" ? false : isAddress(to);
	const isValueValid = value === "" || !Number.isNaN(Number(value));
	const isNonceValid = nonce === "" || !Number.isNaN(Number(nonce));

	// When config loads, default nonce
	useEffect(() => {
		if (configResult) {
			setNonce(configResult.fullConfig.nonce.toString());
		}
	}, [configResult]);

	const handleConnect = async () => {
		await connect();
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(undefined);

		if (!primaryWallet) {
			await connect();
			if (!primaryWallet) {
				setError("Wallet not connected");
				return;
			}
		}

		try {
			setIsSubmitting(true);
			// Initialize ethers provider and signer
			const provider = new BrowserProvider(primaryWallet.provider);
			const signer = await provider.getSigner();

			// Determine chainId
			const network = await provider.getNetwork();
			const chainId = network.chainId;

			// Build EIP-712 domain for Safe transaction (verifyingContract is the Safe address)
			const domain = { chainId, verifyingContract: safeAddress };

			// Typed data types matching SafeInternationalHarbour._SAFE_TX_TYPEHASH
			const types = {
				SafeTx: [
					{ name: "to", type: "address" },
					{ name: "value", type: "uint256" },
					{ name: "data", type: "bytes" },
					{ name: "operation", type: "uint8" },
					{ name: "safeTxGas", type: "uint256" },
					{ name: "baseGas", type: "uint256" },
					{ name: "gasPrice", type: "uint256" },
					{ name: "gasToken", type: "address" },
					{ name: "refundReceiver", type: "address" },
					{ name: "nonce", type: "uint256" },
				],
			};

			// Determine transaction nonce (use user input or current Safe nonce)
			const txNonce = nonce !== "" ? BigInt(nonce) : (configResult?.fullConfig.nonce ?? BigInt(0));

			// Construct message according to SafeTx struct
			const message = {
				to,
				value: parseEther(value || "0"),
				data: dataInput,
				operation: 0,
				safeTxGas: 0,
				baseGas: 0,
				gasPrice: 0,
				gasToken: ZERO_ADDRESS,
				refundReceiver: ZERO_ADDRESS,
				nonce: txNonce,
			};

			// Sign EIP-712 typed data (safeTxHash) for Safe transaction
			const signature: string = await signer.signTypedData(domain, types, message);

			// Initialize Harbour contract and enqueue transaction
			const harbourContract = new Contract(HARBOUR_ADDRESS, HARBOUR_ABI, signer);
			const tx = await harbourContract.enqueueTransaction(
				safeAddress,
				chainId,
				txNonce,
				to,
				parseEther(value || "0"),
				dataInput,
				0,
				0,
				0,
				0,
				ZERO_ADDRESS,
				ZERO_ADDRESS,
				signature,
			);
			const receipt = await tx.wait();
			setTxHash(receipt.transactionHash);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : "Transaction failed";
			setError(message);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="max-w-3xl mx-auto p-4 space-y-4">
			<h1 className="text-2xl font-bold">Enqueue Transaction</h1>
			<p className="text-sm text-gray-600">Safe: {safeAddress}</p>
			<p className="text-sm text-gray-600">RPC URL: {rpcUrl}</p>

			<Link to="/config" search={{ rpcUrl, safe: safeAddress }} className="text-blue-600 hover:underline">
				← Back
			</Link>

			{!primaryWallet && (
				<button type="button" onClick={handleConnect} className="px-4 py-2 bg-blue-600 text-white rounded-md">
					Connect Wallet
				</button>
			)}

			{configError && <p className="text-red-600">Error: {configError.message}</p>}
			{isLoadingConfig && <p className="text-gray-600">Loading Safe configuration…</p>}

			{!isLoadingConfig && !configError && (
				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<label htmlFor="to" className="block font-medium">
							To
						</label>
						<input
							id="to"
							type="text"
							value={to}
							onChange={(e) => setTo(e.target.value)}
							placeholder="0x..."
							className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
						/>
					</div>

					<div>
						<label htmlFor="value" className="block font-medium">
							Value (ETH)
						</label>
						<input
							id="value"
							type="text"
							value={value}
							onChange={(e) => setValue(e.target.value)}
							placeholder="0.0"
							className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
						/>
					</div>

					<div>
						<label htmlFor="data" className="block font-medium">
							Data (0x...)
						</label>
						<input
							id="data"
							type="text"
							value={dataInput}
							onChange={(e) => setDataInput(e.target.value)}
							placeholder="0x..."
							className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
						/>
					</div>

					<div>
						<label htmlFor="nonce" className="block font-medium">
							Nonce
						</label>
						<input
							id="nonce"
							type="number"
							value={nonce}
							onChange={(e) => setNonce(e.target.value)}
							className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
						/>
						<p className="text-sm text-gray-500">
							Leave blank to use current nonce {configResult?.fullConfig.nonce.toString()}
						</p>
						{nonce !== "" && !isNonceValid && <p className="text-red-600">Invalid nonce</p>}
					</div>

					<button
						type="submit"
						disabled={isSubmitting || !isToValid || !isValueValid || !isNonceValid}
						title={
							!isToValid
								? "Invalid 'To' address"
								: !isValueValid
									? "Invalid value"
									: !isNonceValid
										? "Invalid nonce"
										: undefined
						}
						className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
					>
						{isSubmitting ? "Sending…" : "Sign & Enqueue"}
					</button>

					{txHash && <p className="text-green-600">Transaction Hash: {txHash}</p>}
					{error && <p className="text-red-600">Error: {error}</p>}
				</form>
			)}
		</div>
	);
}
