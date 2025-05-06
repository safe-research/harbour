import { Link } from "@tanstack/react-router";
import { useConnectWallet } from "@web3-onboard/react";

export default function Header() {
	const [{ wallet: primaryWallet, connecting }, connect, disconnect] = useConnectWallet();
	const address = primaryWallet?.accounts[0]?.address;
	const chainId = primaryWallet?.chains[0]?.id;

	const handleConnect = async () => {
		await connect();
	};

	const handleDisconnect = async () => {
		await disconnect({ label: primaryWallet?.label });
	};

	return (
		<header className="p-2 flex gap-2 bg-white text-black justify-between">
			<nav className="flex flex-row">
				<div className="px-2 font-bold">
					<Link to="/">Home</Link>
				</div>

				<div className="px-2 font-bold">
					<Link to="/demo/tanstack-query">TanStack Query</Link>
				</div>
			</nav>
			<div className="flex items-center gap-2">
				{primaryWallet ? (
					<div className="flex items-center gap-2">
						{chainId && <span className="font-mono">{chainId}</span>}
						{address && (
							<span className="font-mono">
								{address.slice(0, 6)}...{address.slice(-4)}
							</span>
						)}
						<button type="button" onClick={handleDisconnect} className="px-3 py-1 bg-gray-200 rounded">
							Disconnect
						</button>
					</div>
				) : (
					<button type="button" onClick={handleConnect} className="px-3 py-1 bg-blue-500 text-white rounded">
						Connect Wallet
					</button>
				)}
			</div>
		</header>
	);
}
