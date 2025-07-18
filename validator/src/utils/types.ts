import z from "zod";
import { userOpSchema } from "./schemas";
import { Address, Hex } from "viem";

export type UserOp = z.infer<typeof userOpSchema>;

export type PackedUserOp = {
  sender: Address;
  nonce: bigint;
  initCode: Hex;
  callData: Hex;
  accountGasLimits: Hex;
  preVerificationGas: bigint;
  gasFees: Hex;
  paymasterAndData: Hex;
  signature: Hex;
}