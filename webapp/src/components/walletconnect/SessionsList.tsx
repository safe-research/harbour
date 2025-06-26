import type { SessionTypes } from "@/lib/walletconnect";

type SessionsListProps = {
	sessionEntries: SessionTypes.Struct[];
	disconnectSession: (topic: string) => void;
};

function SessionsList({ sessionEntries, disconnectSession }: SessionsListProps): JSX.Element {
	return sessionEntries.length === 0 ? (
		<div className="text-center py-8">
			<p className="text-gray-600 text-sm mb-2">No active WalletConnect sessions</p>
			<p className="text-gray-500 text-xs">Connect to a dApp using the form above</p>
		</div>
	) : (
		<div className="space-y-4">
			{sessionEntries.map((s) => {
				const expiryDate = new Date(s.expiry * 1000);
				const isExpired = expiryDate < new Date();

				// Extract session details
				const accounts = Object.values(s.namespaces).flatMap((ns) => ns.accounts);
				const methods = Object.values(s.namespaces).flatMap((ns) => ns.methods);
				const chains = Object.values(s.namespaces).flatMap((ns) => ns.chains || []);

				return (
					<div key={s.topic} className="border border-gray-200 rounded-lg p-4 bg-white">
						<div className="flex items-start justify-between mb-3">
							<div className="flex items-center space-x-3">
								{s.peer.metadata.icons?.[0] && (
									<img
										src={s.peer.metadata.icons[0]}
										alt={`${s.peer.metadata.name} icon`}
										className="w-8 h-8 rounded object-contain bg-gray-50 p-1"
										onError={(e) => {
											e.currentTarget.style.display = "none";
										}}
									/>
								)}
								<div>
									<h3 className="font-medium text-gray-900">{s.peer.metadata.name}</h3>
									{s.peer.metadata.url && (
										<a
											href={s.peer.metadata.url}
											target="_blank"
											rel="noopener noreferrer"
											className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
										>
											{s.peer.metadata.url}
										</a>
									)}
								</div>
							</div>
							<button
								type="button"
								onClick={() => disconnectSession(s.topic)}
								className="text-sm text-red-600 hover:text-red-800 hover:underline"
							>
								End Session
							</button>
						</div>

						{s.peer.metadata.description && <p className="text-sm text-gray-600 mb-3">{s.peer.metadata.description}</p>}

						<div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
							{accounts.length > 0 && (
								<div>
									<h4 className="font-medium text-gray-700 mb-1">Connected Accounts</h4>
									<div className="space-y-1">
										{accounts.map((account) => {
											const [chain, address] = account.split(":").slice(-2);
											return (
												<div key={account} className="text-gray-600 font-mono">
													<span className="text-blue-600">{chain}:</span>
													<span className="ml-1">
														{address?.slice(0, 6)}...{address?.slice(-4)}
													</span>
												</div>
											);
										})}
									</div>
								</div>
							)}

							{chains.length > 0 && (
								<div>
									<h4 className="font-medium text-gray-700 mb-1">Supported Networks</h4>
									<div className="flex flex-wrap gap-1">
										{chains.map((chain) => {
											const chainId = chain.split(":")[1];
											return (
												<span key={chain} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
													{chainId}
												</span>
											);
										})}
									</div>
								</div>
							)}

							{methods.length > 0 && (
								<div className="md:col-span-2">
									<h4 className="font-medium text-gray-700 mb-1">Supported Methods</h4>
									<div className="flex flex-wrap gap-1">
										{methods.slice(0, 8).map((method) => (
											<span key={method} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
												{method}
											</span>
										))}
										{methods.length > 8 && (
											<span className="px-2 py-1 bg-gray-100 text-gray-500 rounded text-xs">
												+{methods.length - 8} more
											</span>
										)}
									</div>
								</div>
							)}
						</div>

						<div className="mt-3 pt-3 border-t border-gray-100 flex justify-between items-center text-xs">
							<span className="text-gray-500">
								Topic:{" "}
								<span className="font-mono">
									{s.topic.slice(0, 8)}...{s.topic.slice(-8)}
								</span>
							</span>
							<span className={`${isExpired ? "text-red-500" : "text-gray-500"}`}>
								{isExpired ? "Expired" : `Expires ${expiryDate.toLocaleString()}`}
							</span>
						</div>
					</div>
				);
			})}
		</div>
	);
}

export { SessionsList };
