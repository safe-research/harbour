# CLAUDE.md

> Engineering handbook for **Harbour** — maintainable, auditable, *on-chain-first*.

## About Harbour

Harbour is an on-chain coordination layer for Safe (multi-signature) wallets that replaces off-chain coordination tools with an always-available smart-contract system. No centralized servers, no single-point-of-failure — just deterministic code on EVM chains.

---

## Local Development

```bash
# 1. Start the web UI on http://localhost:3000
cd webapp && npm run dev

# 2. Run the full test-suite (contracts + webapp)
npm test
```

| Task                               | Command                                           |
| ---------------------------------- | ------------------------------------------------- |
| Webapp unit tests                  | `npm test -w webapp`                           |
| Contract unit tests                | `npm test -w contracts`                        |
| Run a specific contract test       | `cd contracts && npx hardhat test test/<file>.ts` |
| Lint & format (Biome)              | `npm run lint && npm run format`                  |
| Auto-fix lint issues               | `npm run lint:fix`                                |
| Build production webapp            | `npm run build -w webapp`                         |
| Compile contracts & generate types | `npm run build -w contracts`                      |

### Deployment

```bash
# Deploy contracts to a given network
cd contracts && npm run deploy <network>

# Example: Gnosis Chain
cd contracts && npm run deploy gnosis
```

---

## Architecture Overview

### Smart contracts

* **`SafeInternationalHarbour.sol`**

  * Stores proposals & signatures entirely on-chain.
  * Hooks into Safe’s module system (no custom wallet).
  * Eliminates off-chain dependencies — the chain *is* the source of truth.

> **Flow**
> 1 · Any signer proposes a transaction (stored on-chain)
> 2 · Co-signers append their signatures directly to the contract
> 3 · When the threshold is reached, *anyone* can call `execute()` through Safe

### Frontend

* **Framework**: React + Vite
* **Routing**: TanStack Router (file-system based)
* **Data fetching**: TanStack Query
* **Wallets**: Web3-Onboard + WalletConnect
* **EVM I/O**: ethers-js v6 with TypeChain types

Patterns:

* Contract calls live in typed hooks (`webapp/src/hooks/`).
* Presentational components in `webapp/src/components/` are stateless/style-only.
* Providers (e.g. `WalletConnectProvider.tsx`) own global concerns like wallet sessions.

---

## Development Workflow

1. **Change a contract**

   * Edit files in `contracts/src/`.
   * Run `npm run build` to compile *and* regenerate TypeChain types.
   * Types are shared into the webapp via the monorepo workspace.

2. **Change the webapp**

   * Vite HMR gives instant feedback.
   * TypeScript `strict` mode is on — fix type errors before committing.
   * Biome enforces tabs, double quotes, ≤ 120-char lines.

3. **Test continuously**

   * Smart contracts: Hardhat + ethers.js + Waffle matchers([hardhat.org][1])
   * Frontend: Vitest + React Testing Library.
   * E2E: run the built webapp against a local Hardhat node.

---

## Environment Variables

### Webapp (`webapp/.env`)

* `VITE_BASE_PATH` – optional base path when served behind a reverse proxy.
* `VITE_WALLETCONNECT_PROJECT_ID` – required for WalletConnect sessions([onboard.blocknative.com][2])

### Contracts (`contracts/.env`)

* `RPC_URL` – JSON-RPC endpoint.
* `PRIVATE_KEY` **or** `MNEMONIC` – deployer credentials.
* `ETHERSCAN_API_KEY` – contract verification.

---

## Coding Standards

### Solidity

* Use fixed `pragma` ranges; avoid floating pragmas.
* Guard external calls with fail-early `require` statements

### TypeScript

* Declare explicit return types — never rely on inference for public APIs.
* Prefer `type` aliases over `interface`.
* Use the `satisfies` operator to keep object literals type-safe.
* Never use boxed primitives (`Number`, `String`, …) — use lowercase keywords instead.
* Export types separately from implementation code.

### React

* Functional components only; one default export per `PascalCase.tsx` file.
* Extract when files > 300 LOC or render > 40 lines.
* Keep state local; lift only when truly shared.
* Derive data instead of duplicating state; consider `useReducer` / state machines for complexity.
* Use `useEffect` strictly for side-effects; compute in render when possible.
* Compose with props/slots/hooks; prefer slot APIs over boolean prop branches.
* Keys in lists must be stable IDs (never array indices).
* Class names: Tailwind utilities or BEM; build conditional classes with `clsx`.
* Prefer skeleton loaders + Suspense over spinners for async UIs.

---

## Workflow Rules

1. **Lead with outcomes** – restate the goal before coding.
2. **Plan → Implement → Verify** – think first, then code, then run checks.
3. **Work incrementally** – one coherent sub-task per commit.
4. **Track work** – maintain a TODO list in-repo; close items with PRs.
5. **Run the suite** – `npm test && npm run lint` must pass before pushing.
6. **Extend tests** – cover new logic and edge cases.
7. **Comment *why*** – describe intent, not mechanics; doc-blocks for public APIs.
8. **Surface risks early** – nulls, races, gas spikes, etc.
9. **Ask questions** – clarify requirements instead of guessing.
10. **Document hacks** – annotate workarounds/tech-debt with `// FIXME:`.

---

## Common Tasks

### Add a contract function

1. Implement in `SafeInternationalHarbour.sol`.
2. `cd contracts && npm run build` to compile and regenerate types.
3. Call the new function through the `useHarbour` hook.

### Add a route

1. Create `webapp/src/routes/<route>.tsx`.
2. Export a default component; TanStack Router auto-registers it.

### Debug contract issues

1. Check browser dev-tools for RPC errors.
2. Use `cast` or `npx hardhat console` for direct calls.
3. Inspect state on a block explorer to rule out chain-side faults([cyfrin.io][5]).

---

## Export Style

Place all `export { … }` statements at the bottom of the file — scroll once, know the public surface.
