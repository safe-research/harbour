import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import SafeConfigDisplay from "../components/SafeConfigDisplay";
import SafeConfigForm from "../components/SafeConfigForm";
import { useSafeConfiguration } from "../hooks/useSafeConfiguration";

export function App() {
	const [rpcUrl, setRpcUrl] = useState("");
	const [safeAddress, setSafeAddress] = useState("");
	const [submitted, setSubmitted] = useState(false);

	const { data, isLoading, error } = useSafeConfiguration(rpcUrl, safeAddress);

	const handleSubmit = (rpc: string, safe: string) => {
		setRpcUrl(rpc);
		setSafeAddress(safe);
		setSubmitted(true);
	};

	return (
		<div className="max-w-3xl mx-auto p-4">
			<SafeConfigForm onSubmit={handleSubmit} />
			{submitted && (
				<div className="mt-6">
					{isLoading && <p className="text-gray-600">Loading configuration…</p>}
					{error && <p className="text-red-600">Error: {error.message}</p>}
					{data && <SafeConfigDisplay config={data.fullConfig} nextCursor={data.nextCursor} />}
				</div>
			)}
		</div>
	);
}

export const Route = createFileRoute("/")({
	component: App,
});
