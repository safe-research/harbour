# Contracts

This package contains the smart contracts used by the Harbour project, including:

## Harbour Contracts

Custom contracts developed for the Harbour project, located under `src`:

- **SafeInternationalHarbour.sol** – A singleton contract to enqueue transactions on any chain. [Learn more](docs/international-harbour.md)

## Official Deployments

- **Gnosis Chain**: [SafeInternationalHarbour Contract on Gnosis Chain](https://gnosisscan.io/address/0x846EDD8718b79E9E91B0DD71924392239156ADBa) (`0x846EDD8718b79E9E91B0DD71924392239156ADBa`)

> ⚠️ **Disclaimer:** These contracts have not been audited. Use at your own risk.

## Getting Started

Install dependencies and compile the contracts:

```bash
npm install
npm run build
```

Run tests:

```bash
npm run test
```

## Documentation

For detailed information on each module, see the documentation in the `docs/` folder:

- [International Harbour Documentation](docs/international-harbour.md)

## Deployment

To deploy the `SafeInternationalHarbour` contract deterministically using CREATE2 and the Safe Singleton Factory:

1. Copy `.env.example` to `.env` and fill in your values:

   ```bash
   cp .env.example .env
   ```

Edit .env and set RPC_URL, PRIVATE_KEY or MNEMONIC, and ETHERSCAN_API_KEY. You can omit the `RPC_URL` and add the network to the hardhat config file. Later, the network can be referenced by name in the deployment command.

2. Compile contracts:

   ```bash
   npm run build
   ```

3. Deploy and verify contracts on your network:
   - To deploy all Harbour contracts (including Etherscan verification and sourcify):
     ```bash
     npm run deploy <network>
     ```
   - To deploy only the SafeInternationalHarbour contract:
     ```bash
     npm run deploy <network> --tags SafeInternationalHarbour
     ```

The deployment will use the Safe Singleton Factory for deterministic CREATE2 deployment. If your network is not supported, see https://github.com/safe-global/safe-singleton-factory for instructions to request a new deployment.
