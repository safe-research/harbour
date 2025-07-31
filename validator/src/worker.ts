import {
	createDecoder,
	createLightNode,
	type IDecodedMessage,
} from "@waku/sdk";
import dotenv from "dotenv";
import { workerConfigSchema } from "./config/schemas";
import { accountFromSeed } from "./utils/signer";
import { SafeTransactionHandler } from "./validator/handler";
import { validateSafeTransactionRequestSchema } from "./validator/schemas";
import {
	SafeHarbourTopicTransactionsV1,
	SafeTransactionPacket,
} from "./waku/safe";

dotenv.config({ path: ".dev.vars" });

async function initializeWorker() {
	const config = workerConfigSchema.parse(process.env);
	const validatorAccount = accountFromSeed(config.VALIDATOR_PK_SEED);
	console.log();
	console.log("----------- Configuration -----------");
	console.log();
	console.log(`Validator account:   ${validatorAccount.address}`);
	console.log(`ChainId:             ${config.SUPPORTED_CHAIN_ID}`);
	console.log(`Harbour address:     ${config.SUPPORTED_HARBOUR}`);
	console.log(`Paymaster address:   ${config.SUPPORTED_PAYMASTER}`);
	console.log(`Entrypoint address:  ${config.SUPPORTED_ENTRYPOINT}`);
	console.log(`Harbour RPC:         ${config.HARBOUR_RPC}`);
	console.log(`Bundler RPC:         ${config.BUNDLER_RPC}`);
	console.log();
	console.log("-------------------------------------");
	console.log();
	console.log();

	const node = await createLightNode({ defaultBootstrap: true });
	console.log("Configured");
	await node.start();
	console.log(node.isConnected());
	console.log("Started --- Waiting for peers");
	await node.waitForPeers();
	console.log("Found Peer --- Configure decoder");
	console.log(node.libp2p.getPeers());

	const decoder = createDecoder(SafeHarbourTopicTransactionsV1);
	console.log("Configured decoder --- Setup Handler");
	const handler = new SafeTransactionHandler(
		validatorAccount,
		config.SUPPORTED_CHAIN_ID,
		config.SUPPORTED_HARBOUR,
		config.SUPPORTED_ENTRYPOINT,
		config.SUPPORTED_PAYMASTER,
		config.HARBOUR_RPC,
		config.BUNDLER_RPC,
	);

	console.log("Handler setup --- Subscribe to topic");

	// Create the callback function
	const callback = (wakuMessage: IDecodedMessage) => {
		// Check if there is a payload on the message
		if (!wakuMessage.payload) return;
		// Render the messageObj as desired in your application
		try {
			const messageObj = validateSafeTransactionRequestSchema.parse(
				SafeTransactionPacket.decode(wakuMessage.payload),
			);
			handler.handle(messageObj).catch(console.error);
		} catch (e) {
			console.error(e);
		}
	};

	// Subscribe to content topics and process new messages
	await node.filter.subscribe([decoder], callback);
	console.log("Done --- Listening");
}

await initializeWorker();

export default {};
