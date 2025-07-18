import { getAddress, recoverAddress, Signature, Signer } from "ethers";
import { ActionType, EthereumProvider, TaskArguments } from "hardhat/types";
import { buildSafeTx, buildSignedUserOp, encodePaymasterData, getUserOpHash, serialize } from "../../test/utils/erc4337";
import { EntryPoint__factory, SafeHarbourPaymaster__factory, SafeInternationalHarbour__factory } from "../../typechain-types";
import { getUserOpGasLimits, getUserOpGasPrice, sendUserOp, setGasParams } from "./utils/bundlers";

export const relayWithValidator: ActionType<TaskArguments> = async (taskArgs, hre) => {
    const [hardhatSigner] = await hre.ethers.getSigners();
    const signer = hardhatSigner as unknown as Signer;
    console.log(`Use ${hardhatSigner.address} for signing`);
    const harbourAddress = taskArgs.harbour
        ? getAddress(taskArgs.harbour)
        : (await hre.deployments.get("SafeInternationalHarbour")).address;
    console.log(`Use Harbour at ${harbourAddress}`);
    const safeAddress = getAddress(taskArgs.safe);
    const harbourChainId = (await hre.ethers.provider.getNetwork()).chainId;
    const safeTxChainId = taskArgs.chainId ?? harbourChainId;
    const safeTx = buildSafeTx(taskArgs.tx);
    console.log({ safeTx });
    const harbour = SafeInternationalHarbour__factory.connect(harbourAddress, signer);
    const supportedEntryPoint = await harbour.SUPPORTED_ENTRYPOINT();
    const paymasterAddress = await harbour.TRUSTED_PAYMASTER();
    const paymaster = SafeHarbourPaymaster__factory.connect(paymasterAddress, signer);
    console.log(`Use Paymaster at ${paymasterAddress}`);
    const paymasterAndData = await encodePaymasterData({ paymaster });
    const { userOp, signature } = await buildSignedUserOp(
        harbour,
        signer,
        safeTxChainId,
        safeAddress,
        safeTx,
        paymasterAndData,
    );
    userOp.signature = signature
    const gasFee = await getUserOpGasPrice(hre.ethers.provider as unknown as EthereumProvider);
    console.log({gasFee})
    const limits = await getUserOpGasLimits(supportedEntryPoint, userOp, gasFee);
    userOp.signature = "0x";
    setGasParams(userOp, gasFee, limits);
    // Update paymaster data with correct gas limit
    userOp.paymasterAndData = await encodePaymasterData({ 
        paymaster, 
        paymasterVerificationGas: BigInt(limits.paymasterVerificationGasLimit), 
    });
    const response = await fetch("http://localhost:8787/validate", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(await serialize(userOp)),
    })
    console.log(response.status)
    const validatedUserOp = await response.json()
    console.log({validatedUserOp})
    const uoHash = await getUserOpHash(harbourChainId, EntryPoint__factory.connect(supportedEntryPoint), validatedUserOp)
    console.log({supportedEntryPoint, harbourChainId, uoHash})
    const validatorSignature = Signature.from(validatedUserOp.signature)
    console.log(validatorSignature)
    console.log(recoverAddress(uoHash, validatorSignature))
    const userOpHash = await sendUserOp(supportedEntryPoint, validatedUserOp);
    console.log({ userOpHash });
};