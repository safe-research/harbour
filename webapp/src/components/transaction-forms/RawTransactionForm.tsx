import { switchToChain } from "@/lib/chains";
import { HARBOUR_CHAIN_ID, enqueueSafeTransaction } from "@/lib/harbour";
import { signSafeTransaction } from "@/lib/safe";
import type { FullSafeTransaction } from "@/lib/types";
import { useNavigate } from "@tanstack/react-router";
import { ethers, isAddress } from "ethers";
import type React from "react";
import { useEffect, useState } from "react";
import type { CommonTransactionFormProps } from "./types";

/**
 * A form component for creating and enqueuing a raw, custom transaction for a Gnosis Safe.
 * Users can specify the recipient address, ETH value, data payload, and nonce.
 * It handles input validation, transaction signing, and submission to the Harbour service.
 */
export function RawTransactionForm({ safeAddress, chainId, browserProvider, config }: CommonTransactionFormProps) {
	const navigate = useNavigate();

	const [to, setTo] = useState("");
	const [value, setValue] = useState(""); // ETH value string
	const [dataInput, setDataInput] = useState(""); // Hex data string
	const [nonce, setNonce] = useState(""); // Nonce string

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [txHash, setTxHash] = useState<string>();
	const [error, setError] = useState<string>();

	// Validation states
	const isToValid = to === "" ? false : isAddress(to); // Allow empty initially, but require for submission
	const isValueValid = value === "" || !Number.isNaN(Number(value)); // ETH value, can be 0
	const isDataValid = dataInput === "" || ethers.isHexString(dataInput); // Data, can be "0x" or empty
	const isNonceValid =
		nonce === "" || (!Number.isNaN(Number(nonce)) && Number.isInteger(Number(nonce)) && Number(nonce) >= 0);

	useEffect(() => {
		if (config) {
			setNonce(config.nonce.toString());
		}
	}, [config]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(undefined);
		setTxHash(undefined);

		if (!isAddress(to)) {
			setError("Invalid 'To' address.");
			return;
		}
		if (Number.isNaN(Number(value))) {
			setError("Invalid 'Value'. Must be a number (e.g., 0.1).");
			return;
		}
		if (dataInput !== "" && !ethers.isHexString(dataInput)) {
			setError("Invalid 'Data'. Must be a valid hex string (e.g., 0x123abc).");
			return;
		}

		const currentNonce = nonce !== "" ? BigInt(nonce) : config.nonce;
		if (Number.isNaN(currentNonce) || BigInt(currentNonce) < 0) {
			setError("Invalid nonce. Must be a non-negative integer.");
			return;
		}

		try {
			setIsSubmitting(true);

			const transaction: FullSafeTransaction = {
				to,
				value: ethers.parseEther(value || "0").toString(),
				data: dataInput || "0x",
				nonce: currentNonce.toString(),
				safeAddress,
				chainId,
				operation: 0, // CALL operation
				safeTxGas: "0",
				baseGas: "0",
				gasPrice: "0",
				gasToken: ethers.ZeroAddress,
				refundReceiver: ethers.ZeroAddress,
			};

			await switchToChain(browserProvider, chainId);
			const signer = await browserProvider.getSigner();
			const signature = await signSafeTransaction(signer, transaction);

			await switchToChain(browserProvider, HARBOUR_CHAIN_ID);
			const receipt = await enqueueSafeTransaction(signer, transaction, signature);

			setTxHash(receipt.transactionHash);
			navigate({ to: "/queue", search: { safe: safeAddress, chainId } });
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : "Transaction failed";
			setError(message);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
			<form onSubmit={handleSubmit} className="space-y-6">
				<div>
					<label htmlFor="to" className="block text-sm font-medium text-gray-700 mb-1">
						To Address
					</label>
					<input
						id="to"
						type="text"
						value={to}
						onChange={(e) => setTo(e.target.value)}
						placeholder="0x..."
						className="mt-1 block w-full border border-gray-300 bg-white text-gray-900 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900"
						required
					/>
					{!isToValid && to !== "" && (
						<p className="mt-1 text-sm text-red-600">Please enter a valid Ethereum address.</p>
					)}
				</div>

				<div>
					<label htmlFor="value" className="block text-sm font-medium text-gray-700 mb-1">
						Value (ETH)
					</label>
					<input
						id="value"
						type="text"
						value={value}
						onChange={(e) => setValue(e.target.value)}
						placeholder="0.0"
						className="mt-1 block w-full border border-gray-300 bg-white text-gray-900 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900"
					/>
					{!isValueValid && value !== "" && <p className="mt-1 text-sm text-red-600">Please enter a valid number.</p>}
				</div>

				<div>
					<label htmlFor="data" className="block text-sm font-medium text-gray-700 mb-1">
						Data (Hex String)
					</label>
					<input
						id="data"
						type="text"
						value={dataInput}
						onChange={(e) => setDataInput(e.target.value)}
						placeholder="0x..."
						className="mt-1 block w-full border border-gray-300 bg-white text-gray-900 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900 font-mono text-sm"
					/>
					{!isDataValid && dataInput !== "" && (
						<p className="mt-1 text-sm text-red-600">Please enter a valid hex string (e.g., 0x123 or 0x).</p>
					)}
				</div>

				<div>
					<label htmlFor="nonce" className="block text-sm font-medium text-gray-700 mb-1">
						Nonce
					</label>
					<input
						id="nonce"
						type="number"
						value={nonce}
						onChange={(e) => setNonce(e.target.value)}
						min="0"
						step="1"
						className="mt-1 block w-full border border-gray-300 bg-white text-gray-900 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900"
					/>
					<p className="mt-1 text-sm text-gray-500">
						Current Safe nonce: <span className="font-medium">{config.nonce.toString()}</span> - Leave blank or use this
						to use current Safe nonce.
					</p>
					{!isNonceValid && nonce !== "" && (
						<p className="mt-1 text-sm text-red-600">Please enter a valid non-negative integer.</p>
					)}
				</div>

				<div className="pt-4">
					<button
						type="submit"
						disabled={isSubmitting || !to || !isToValid || !isValueValid || !isDataValid || !isNonceValid}
						className="w-full flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
					>
						{isSubmitting ? (
							<>
								<svg
									className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
								>
									<title>Processing...</title>
									<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
									<path
										className="opacity-75"
										fill="currentColor"
										d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
									/>
								</svg>
								Processing...
							</>
						) : (
							"Sign & Enqueue Raw Transaction"
						)}
					</button>
				</div>

				{txHash && (
					<div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-md">
						<h3 className="text-sm font-medium text-green-800">Transaction Submitted</h3>
						<p className="mt-1 text-sm text-green-700">
							Transaction Hash: <span className="font-mono break-all">{txHash}</span>
						</p>
					</div>
				)}

				{error && (
					<div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-md">
						<h3 className="text-sm font-medium text-red-800">Error</h3>
						<p className="mt-1 text-sm text-red-700">{error}</p>
					</div>
				)}
			</form>
		</div>
	);
}
