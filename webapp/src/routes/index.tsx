import { createFileRoute, useNavigate } from "@tanstack/react-router";
import SafeConfigForm from "../components/SafeConfigForm";

export function App() {
	const navigate = useNavigate();
	const handleSubmit = (rpc: string, safe: string) => {
		navigate({ to: "/config", search: { rpcUrl: rpc, safe } });
	};

	return (
		<div className="max-w-3xl mx-auto p-4">
			<SafeConfigForm onSubmit={handleSubmit} />
		</div>
	);
}

export const Route = createFileRoute("/")({
	component: App,
});
