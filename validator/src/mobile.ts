import { createLightNode, IEncoder, LightNode } from "@waku/sdk";
import {
	SafeHarbourTopicTransactionsV1,
	SafeTransactionPacket,
} from "./waku/safe.js";
import { SafeTransactionWithDomain } from "./safe/types.js";

var logger: Pick<Console, "log" | "error"> = console
var node: LightNode | undefined;
var encoder: IEncoder | undefined;

export function setLogger(_logger: Pick<Console, "log" | "error">) {
	logger = _logger;
}

export function connectedPeers(callback: (count: number) => void) {
	const _node = node;
	if (_node === undefined) {
		callback(0);
		return;
	}
	_node.getConnectedPeers()
		.then((peers) => {
			callback(peers.length)
		})
		.catch(() => {
			callback(0)
		})
}

/**
 * Initializes the Waku light node and subscribes to transaction topics.
 * This function is exported so it can be called from a script tag in HTML.
 * @param browserConfig - The configuration object, passed from the browser.
 */
export async function setup() {
	const _node = await createLightNode({ defaultBootstrap: true });
	logger.log("Waku node configured. configuring encoder");
	node = _node
	encoder = node.createEncoder({
		contentTopic: SafeHarbourTopicTransactionsV1,
		ephemeral: true,
	});
	logger.log("Encoder configured; starting node");
	await _node.start();
	logger.log("Waku node started, waiting for peers...");
	await _node.waitForPeers();
	logger.log("Waku peers found.");
	logger.log("✅ Worker initialized and ready for sending messages.");
}

export function isAvailable(): boolean {
	const _node = node
	return (
		_node !== undefined &&
		_node.isConnected() &&
		_node.isStarted()
	);
}

export async function send(
		transaction: SafeTransactionWithDomain,
		signature: string,
	): Promise<boolean> {
	const _node = node
	const _encoder = encoder
	if (
		_node === undefined ||
		_encoder === undefined ||
		!isAvailable()
	) {
		console.error("Waku is not available");
		return false;
	}
	logger.log({ transaction, signature });
	// Create a new message object
	const protoMessage = SafeTransactionPacket.create({
		...transaction,
		safe: transaction.safe,
		chainId: transaction.chainId.toString(),
		signature,
	});
	logger.log({ protoMessage });

	// Serialise the message using Protobuf
	const serialisedMessage =
		SafeTransactionPacket.encode(protoMessage).finish();

	logger.log("Send Message");
	// Send the message using Light Push
	const response = await _node.lightPush.send(_encoder, {
		payload: serialisedMessage,
	});
	logger.log(
		`Done: ${response.successes.length > 0 ? `Transmitted to ${response.successes.length} peers` : "Could not send message"}`,
	);
	return response.successes.length > 0;
}