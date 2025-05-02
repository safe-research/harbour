# Contracts

This package contains the smart contracts used by the Harbour project, including:

## Harbour Contracts

Custom contracts developed for the Harbour project, located under `src`:

- **SafeInternationalHarbour.sol** – A singleton contract to enqueue transactions on any chain. [Learn more](docs/international-harbour.md)
- **SafeModuleHarbour.sol** – A module contract that implements the queued transaction module. [Learn more](docs/module-queue.md)

## Getting Started

Install dependencies and compile the contracts:

```bash
npm install
npm run compile
```

Run tests:

```bash
npm run test
```

## Documentation

For detailed information on each module, see the documentation in the `docs/` folder:

- [Module Queue Documentation](docs/module-queue.md)
- [International Harbour Documentation](docs/international-harbour.md)

## Deployment

To deploy the SafeInternationalHarbour contract deterministically using CREATE2 and the Safe Singleton Factory:

1. Copy `.env.example` to `.env` and fill in your values:

   ```bash
   cp .env.example .env
   # Edit .env and set RPC_URL, PRIVATE_KEY or MNEMONIC, and ETHERSCAN_API_KEY
   ```

2. Compile contracts:

   ```bash
   npm run build
   ```

3. Deploy to your network:

   ```bash
   npm run deploy:intl -- --network <network>
   # or for all deploy scripts
   npm run deploy -- --network <network>
   ```

4. (Optional) Verify on Etherscan:
   ```bash
   npx hardhat etherscan-verify --network <network>
   ```

The deployment will use the Safe Singleton Factory for deterministic CREATE2 deployment. If your network is not supported, see https://github.com/safe-global/safe-singleton-factory for instructions to request a new deployment.
