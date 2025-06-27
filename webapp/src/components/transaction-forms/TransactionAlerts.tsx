type TransactionAlertsProps = {
	transactionHash?: string;
	error?: string;
	warning?: string;
};

/**
 * Displays transaction status alerts including success, error, and warning messages
 */
function TransactionAlerts({ transactionHash, error, warning }: TransactionAlertsProps) {
	if (!transactionHash && !error && !warning) {
		return null;
	}

	return (
		<>
			{transactionHash && (
				<div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-md">
					<h3 className="text-sm font-medium text-green-800">Transaction Submitted</h3>
					<p className="mt-1 text-sm text-green-700">
						Transaction Hash: <span className="font-mono break-all">{transactionHash}</span>
					</p>
					<p className="mt-1 text-sm text-green-700">It will be enqueued on Harbour and then proposed to your Safe.</p>
				</div>
			)}

			{error && (
				<div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-md">
					<h3 className="text-sm font-medium text-red-800">Error</h3>
					<p className="mt-1 text-sm text-red-700">{error}</p>
				</div>
			)}

			{warning && (
				<div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
					<h3 className="text-sm font-medium text-yellow-800">Warning</h3>
					<p className="mt-1 text-sm text-yellow-700">{warning}</p>
				</div>
			)}
		</>
	);
}

export { TransactionAlerts };
