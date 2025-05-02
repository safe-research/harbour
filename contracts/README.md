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
