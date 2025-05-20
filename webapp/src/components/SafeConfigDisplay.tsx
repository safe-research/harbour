import type { SafeConfiguration } from "@/lib/safe";

interface SafeConfigDisplayProps {
	config: SafeConfiguration;
}

export default function SafeConfigDisplay({ config }: SafeConfigDisplayProps) {
	const { owners, threshold, fallbackHandler, nonce, modules, guard, singleton } = config;
	return (
		<div className="space-y-6">
			<div className="bg-white border border-gray-200 rounded-lg p-6">
				<h2 className="text-lg font-semibold mb-5 text-black">Basic Configuration</h2>
				<dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
					<div className="sm:col-span-2">
						<dt className="font-medium text-gray-700">Safe Singleton</dt>
						<dd className="mt-1 text-blue-600 break-all">{singleton}</dd>
					</div>
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

			<div className="bg-white border border-gray-200 rounded-lg p-6">
				<h2 className="text-lg font-semibold mb-5 text-black">Owners ({owners.length})</h2>
				<ul className="list-disc list-inside text-black space-y-2">
					{owners.map((owner) => (
						<li key={owner} className="text-blue-600 break-all">
							{owner}
						</li>
					))}
				</ul>
			</div>

			<div className="bg-white border border-gray-200 rounded-lg p-6">
				<h2 className="text-lg font-semibold mb-5 text-black">Modules ({modules.length})</h2>
				{modules.length > 0 ? (
					<ul className="list-disc list-inside text-black space-y-2">
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
		</div>
	);
}
