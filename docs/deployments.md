# Deployments

Deployment information are stored in the [deployments folder](../contracts/deployments/).

## SafeInternationalHarbour

- Gnosis Chain
  - Address: `0x7E299130D19bd0F3D86718d389a4DEF957034189`
  - Configuration:
    - EntryPoint: `0x4337084d9e255ff0702461cf8895ce9e3b5ff108`

- Sepolia
  - Address: `0x7E299130D19bd0F3D86718d389a4DEF957034189`
  - Configuration:
    - EntryPoint: `0x4337084d9e255ff0702461cf8895ce9e3b5ff108`


## SafeHarbourPaymaster

- Gnosis Chain
  - Address: `0xA878AF6499fD3B6dAf4aAc1f768DE04aB7812AF2`
  - Configuration:
    - (Initial) Manager: `0xF4f42442E2AE1d7Ea87087aF73B2Abb5536290C2`
    - EntryPoint: `0x4337084d9e255ff0702461cf8895ce9e3b5ff108`
    - Fee token: `0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d` (WXDAI)
    - Quota per token: 1
    - Quota per token scale: 0 (no scale)
    - Timeframe for quota reset: 24 hours
    - Maximal available quota: 0 (unlimited)
    - Required token multiplier: 1 (no multiplier)
    - Enable Conditions Delay: 48 hours
    - Initial Conditions: `0x682953FC8EE8D5feF838a680824163eE6561b7E7` (SupportedHarbourCondition)

- Sepolia
  - Address: `0xf5d37D2CC6Ddbe1B06a4340383C1f05089CA39C7`
  - Configuration:
    - (Initial) Manager: `0xF4f42442E2AE1d7Ea87087aF73B2Abb5536290C2`
    - EntryPoint: `0x4337084d9e255ff0702461cf8895ce9e3b5ff108`
    - Fee token: `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14` (WETH)
    - Quota per token: 10
    - Quota per token scale: 0 (no scale)
    - Timeframe for quota reset: 24 hours
    - Maximal available quota: 0 (unlimited)
    - Required token multiplier: 1 (no multiplier)
    - Enable Conditions Delay: 48 hours
    - Initial Conditions: `0x682953FC8EE8D5feF838a680824163eE6561b7E7` (SupportedHarbourCondition)

## Conditions

### SupportedHarbourCondition

- Gnosis Chain
  - Address: `0x682953FC8EE8D5feF838a680824163eE6561b7E7`
  - Configuration:
    - Supported Harbour: `0x7E299130D19bd0F3D86718d389a4DEF957034189`

- Sepolia
  - Address: `0x682953FC8EE8D5feF838a680824163eE6561b7E7`
  - Configuration:
    - Supported Harbour: `0x7E299130D19bd0F3D86718d389a4DEF957034189`

