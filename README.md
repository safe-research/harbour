> [!WARNING]
> Code in this repository is not audited and may contain serious security holes. Use at your own risk.

# Harbour

<img src="assets/logo.png" width="200px" alt="Harbour Logo" />

## Project Structure

Harbour is a monorepo containing the following packages:

- **contracts**: Smart contracts for the Harbour protocol
- **webapp**: Web application
- **validagtor**: Validator service
- **docs**: Documentation

## Documentation

- [Architecture Documentation](./docs/architecture.md) - Overview of the project architecture
- [Deployment Documentation](./docs/deployments.md) - Information on latest deployments

## Getting Started

1. Clone the repository:

```bash
git clone https://github.com/safe-research/harbour.git
```

2. Navigate to the project directory:

```bash
cd harbour
```

3. Install dependencies:

```bash
npm install
```

4. Follow the setup instructions in the documentation:
   - For contracts: See [contracts/README.md](contracts/README.md)
   - For webapp: See [webapp/README.md](webapp/README.md)
   - For validator: See [validator/README.md](validator/README.md)

## Development

- `npm run format` - Format code using Biome
- `npm run lint` - Lint code using Biome
- `npm run lint:fix` - Fix linting issues
- `npm run check` - Run Biome checks
- `npm run test` - Run tests across all packages

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.
