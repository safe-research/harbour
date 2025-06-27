import { ethers } from "ethers";
import { Trash2 } from "lucide-react";

import { SendButton } from "./SendButton";

type Token = {
	address: string;
	name: string;
	symbol: string;
	decimals: number;
	balance: bigint;
};

type TokenListProps = {
	tokens: Token[];
	onSendToken: (tokenAddress: string) => void;
	onRemoveToken: (tokenAddress: string) => void;
};

/**
 * Displays a list of ERC20 tokens with balances and actions
 */
function TokenList({ tokens, onSendToken, onRemoveToken }: TokenListProps) {
	if (tokens.length === 0) {
		return <p className="text-sm text-gray-500">No ERC20 tokens added yet.</p>;
	}

	return (
		<ul className="space-y-3">
			{tokens.map((token) => (
				<li
					key={token.address}
					className="p-3 bg-gray-50 border border-gray-200 rounded-md flex justify-between items-center hover:bg-gray-100 transition-colors"
				>
					<div>
						<p className="font-semibold text-gray-800">
							{token.name} ({token.symbol})
						</p>
						<p className="text-sm text-gray-600">
							{ethers.formatUnits(token.balance, token.decimals)}
						</p>
					</div>
					<div className="flex items-center space-x-2">
						<SendButton
							onClick={() => onSendToken(token.address)}
							disabled={token.balance === 0n}
						/>
						<button
							type="button"
							onClick={() => onRemoveToken(token.address)}
							className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-full focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
							aria-label="Remove token"
						>
							<Trash2 size={18} />
						</button>
					</div>
				</li>
			))}
		</ul>
	);
}

export { TokenList };
export type { Token };
