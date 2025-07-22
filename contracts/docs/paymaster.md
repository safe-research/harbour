# Notes on 4337 Paymaster usage with Harbour

`for now accept that there is always the chance that the user quota is used first`

The challenge is that to optimize the UX the user should only sign a Safe transaction when submitting data to harbour. As the Safe transaction does not contain information about the user operation (including the paymaster) verification of related parameters has to be done via other means.

Currently the `signature` field of the user operation is used for a validator (that is registered with the paymaster) to sign over all of the user operation fields (including the paymaster data).

There are two straight forward solutions to have the user confirm/ approve some of the paymaster config:
- Utilize one of the less frequently used field and encode the data there (i.e. refund receiver). This approach has been taken in the past for onchain tracking
- Have the user set onchain some preferences (i.e. the user signs one time a "delegation" to a paymaster that is stored in harbour)