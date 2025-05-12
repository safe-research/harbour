import {
  getMultiSendCallOnlyDeployment,
  getProxyFactoryDeployment,
  getSafeSingletonDeployment,
} from "@safe-global/safe-deployments";
import { getSafeModuleSetupDeployment } from "@safe-global/safe-modules-deployments";
import { hexlify, randomBytes } from "ethers";
import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

/**
 * Configuration
 */
const SAFE_DEPLOYMENTS_PER_TRANSACTION = 10;
const EXTRA_RANDOM_OWNERS = 20;
const THRESHOLD = 1;

/**
 * Types
 */
interface MultisendCall {
  to: string;
  value: bigint;
  data: string;
  operation?: 0 | 1;
}

/**
 * Helpers
 */
const SAFE_ADDRESSES_FILE = path.join(__dirname, "safeAddresses.json");

function encodeMetaTransaction({
  to,
  value,
  data,
  operation = 0,
}: MultisendCall): string {
  const bytes = ethers.getBytes(data);
  const encoded = ethers.solidityPacked(
    ["uint8", "address", "uint256", "uint256", "bytes"],
    [operation, to, value, bytes.length, bytes],
  );
  return encoded.slice(2);
}

function encodeMultiSend(calls: MultisendCall[]): string {
  return `0x${calls.map(encodeMetaTransaction).join("")}`;
}

function saveSafeAddresses(addresses: readonly string[]): void {
  fs.writeFileSync(SAFE_ADDRESSES_FILE, JSON.stringify(addresses, null, 2));
}

/**
 * Entrypoint
 */
async function main(): Promise<void> {
  const chainId = (await ethers.provider.getNetwork()).chainId.toString();

  // Fetch Safe deployments already present on the network
  const safeSingleton = getSafeSingletonDeployment({
    network: chainId,
  })?.defaultAddress;
  const proxyFactory = getProxyFactoryDeployment({
    network: chainId,
  })?.defaultAddress;
  const multiSend = getMultiSendCallOnlyDeployment({ network: chainId });
  const modulesDep = getSafeModuleSetupDeployment({ network: chainId });

  if (!safeSingleton || !proxyFactory || !multiSend || !modulesDep) {
    throw new Error(`Required Safe deployments not found for chain ${chainId}`);
  }

  const modulesSetup = modulesDep.networkAddresses[chainId];
  const [deployer] = await ethers.getSigners();

  // Build the owner set (caller + random addresses)
  const owners = [
    deployer.address,
    ...Array.from({ length: EXTRA_RANDOM_OWNERS }, () =>
      hexlify(randomBytes(20)),
    ),
  ];

  // Deploy debug transaction guard
  const guardFactory = await ethers.getContractFactory("DebugTransactionGuard");
  const guardAddress = await (await guardFactory.deploy()).getAddress();

  /**
   * Attach on‑chain deployments
   */
  const proxyFactoryContract = await ethers.getContractAt(
    "SafeProxyFactory",
    proxyFactory,
    deployer,
  );
  const safeFactory = await ethers.getContractFactory("Safe");
  const multisendContract = new ethers.Contract(
    multiSend.defaultAddress,
    multiSend.abi,
    deployer,
  );
  const modulesSetupContract = new ethers.Contract(
    modulesSetup,
    modulesDep.abi,
    deployer,
  );

  /**
   * ──────────────────────────────────────────────────────────────────────────
   * 1. Create Safe proxies via MultiSend
   * ──────────────────────────────────────────────────────────────────────────
   */
  const proxyCreations: MultisendCall[] = [];

  for (let i = 0; i < SAFE_DEPLOYMENTS_PER_TRANSACTION; i++) {
    // Encode inline call to SafeModulesSetup.enableModules(modules)
    const modules = Array.from({ length: 15 }, () => hexlify(randomBytes(20)));
    const fallbackHandler = hexlify(randomBytes(20));

    const modulesCalldata = modulesSetupContract.interface.encodeFunctionData(
      "enableModules",
      [modules],
    );

    const initializer = safeFactory.interface.encodeFunctionData("setup", [
      owners,
      THRESHOLD,
      modulesSetup,
      modulesCalldata,
      fallbackHandler,
      ethers.ZeroAddress,
      0,
      ethers.ZeroAddress,
    ]);

    const createProxyCalldata =
      proxyFactoryContract.interface.encodeFunctionData(
        "createProxyWithNonce",
        [safeSingleton, initializer, 0],
      );

    proxyCreations.push({
      to: proxyFactory,
      value: 0n,
      data: createProxyCalldata,
    });
  }

  const creationReceipt = await multisendContract
    .multiSend(encodeMultiSend(proxyCreations))
    .then((tx) => tx.wait());
  if (!creationReceipt)
    throw new Error("MultiSend transaction failed while creating proxies");

  // Retrieve addresses of newly created proxies
  const creationEvents = await proxyFactoryContract.queryFilter(
    proxyFactoryContract.filters.ProxyCreation(),
    creationReceipt.blockNumber,
  );
  const proxies = creationEvents.map((event) => event.args.proxy);

  /**
   * ──────────────────────────────────────────────────────────────────────────
   * 2. Assign DebugTransactionGuard to each Safe
   * ──────────────────────────────────────────────────────────────────────────
   */
  const guardTransactions: MultisendCall[] = [];
  const setGuardData = safeFactory.interface.encodeFunctionData("setGuard", [
    guardAddress,
  ]);

  for (const proxy of proxies) {
    const safeProxy = await ethers.getContractAt("Safe", proxy, deployer);

    const txHash = await safeProxy.getTransactionHash(
      proxy,
      0,
      setGuardData,
      0,
      0,
      0,
      0,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
    );

    const signature = (await deployer.signMessage(ethers.getBytes(txHash)))
      .replace(/1b$/, "1f")
      .replace(/1c$/, "20");

    guardTransactions.push({
      to: proxy,
      value: 0n,
      data: safeProxy.interface.encodeFunctionData("execTransaction", [
        proxy,
        0,
        setGuardData,
        0,
        0,
        0,
        0,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        signature,
      ]),
    });
  }

  await multisendContract
    .multiSend(encodeMultiSend(guardTransactions))
    .then((tx) => tx.wait());

  /**
   * Persist results
   */
  saveSafeAddresses(proxies);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
