import type { Transaction, VersionedTransaction } from "@solana/web3.js";
import { Keypair } from "@solana/web3.js";

// @ts-expect-error Anchor does not publish browser entrypoint typings.
export * from "../../node_modules/@coral-xyz/anchor/dist/browser/index.js";

class Wallet {
  readonly payer: Keypair;

  constructor(payer: Keypair) {
    this.payer = payer;
  }

  get publicKey() {
    return this.payer.publicKey;
  }

  async signTransaction(transaction: Transaction | VersionedTransaction) {
    if (isVersionedTransaction(transaction)) {
      transaction.sign([this.payer]);
      return transaction;
    }

    transaction.partialSign(this.payer);
    return transaction;
  }

  async signAllTransactions(transactions: Array<Transaction | VersionedTransaction>) {
    return Promise.all(transactions.map(transaction => this.signTransaction(transaction)));
  }
}

function isVersionedTransaction(transaction: Transaction | VersionedTransaction): transaction is VersionedTransaction {
  return "version" in transaction;
}

export { Wallet };
