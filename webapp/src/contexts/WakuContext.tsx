import { createLightNode, type LightNode } from "@waku/sdk";
import type { IEncoder } from "@waku/interfaces";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import type { FullSafeTransaction } from "@/lib/types";
import {
	SafeHarbourTopicTransactionsV1,
	SafeTransactionPacket,
} from "@/lib/waku";

const STORAGE_KEY_ENABLED = "waku_manager.enabled.boolean";
const STORAGE_VALUE_ENABLED = "enabled";

export enum WakuState {
	DISABLED = 0,
	STARTING = 1,
	CONNECTING = 2,
	CONNECTED = 3,
}

export class WakuManager {
	private watchers = new Set<(state: WakuState) => void>();

	private enabled: boolean;
	private encoder?: IEncoder;
	private node?: LightNode;

	constructor() {
		this.enabled =
			localStorage.getItem(STORAGE_KEY_ENABLED) === STORAGE_VALUE_ENABLED;
	}

	enable() {
		localStorage.setItem(STORAGE_KEY_ENABLED, STORAGE_VALUE_ENABLED);
		this.enabled = true;
		this.notifyWatchers();
	}

	disable() {
		localStorage.removeItem(STORAGE_KEY_ENABLED);
		this.enabled = false;
		this.notifyWatchers();
	}

	isAvailable(): boolean {
		return (
			this.enabled &&
			this.node !== undefined &&
			this.node.isConnected() &&
			this.node.isStarted()
		);
	}

	async setup() {
		if (!this.enabled || this.isAvailable()) return;
		const node = await createLightNode({ defaultBootstrap: true });
		this.node = node;
		if (!node) return;
		this.encoder = node.createEncoder({
			contentTopic: SafeHarbourTopicTransactionsV1,
			ephemeral: true,
		});
		await node.start();
		console.log("Started --- Waiting for peers");
		this.notifyWatchers();
		await node.waitForPeers();
		console.log("Found Peer --- Configure encoder");
		this.notifyWatchers();
	}

	async stop() {
		const node = this.node;
		if (node?.isStarted()) {
			await node.stop();
		}
	}

	currentState(): WakuState {
		const node = this.node;
		if (node === undefined || !this.enabled) return WakuState.DISABLED;
		if (!node.isStarted()) return WakuState.STARTING;
		if (!node.isConnected()) return WakuState.CONNECTING;
		return WakuState.CONNECTED;
	}

	watchStatus(callback: (state: WakuState) => void) {
		this.watchers.add(callback);
		callback(this.currentState());
	}

	unwatchStatus(callback: (state: WakuState) => void) {
		this.watchers.delete(callback);
	}

	private notifyWatchers() {
		for (const watcher of this.watchers.values()) {
			try {
				watcher(this.currentState());
			} catch (e) {
				console.error(e);
			}
		}
	}

	async send(
		transaction: FullSafeTransaction,
		signature: string,
	): Promise<boolean> {
		if (
			this.node === undefined ||
			this.encoder === undefined ||
			!this.isAvailable()
		)
			throw Error("Waku is not available");
		console.log({ transaction, signature });
		// Create a new message object
		const protoMessage = SafeTransactionPacket.create({
			...transaction,
			safe: transaction.safeAddress,
			chainId: transaction.chainId.toString(),
			signature,
		});
		console.log({ protoMessage });

		// Serialise the message using Protobuf
		const serialisedMessage =
			SafeTransactionPacket.encode(protoMessage).finish();

		console.log("Send Message");
		// Send the message using Light Push
		const response = await this.node.lightPush.send(this.encoder, {
			payload: serialisedMessage,
		});
		console.log(
			`Done: ${response.successes.length > 0 ? "Transmitted to response.successes.length peers" : "Could not send message"}`,
		);
		return response.successes.length > 0;
	}
}

const WakuContext = createContext<WakuManager | undefined>(undefined);

function WakuProvider({ children }: { children: ReactNode }) {
	// TODO: set a state, so that during the connection phase this will not error
	const [context, setContext] = useState<WakuManager | undefined>();

	useEffect(() => {
		const manager = new WakuManager();
		manager.setup();
		setContext(manager);
	}, []);

	return (
		<WakuContext.Provider value={context}>{children}</WakuContext.Provider>
	);
}

function useWaku(): WakuManager {
	const context = useContext(WakuContext);
	if (!context) {
		throw new Error("useWaku must be used within a WakuProvider");
	}
	return context;
}

export { WakuProvider, useWaku };
