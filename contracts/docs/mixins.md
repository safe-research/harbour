# Mixins

To separate the different logic parts [mixins](../contracts/src/mixins/) are utilized. Each Mixin requires different interfaces and implements the logic in a self contained way.

Currently there are three different mixins:
- ERC4337Mixin - Mixin that implement required account methods for ERC-4337
- QuotaMixin - Mixin that implements quota management
- SlashingMixin - Mixin that implements slashing logic