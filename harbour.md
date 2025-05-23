# The Hidden Weak Link in Many Multi-Signature Wallets

Multi-signature (multisig) wallets are widely used to protect high-value digital assets. By requiring multiple parties to approve a transaction before it executes, they add a layer of security that prevents any single individual from unilaterally moving funds.

However, a less visible — but critical — weakness lies not in the blockchain contract itself, but in how transaction approvals are coordinated **before** reaching the chain.

## Off-Chain Coordination: A Silent Bottleneck

Many multisig wallets rely on an **off-chain coordination layer** — essentially a centralized service where transaction proposals are created and signatures are collected. Instead of broadcasting proposals directly to the blockchain, users interact with this intermediary system, which is often built on top of a centralized database.

For a brief but crucial window, this off-chain system becomes the **source of truth** for pending transactions. The blockchain remains secure and decentralized, but transaction coordination is temporarily outsourced to a single, mutable platform.

<img src="assets/lifecycle.png" alt="Transaction Lifecycle" />

## Availability Risks: Locked Funds During Downtime

This setup creates a significant **availability risk**. If the off-chain coordination service goes offline — due to server issues, maintenance, or attack — users are unable to propose or sign new transactions. Even though the underlying blockchain contract is unaffected, access to funds becomes functionally frozen.

Such incidents have occurred in real-world scenarios, including a widely used multisig interface that went down for days, leaving users unable to operate their wallets.

## Security Risks: Tampering in Transit

Beyond downtime, the off-chain layer poses a **security risk**. If compromised, attackers could tamper with pending transactions before all signatures are collected — changing recipient addresses, amounts, or even transaction order.

A prominent security breach in early 2025 illustrated this vulnerability: malicious actors modified what signers saw, leading to substantial losses despite the blockchain contract never being directly exploited.

## The Centralization Paradox

While the on-chain multisig contract may be decentralized and robust, the reliance on a single off-chain coordination service reintroduces **centralization through the back door**. It creates a **single point of failure** — both technically and operationally — that undermines the goals of resilience and trustlessness.

Until the ecosystem reconsiders how multisig coordination is handled, this overlooked layer will remain a silent bottleneck in systems that are otherwise designed to be trust-minimized.
