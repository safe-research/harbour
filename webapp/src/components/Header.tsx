import { Link } from "@tanstack/react-router";
import { useConnectWallet } from "@web3-onboard/react";

export default function Header() {
	const [{ wallet: primaryWallet }, connect, disconnect] = useConnectWallet();
	const address = primaryWallet?.accounts[0]?.address;
	const chainId = primaryWallet?.chains[0]?.id;

	const handleConnect = async () => {
		await connect();
	};

	const handleDisconnect = async () => {
		if (!primaryWallet) return;
		await disconnect({ label: primaryWallet.label });
	};

	return (
		<header className="sticky top-0 z-50 w-full flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
			<nav className="flex flex-row">
				<Link to="/" className="text-xl font-semibold text-black hover:opacity-75 transition">
					Harbour
				</Link>
			</nav>
			<div className="flex items-center gap-2">
				{primaryWallet ? (
					<div className="flex items-center gap-2">
						{chainId && <span className="font-mono text-sm text-gray-600">{chainId}</span>}
						{address && (
							<span className="font-mono text-sm text-gray-900">
								{address.slice(0, 6)}...{address.slice(-4)}
							</span>
						)}
						<button
							type="button"
							onClick={handleDisconnect}
							className="px-4 py-2 text-sm font-medium bg-black text-white rounded hover:bg-gray-800 transition"
						>
							Disconnect
						</button>
					</div>
				) : (
					<button
						type="button"
						onClick={handleConnect}
						className="px-4 py-2 text-sm font-medium bg-black text-white rounded hover:bg-gray-800 transition"
					>
						Connect Wallet
					</button>
				)}
			</div>
		</header>
	);
}
