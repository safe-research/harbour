import { useConnectWallet } from "@web3-onboard/react";
import { BrowserProvider } from "ethers";
import { createContext, use, useMemo } from "react";

const WalletIllustration = () => (
	<svg
		width="240"
		height="180"
		viewBox="0 0 240 180"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
		className="mx-auto mb-6"
		role="img"
		aria-label="Wallet illustration"
	>
		<title>Wallet illustration</title>
		<rect x="20" y="40" width="200" height="120" rx="8" fill="#f8f8f8" />
		<rect x="40" y="20" width="160" height="40" rx="4" fill="#f0f0f0" />
		<rect x="80" y="30" width="80" height="20" rx="2" fill="#d0d0d0" />
		<rect x="60" y="90" width="120" height="8" rx="4" fill="#e0e0e0" />
		<rect x="60" y="110" width="80" height="6" rx="3" fill="#f0f0f0" />
		<rect x="170" y="90" width="80" height="40" rx="4" fill="#333333" />
		<path d="M190 110H220V120H190V110Z" fill="white" />
		<circle cx="205" cy="100" r="5" fill="white" />
	</svg>
);

const WalletContext = createContext<BrowserProvider | null>(null);

interface RequireWalletProps {
	/** The child components to render once a wallet is connected and provider is available. */
	children: React.ReactNode;
}

/**
 * Custom hook to get the Ethers BrowserProvider from the connected wallet.
 * It memoizes the provider instance.
 * @returns The BrowserProvider instance, or undefined if no wallet is connected.
 */
function useBrowserProvider(): BrowserProvider | undefined {
	const [{ wallet }] = useConnectWallet();

	return useMemo(() => {
		if (!wallet) return undefined;
		return new BrowserProvider(wallet.provider);
	}, [wallet]);
}

/**
 * A component that requires a wallet connection to render its children.
 * If no wallet is connected, it displays a connection prompt.
 * If a wallet is connected but the provider is not yet initialized, it shows a loading state.
 * Once connected and provider is ready, it makes the Ethers BrowserProvider available via context.
 * @param {RequireWalletProps} props - The component props.
 * @returns JSX element, either a connection prompt, loading indicator, or children wrapped in WalletContext.Provider.
 */
export function RequireWallet({ children }: RequireWalletProps) {
	const [{ wallet }, connect] = useConnectWallet();
	const provider = useBrowserProvider();

	if (!wallet) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
				<div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center border border-gray-200">
					<WalletIllustration />
					<h2 className="text-2xl font-bold text-gray-900 mb-3">Connect Your Wallet</h2>
					<p className="text-gray-700 mb-8">To get started, connect your Ethereum wallet to access the application</p>
					<button
						type="button"
						onClick={() => connect()}
						className="w-full flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors duration-200"
					>
						<svg
							className="w-5 h-5 mr-2"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							xmlns="http://www.w3.org/2000/svg"
							role="img"
							aria-label="Connect wallet"
						>
							<title>Connect wallet</title>
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
						</svg>
						Connect Wallet
					</button>
				</div>
			</div>
		);
	}

	if (!provider) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-gray-50">
				<div className="text-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4" />
					<p className="text-gray-800 font-medium">Initializing your wallet...</p>
					<p className="text-sm text-gray-600 mt-2">This should only take a moment</p>
				</div>
			</div>
		);
	}

	return <WalletContext.Provider value={provider}>{children}</WalletContext.Provider>;
}

/**
 * Hook to access the BrowserProvider from context.
 * Must be used within a RequireWallet tree.
 */
export function useWalletProvider(): BrowserProvider {
	const provider = use(WalletContext);
	if (!provider) {
		throw new Error("useWalletProvider must be used within RequireWallet");
	}
	return provider;
}
