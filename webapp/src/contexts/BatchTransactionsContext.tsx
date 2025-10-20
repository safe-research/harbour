import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { z } from "zod";
import type { MetaTransaction } from "@/lib/types";
import {
	chainIdSchema,
	ethereumAddressSchema,
	hexDataSchema,
	numericStringSchema,
	safeAddressSchema,
} from "../lib/validators";

interface BatchedTransaction extends MetaTransaction {
	safeAddress: string;
	chainId: bigint;
}

interface BatchContextValue {
	batches: Record<string, BatchedTransaction[]>;
	addTransaction: (tx: BatchedTransaction) => void;
	removeTransaction: (
		safeAddress: string,
		chainId: bigint,
		index: number,
	) => void;
	clearBatch: (safeAddress: string, chainId: bigint) => void;
	getBatch: (safeAddress: string, chainId: bigint) => BatchedTransaction[];
	setBatch: (
		safeAddress: string,
		chainId: bigint,
		txs: MetaTransaction[],
	) => void;
	totalCount: number;
}

const STORAGE_KEY = "harbour_batch_transactions";
const BatchContext = createContext<BatchContextValue | undefined>(undefined);

// ---------------- Zod Schemas ----------------
// Schema for a single BatchedTransaction object
const batchedTransactionSchema = z.object({
	to: ethereumAddressSchema,
	value: numericStringSchema,
	data: hexDataSchema,
	safeAddress: safeAddressSchema,
	chainId: chainIdSchema,
});

// Schema for the entire persisted batches record
const batchesSchema = z.record(z.array(batchedTransactionSchema));

function BatchProvider({ children }: { children: ReactNode }) {
	const [batches, setBatches] = useState<Record<string, BatchedTransaction[]>>(
		() => {
			if (typeof window === "undefined") return {};
			try {
				const stored = localStorage.getItem(STORAGE_KEY);
				if (!stored) return {};
				const parsed = JSON.parse(stored);
				const validation = batchesSchema.safeParse(parsed);
				return validation.success
					? (validation.data as Record<string, BatchedTransaction[]>)
					: {};
			} catch {
				// In case of malformed JSON or other errors, fall back to empty state
				return {};
			}
		},
	);

	useEffect(() => {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(batches));
		} catch {
			// ignore localStorage errors
		}
	}, [batches]);

	const getKey = (safeAddress: string, chainId: bigint) =>
		`${safeAddress}-${chainId}`;

	const addTransaction = (tx: BatchedTransaction) => {
		const key = getKey(tx.safeAddress, tx.chainId);
		setBatches((prev) => {
			const existing = prev[key] ?? [];
			return { ...prev, [key]: [...existing, tx] };
		});
	};

	const removeTransaction = (
		safeAddress: string,
		chainId: bigint,
		index: number,
	) => {
		const key = getKey(safeAddress, chainId);
		setBatches((prev) => {
			const existing = prev[key] ?? [];
			const updated = existing.filter((_, i) => i !== index);
			const newBatches = { ...prev, [key]: updated };
			if (updated.length === 0) {
				delete newBatches[key];
			}
			return newBatches;
		});
	};

	const clearBatch = (safeAddress: string, chainId: bigint) => {
		const key = getKey(safeAddress, chainId);
		setBatches((prev) => {
			const newBatches = { ...prev };
			delete newBatches[key];
			return newBatches;
		});
	};

	const getBatch = (
		safeAddress: string,
		chainId: bigint,
	): BatchedTransaction[] => {
		const key = getKey(safeAddress, chainId);
		return batches[key] ?? [];
	};

	const setBatch = (
		safeAddress: string,
		chainId: bigint,
		txs: MetaTransaction[],
	) => {
		const key = getKey(safeAddress, chainId);
		setBatches((prev) => {
			return {
				...prev,
				[key]: txs.map((tx) => ({ ...tx, safeAddress, chainId })),
			};
		});
	};

	const totalCount = Object.values(batches).reduce(
		(sum, arr) => sum + arr.length,
		0,
	);

	return (
		<BatchContext.Provider
			value={{
				batches,
				addTransaction,
				removeTransaction,
				clearBatch,
				getBatch,
				setBatch,
				totalCount,
			}}
		>
			{children}
		</BatchContext.Provider>
	);
}

function useBatch(): BatchContextValue {
	const context = useContext(BatchContext);
	if (!context) {
		throw new Error("useBatch must be used within a BatchProvider");
	}
	return context;
}

export { BatchProvider, useBatch };
export type { BatchedTransaction };
