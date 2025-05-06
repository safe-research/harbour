import type { SafeConfiguration } from "@/lib/contract";

interface SafeConfigDisplayProps {
	config: SafeConfiguration;
	nextCursor: string;
}

export default function SafeConfigDisplay({ config, nextCursor }: SafeConfigDisplayProps) {
	const { owners, threshold, fallbackHandler, nonce, modules, guard } = config;
	return (
		<div className="space-y-6">
			<div className="bg-white shadow rounded-lg p-5">
				<h2 className="text-xl font-semibold mb-4">Basic Configuration</h2>
				<dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div>
						<dt className="font-medium text-gray-700">Threshold</dt>
						<dd className="mt-1 text-gray-900">{threshold.toString()}</dd>
					</div>
					<div>
						<dt className="font-medium text-gray-700">Nonce</dt>
						<dd className="mt-1 text-gray-900">{nonce.toString()}</dd>
					</div>
					<div className="sm:col-span-2">
						<dt className="font-medium text-gray-700">Fallback Handler</dt>
						<dd className="mt-1 text-blue-600 break-all">{fallbackHandler}</dd>
					</div>
					<div className="sm:col-span-2">
						<dt className="font-medium text-gray-700">Guard</dt>
						<dd className="mt-1 text-blue-600 break-all">{guard}</dd>
					</div>
				</dl>
			</div>

			<div className="bg-white shadow rounded-lg p-5">
				<h2 className="text-xl font-semibold mb-4">Owners ({owners.length})</h2>
				<ul className="list-disc list-inside text-gray-900 space-y-1">
					{owners.map((owner) => (
						<li key={owner} className="text-blue-600 break-all">
							{owner}
						</li>
					))}
				</ul>
			</div>

			<div className="bg-white shadow rounded-lg p-5">
				<h2 className="text-xl font-semibold mb-4">Modules ({modules.length})</h2>
				{modules.length > 0 ? (
					<ul className="list-disc list-inside text-gray-900 space-y-1">
						{modules.map((mod) => (
							<li key={mod} className="text-blue-600 break-all">
								{mod}
							</li>
						))}
					</ul>
				) : (
					<p className="text-gray-600">No modules enabled</p>
				)}
			</div>

			{nextCursor !== "0x0000000000000000000000000000000000000000" && (
				<div className="text-sm text-gray-600">More modules available, next cursor: {nextCursor}</div>
			)}
		</div>
	);
}
