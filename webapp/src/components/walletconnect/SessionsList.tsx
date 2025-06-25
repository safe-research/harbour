import type { SessionTypes } from "@/lib/walletconnect";

interface SessionsListProps {
	sessionEntries: SessionTypes.Struct[];
	disconnectSession: (topic: string) => void;
}

function SessionsList({ sessionEntries, disconnectSession }: SessionsListProps) {
	return sessionEntries.length === 0 ? (
		<div className="text-center py-8">
			<p className="text-gray-600 text-sm mb-2">No active WalletConnect sessions</p>
			<p className="text-gray-500 text-xs">Connect to a dApp using the form above</p>
		</div>
	) : (
		<ul className="divide-y divide-gray-200">
			{sessionEntries.map((s) => {
				const expiryDate = new Date(s.expiry * 1000);
				const isExpired = expiryDate < new Date();

				return (
					<li key={s.topic} className="py-3 flex items-center justify-between">
						<div className="flex-1 min-w-0">
							<p className="font-medium text-gray-900">{s.peer.metadata.name}</p>
							<p className="text-gray-600 text-xs truncate">{s.peer.metadata.url}</p>
						</div>
						<div className="ml-4 flex items-center space-x-4">
							<span className={`text-xs ${isExpired ? "text-red-500" : "text-gray-500"}`}>
								{isExpired ? "Expired" : `Expires ${expiryDate.toLocaleString()}`}
							</span>
							<button
								type="button"
								onClick={() => disconnectSession(s.topic)}
								className="text-sm text-red-600 hover:underline"
							>
								End Session
							</button>
						</div>
					</li>
				);
			})}
		</ul>
	);
}

export { SessionsList };
