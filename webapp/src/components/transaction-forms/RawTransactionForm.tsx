import { signAndEnqueueSafeTransaction } from "@/lib/harbour";
import { getSafeTransaction } from "@/lib/safe";
import { nonceSchema } from "@/lib/validators";
import { useNavigate } from "@tanstack/react-router";
import { ethers, isAddress } from "ethers";

import type React from "react";
import { useState } from "react";
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
	const [nonce, setNonce] = useState(config.nonce.toString());

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [txHash, setTxHash] = useState<string>();
	const [error, setError] = useState<string>();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(undefined);
		setTxHash(undefined);

		// Basic field validation
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

		// Nonce validation with Zod
		const nonceParse = nonceSchema(config.nonce.toString()).safeParse(nonce);
		if (!nonceParse.success) {
			setError(nonceParse.error.errors[0].message);
			return;
		}

		const currentNonce = nonce === "" ? BigInt(config.nonce) : BigInt(nonce);

		try {
			setIsSubmitting(true);

			const transaction = getSafeTransaction({
				chainId,
				safeAddress,
				to,
				value: ethers.parseEther(value || "0").toString(),
				data: dataInput || "0x",
				nonce: currentNonce.toString(),
			});

			const receipt = await signAndEnqueueSafeTransaction(browserProvider, transaction);

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
						className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
						required
					/>
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
						className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
					/>
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
						className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 font-mono text-sm"
					/>
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
						className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
					/>
					<p className="mt-1 text-sm text-gray-500">
						Current Safe nonce: <span className="font-medium">{config.nonce.toString()}</span>
					</p>
				</div>

				<div className="pt-4">
					<button
						type="submit"
						disabled={isSubmitting}
						className="w-full px-6 py-3 bg-gray-900 text-white rounded-md disabled:opacity-50"
					>
						{isSubmitting ? "Processing..." : "Sign & Enqueue Raw Transaction"}
					</button>
				</div>

				{txHash && (
					<div className="mt-6 p-4 bg-green-50 rounded-md">
						<p className="text-sm text-green-700">
							Transaction Submitted: <span className="font-mono break-all">{txHash}</span>
						</p>
					</div>
				)}

				{error && (
					<div className="mt-6 p-4 bg-red-50 rounded-md">
						<p className="text-sm text-red-700">{error}</p>
					</div>
				)}
			</form>
		</div>
	);
}
