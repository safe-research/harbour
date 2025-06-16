# Harbour Safe Dashboard

Harbour Safe Dashboard is a web application for managing [Safe](https://safe.global/) multisig wallets. It allows users to:

- View Safe configuration and owners
- Enqueue new transactions for a Safe
- View and sign pending transactions
- Execute transactions once enough signatures are collected
- All actions are performed client-side, with no external backend dependencies

Pending transactions and signatures are stored on-chain in the Harbour ([SafeInternationalHarbour](../contracts/src/SafeInternationalHarbour.sol)) smart contract deployed to Gnosis Chain. As long as the chain is running and an RPC endpoint is available, transactions can be enqueued and executed—no additional backend or off-chain indexer is required.

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Run the app in development mode

```bash
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

### 3. Build for production

```bash
npm run build
```

### 4. Preview the production build

```bash
npm run serve
```

## Running Tests

This project uses [Vitest](https://vitest.dev/) for unit testing:

```bash
npm run test
```

## Linting & Formatting

This project uses [Biome](https://biomejs.dev/) for linting and formatting:

```bash
npm run lint      # Lint the code
npm run format    # Format the code
npm run check     # Type and lint check
```

## Dependencies

Key dependencies used in this project:

- [React](https://react.dev/) (v19)
- [TanStack Router](https://tanstack.com/router) for routing
- [TanStack Query](https://tanstack.com/query) for data fetching and caching
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [ethers.js](https://docs.ethers.org/) for Ethereum interactions
- [@web3-onboard](https://onboard.blocknative.com/) for wallet connection
- [zod](https://zod.dev/) for schema validation
- [Biome](https://biomejs.dev/) for linting/formatting
- [Vitest](https://vitest.dev/) for testing

See `package.json` for the full list of dependencies and versions.

## Usage

1. Connect your Ethereum wallet (e.g., MetaMask) when prompted.
2. Enter your Safe address and select the chain.
3. View Safe configuration, pending transactions, and create or sign/execute transactions as needed.

---

For more details, see the code in the `src/` directory. Contributions and issues are welcome!

## Smart Contract

This app interacts with the [`SafeInternationalHarbour.sol`](../contracts/src/SafeInternationalHarbour.sol) contract, found in the [`@contracts`](../contracts) package of this monorepo.

**Deployed contract address:** [`0x5E669c1f2F9629B22dd05FBff63313a49f87D4e6`](https://gnosisscan.io/address/0x5E669c1f2F9629B22dd05FBff63313a49f87D4e6) on [Gnosis Chain](https://gnosisscan.io/).

**Note:** This application also depends on the [multicall3](https://github.com/mds1/multicall) contract to be available on the chains being used.

## Environment Variables

- The app consumes environment variables via Vite (`import.meta.env`).
- Copy `webapp/env.example` to `.env` (or `.env.local`) and adjust the values.
- The following variables are recognised:

```bash
# Where the app will be served (prefixing route paths). Useful for GitHub Pages
VITE_BASE_PATH=/harbour/

# WalletConnect Cloud project ID (get one at https://cloud.walletconnect.com)
VITE_WALLETCONNECT_PROJECT_ID=<your WC Cloud project-id>
```

> **Tip**: For development you can leave `VITE_BASE_PATH` at `/`.
