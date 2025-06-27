import type { HarbourTransactionDetails } from "@/lib/types";

interface TransactionDetailsProps {
	details: HarbourTransactionDetails;
}

export function TransactionDetails({ details }: TransactionDetailsProps) {
	return (
		<div className="text-sm text-gray-700 space-y-1">
			<p>
				<strong>To:</strong> {details.to}
			</p>
			<p>
				<strong>Value:</strong> {details.value} wei
			</p>
			<p className="break-all">
				<strong>Data:</strong>{" "}
				{details.data === "0x" || details.data === ""
					? "0x (No data)"
					: details.data}
			</p>
			<p>
				<strong>Operation:</strong>{" "}
				{details.operation === 0 ? "CALL" : "DELEGATECALL"}
			</p>
		</div>
	);
}
