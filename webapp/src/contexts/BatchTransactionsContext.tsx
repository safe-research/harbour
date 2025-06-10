import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export interface BatchedTransaction {
	to: string;
	value: string;
	data: string;
	safeAddress: string;
	chainId: number;
}

interface BatchContextValue {
	batches: Record<string, BatchedTransaction[]>;
	addTransaction: (tx: BatchedTransaction) => void;
	removeTransaction: (safeAddress: string, chainId: number, index: number) => void;
	clearBatch: (safeAddress: string, chainId: number) => void;
	getBatch: (safeAddress: string, chainId: number) => BatchedTransaction[];
	totalCount: number;
}

const STORAGE_KEY = "harbour_batch_transactions";
const BatchContext = createContext<BatchContextValue | undefined>(undefined);

export const BatchProvider = ({ children }: { children: ReactNode }) => {
	const [batches, setBatches] = useState<Record<string, BatchedTransaction[]>>(() => {
		if (typeof window === "undefined") return {};
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			return stored ? JSON.parse(stored) : {};
		} catch {
			return {};
		}
	});

	useEffect(() => {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(batches));
		} catch {
			// ignore localStorage errors
		}
	}, [batches]);

	const getKey = (safeAddress: string, chainId: number) => `${safeAddress}-${chainId}`;

	const addTransaction = (tx: BatchedTransaction) => {
		const key = getKey(tx.safeAddress, tx.chainId);
		setBatches((prev) => {
			const existing = prev[key] ?? [];
			return { ...prev, [key]: [...existing, tx] };
		});
	};

	const removeTransaction = (safeAddress: string, chainId: number, index: number) => {
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

	const clearBatch = (safeAddress: string, chainId: number) => {
		const key = getKey(safeAddress, chainId);
		setBatches((prev) => {
			const newBatches = { ...prev };
			delete newBatches[key];
			return newBatches;
		});
	};

	const getBatch = (safeAddress: string, chainId: number): BatchedTransaction[] => {
		const key = getKey(safeAddress, chainId);
		return batches[key] ?? [];
	};

	const totalCount = Object.values(batches).reduce((sum, arr) => sum + arr.length, 0);

	return (
		<BatchContext.Provider value={{ batches, addTransaction, removeTransaction, clearBatch, getBatch, totalCount }}>
			{children}
		</BatchContext.Provider>
	);
};

export const useBatch = (): BatchContextValue => {
	const context = useContext(BatchContext);
	if (!context) {
		throw new Error("useBatch must be used within a BatchProvider");
	}
	return context;
};
