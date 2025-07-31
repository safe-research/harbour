import { Hono } from "hono";
import { cors } from "hono/cors";
import { getAddress } from "viem";
import { handleError } from "./utils/errors";
import { bigIntJsonReplacer } from "./utils/replacer";
import { accountFromSeed } from "./utils/signer";
import { buildValidateUserOpSchema } from "./validator/schemas";
import { encodePaymasterData } from "./erc4337/paymaster";
import { getUserOpHash, signUserOp } from "./erc4337/userOp";

type Bindings = {
	VALIDATOR_SEED: string;
	SUPPORTED_HARBOUR: string;
	SUPPORTED_PAYMASTER: string;
	SUPPORTED_ENTRYPOINT: string;
	SUPPORTED_CHAIN_ID: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("/*", cors());

app.get("/", (c) => {
	return c.text("Hello Hono!");
});

app.post("/validate", async (c) => {
	try {
		const supportedHarbour = getAddress(c.env.SUPPORTED_HARBOUR);
		const supportedPaymaster = getAddress(c.env.SUPPORTED_PAYMASTER);
		const supportedEntrypoint = getAddress(c.env.SUPPORTED_ENTRYPOINT);
		const supportedChainId = BigInt(c.env.SUPPORTED_CHAIN_ID);
		const request = buildValidateUserOpSchema(
			supportedPaymaster,
			supportedHarbour,
		).parse(await c.req.json());
		if (request.paymaster !== supportedPaymaster)
			throw Error("Unsupported paymaster");
		// Set timeframe in which the validation is valid
		const now = Math.floor(Date.now() / 1000);
		const validAfter = now - 6 * 60;
		// 2 hours valid
		const validUntil = now + 2 * 3600;
		console.log({ validAfter, validUntil });
		request.paymasterData = encodePaymasterData({ validAfter, validUntil });
		// TODO: check gas limits

		const validatorAccount = accountFromSeed(c.env.VALIDATOR_SEED);
		console.log(validatorAccount.address);
		const userOpHash = await getUserOpHash(
			supportedChainId,
			supportedEntrypoint,
			request,
		);
		console.log({ supportedChainId, supportedEntrypoint, userOpHash });
		const signedUserOp = await signUserOp(
			validatorAccount,
			supportedChainId,
			supportedEntrypoint,
			request,
		);
		console.log(signedUserOp);

		// Manually stringify the JSON with the replacer and return a new Response
		const jsonString = JSON.stringify(signedUserOp, bigIntJsonReplacer);
		return new Response(jsonString, {
			status: 200,
			headers: {
				"Content-Type": "application/json",
			},
		});
	} catch (e) {
		const { response, code } = handleError(e);
		const jsonString = JSON.stringify(response, bigIntJsonReplacer);
		console.log(response.issues?.map((i) => i.path));

		return new Response(jsonString, {
			status: code,
			headers: {
				"Content-Type": "application/json",
			},
		});
	}
});

export default app;
