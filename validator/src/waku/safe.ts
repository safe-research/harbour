import protobuf from "protobufjs";

export const SafeHarbourTopicTransactionsV1 = "/safe/harbour/v1/txs";
export const SafeTransactionPacket = new protobuf.Type("SafeTransaction")
	.add(new protobuf.Field("chainId", 0, "string"))
	.add(new protobuf.Field("safe", 1, "string"))
	.add(new protobuf.Field("to", 2, "string"))
	.add(new protobuf.Field("value", 3, "string"))
	.add(new protobuf.Field("data", 4, "string"))
	.add(new protobuf.Field("operation", 5, "uint32"))
	.add(new protobuf.Field("safeTxGas", 6, "string"))
	.add(new protobuf.Field("baseGas", 7, "string"))
	.add(new protobuf.Field("gasPrice", 8, "string"))
	.add(new protobuf.Field("gasToken", 9, "string"))
	.add(new protobuf.Field("refundReceiver", 10, "string"))
	.add(new protobuf.Field("nonce", 12, "string"))
	.add(new protobuf.Field("signature", 13, "string"));
