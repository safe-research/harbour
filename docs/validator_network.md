# Validator Network

## Technical Setup

The validator network is run using Waku as a communication channel. For this the topic `/safe/harbour/v1/txs` is used. 

The signer interface runs a light node in the browser to submit signed Safe transactions to this topics. The protobuf specification of the messages is the following:

```protobuf
syntax = "proto3";

message SafeTransaction {
  string chainId = 1;
  string safe = 2;
  string to = 3;
  string value = 4;
  string data = 5;
  uint32 operation = 6;
  string safeTxGas = 7;
  string baseGas = 8;
  string gasPrice = 9;
  string gasToken = 10;
  string refundReceiver = 11;
  string nonce = 12;
  string signature = 13;
}
```

The validators will run a Waku light node in a worker to listen for incoming messages, validating the signed Safe transaction and packing them into a UserOperation to submit the information for storage onchain.

## Validating Safe transactions

Before submitting the validator should run validations on the Safe transaction. While this is not required, this is a powerful tool to increase the functionality of the validator network.

One condition that should be validated is that the Safe exists on the target chain and that the signer is part of the owners of that Safe. 

The conditions should be proofable onchain and if a validator submits a UserOperation that does not follow these conditions to harbour, they should get slashed (more on this in the economics section).

## Economics

TBD

## Setting up a validator

### Running a validator worker

The instructions assume a machines that has `tar`, `curl` and `podman` (or `docker`) installed.

1. Download the repository code 
```sh
curl -sL https://github.com/safe-research/harbour/archive/project_relaying.tar.gz | tar xz
```

2. Build validator worker
```sh
podman build -t validator-worker harbour-project_relaying/validator/
```

3. Create `.dev.vars` file [see .dev.vars.sample in the validator folder]

4. Run validator
```sh
podman run -d --name harbour-validator --env-file .dev.vars validator-worker
```

5. Follow the logs
```sh
podman logs -f harbour-validator
```

### Funding the validator

The instructions assume a machines that has local version of the Safe harbour repository running.

1. Setup the `contracts` package of the harbour project

2. Create `.env` file [see .env.example in the contracts folder]. Most importantly this requires a private key of an account that owns the `FEE_TOKEN` used to get quota on the `SafeHarbourPaymaster`

3. Execute the funding script
```sh
npm exec hardhat deposit-validator-tokens -- --network gnosis --amount 0.01 --validator 0x...
```
