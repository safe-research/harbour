import { ethers } from "ethers";
import { z } from "zod";
import type { MetaTransaction } from "@/lib/types";
import {
	ethereumAddressSchema,
	hexDataSchema,
	numericStringSchema,
} from "@/lib/validators";

const baseContractMethodParameterSchema = z.object({
	name: z.string(),
	type: z.string(),
	internalType: z.string().optional(),
});

type ContractMethodParameter = z.infer<
	typeof baseContractMethodParameterSchema
> & {
	components?: ContractMethodParameter[];
};

const contractMethodParameterSchema: z.ZodType<ContractMethodParameter> =
	baseContractMethodParameterSchema.extend({
		components: z.lazy(() => contractMethodParameterSchema.array().optional()),
	});

const rawTransactionSchema = z.object({
	to: ethereumAddressSchema,
	value: numericStringSchema,
	data: hexDataSchema,
	contractMethod: z.null().optional(),
	contractInputsValues: z.null().optional(),
});

const abiTransactionSchema = z.object({
	to: ethereumAddressSchema,
	value: numericStringSchema,
	data: hexDataSchema.nullable().optional(),
	contractMethod: z.object({
		inputs: z.array(contractMethodParameterSchema),
		name: z.string(),
		outputs: z.array(contractMethodParameterSchema),
		payable: z.boolean().optional(),
		stateMutability: z.string(),
		type: z.literal("function"),
	}),
	contractInputsValues: z.record(z.unknown()),
});

const transactionSchema = z.union([rawTransactionSchema, abiTransactionSchema]);

const bundleSchema = z.object({
	version: z.literal("1.0"),
	chainId: numericStringSchema,
	createdAt: z.number().int().nonnegative(),
	meta: z.unknown(),
	transactions: z.array(transactionSchema),
});

async function readFile(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.addEventListener("load", () => {
			resolve(reader.result as string);
		});
		reader.addEventListener("error", () => {
			reject(new Error("failed to read JSON file"));
		});
		reader.readAsText(file);
	});
}

type RawTransaction = z.infer<typeof rawTransactionSchema>;
type Transaction = z.infer<typeof transactionSchema>;

function isRawTransaction(tx: Transaction): tx is RawTransaction {
	return !tx.contractMethod;
}

function toMetaTransaction(tx: z.infer<typeof transactionSchema>) {
	const { to, value } = tx;
	if (isRawTransaction(tx)) {
		return { to, value, data: tx.data };
	}
	const iface = new ethers.Interface([tx.contractMethod]);
	const params = tx.contractMethod.inputs.map(
		(input) => tx.contractInputsValues[input.name],
	);
	const data = iface.encodeFunctionData(tx.contractMethod.name, params);
	return { to, value, data };
}

async function loadTxBundleFromFile(file: File): Promise<MetaTransaction[]> {
	try {
		const raw = await readFile(file);
		const json = JSON.parse(raw);
		const bundle = bundleSchema.parse(json);
		return bundle.transactions.map(toMetaTransaction);
	} catch (err) {
		if (err instanceof z.ZodError) {
			throw new Error(
				`Invalid transaction bundle format: ${err.errors[0].message}`,
			);
		}
		throw err;
	}
}

export { loadTxBundleFromFile };
