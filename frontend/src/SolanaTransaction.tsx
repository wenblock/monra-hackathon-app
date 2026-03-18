import { Buffer } from "buffer";

import { useGetAccessToken, useSolanaAddress } from "@coinbase/cdp-hooks";
import {
  SendSolanaTransactionButton,
  type SendSolanaTransactionButtonProps,
} from "@coinbase/cdp-react/components/SendSolanaTransactionButton";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { ArrowUpRight, CheckCircle2, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { fetchSolanaTransactionContext } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  balance?: string;
  onSuccess?: () => void | Promise<void>;
}

function SolanaTransaction({ balance, onSuccess }: Props) {
  const { solanaAddress } = useSolanaAddress();
  const { getAccessToken } = useGetAccessToken();
  const [transactionSignature, setTransactionSignature] = useState("");
  const [error, setError] = useState("");
  const [transaction, setTransaction] = useState("");

  const hasBalance = useMemo(() => {
    return Number(balance ?? "0") > 0;
  }, [balance]);

  useEffect(() => {
    if (!solanaAddress) {
      setTransaction("");
      return;
    }

    let cancelled = false;

    setError("");
    setTransaction("");

    void createAndEncodeTransaction(solanaAddress, getAccessToken)
      .then(nextTransaction => {
        if (!cancelled) {
          setTransaction(nextTransaction);
        }
      })
      .catch((transactionError: unknown) => {
        console.error(transactionError);
        if (!cancelled) {
          setError("Unable to prepare a Solana mainnet transaction.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [getAccessToken, solanaAddress]);

  const handleTransactionError: SendSolanaTransactionButtonProps["onError"] = error => {
    setTransactionSignature("");
    setError(error.message);
  };

  const handleTransactionSuccess: SendSolanaTransactionButtonProps["onSuccess"] = signature => {
    setTransactionSignature(signature);
    setError("");
    void onSuccess?.();
  };

  const handleReset = () => {
    setTransactionSignature("");
    setError("");
  };

  if (balance === undefined) {
    return (
      <div className="space-y-4">
        <Badge variant="secondary">Preparing wallet</Badge>
        <Skeleton className="h-6 w-40 rounded-full" />
        <Skeleton className="h-4 w-full rounded-full" />
        <Skeleton className="h-11 w-52 rounded-full" />
      </div>
    );
  }

  if (!transactionSignature && error) {
    return (
      <div className="space-y-4">
        <Badge variant="outline">Transfer status</Badge>
        <div>
          <h3 className="text-xl font-semibold text-foreground">Transaction issue</h3>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={handleReset} variant="secondary">
          <RotateCcw className="size-4" />
          Reset and try again
        </Button>
      </div>
    );
  }

  if (transactionSignature) {
    return (
      <div className="space-y-4">
        <Badge variant="success">Transaction sent</Badge>
        <div>
          <h3 className="flex items-center gap-2 text-xl font-semibold text-foreground">
            <CheckCircle2 className="size-5 text-primary" />
            Transfer submitted
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            View the signature on the Solana explorer and reset when you want to send another mainnet transaction.
          </p>
        </div>
        <a
          className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
          href={`https://explorer.solana.com/tx/${transactionSignature}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {transactionSignature.slice(0, 6)}...{transactionSignature.slice(-4)}
          <ArrowUpRight className="size-4" />
        </a>
        <Button className="w-full sm:w-auto" variant="secondary" onClick={handleReset}>
          Send another transaction
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Badge variant="secondary">Transfer</Badge>
      <div className="space-y-2">
        <h3 className="text-xl font-semibold text-foreground">Send 1 lamport to yourself</h3>
        {hasBalance && solanaAddress ? (
          <p className="text-sm text-muted-foreground">
            This submits a real Solana mainnet transaction to your own wallet and will consume a small network fee.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Fund the wallet with SOL on Solana mainnet, then reopen this dialog to submit a transfer.
          </p>
        )}
      </div>

      {hasBalance && solanaAddress && transaction ? (
        <div className="rounded-[calc(var(--radius)+2px)] border border-border/70 bg-secondary/40 p-4">
          <p className="mb-3 text-sm text-muted-foreground">
            Transaction network: <span className="font-medium text-foreground">Solana Mainnet</span>
          </p>
          <SendSolanaTransactionButton
            account={solanaAddress}
            network="solana"
            transaction={transaction}
            onError={handleTransactionError}
            onSuccess={handleTransactionSuccess}
          />
        </div>
      ) : hasBalance && solanaAddress ? (
        <div className="space-y-3 rounded-[calc(var(--radius)+2px)] border border-border/70 bg-secondary/40 p-4">
          <Badge variant="secondary">Preparing transaction</Badge>
          <Skeleton className="h-11 w-full rounded-full" />
        </div>
      ) : (
        <div className="rounded-[calc(var(--radius)+2px)] border border-dashed border-border bg-secondary/35 p-4 text-sm text-muted-foreground">
          A funded mainnet SOL balance is required before this transaction can be submitted.
        </div>
      )}
    </div>
  );
}

async function createAndEncodeTransaction(
  address: string,
  getAccessToken: () => Promise<string | null | undefined>,
) {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("Unable to fetch a CDP access token.");
  }

  const transactionContext = await fetchSolanaTransactionContext(token, {
    asset: "sol",
    senderAddress: address,
    recipientAddress: address,
  });
  const recipientAddress = new PublicKey(address);
  const fromPubkey = new PublicKey(address);

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey,
      toPubkey: recipientAddress,
      lamports: 1,
    }),
  );

  transaction.recentBlockhash = transactionContext.recentBlockhash;
  transaction.feePayer = fromPubkey;

  const serializedTransaction = transaction.serialize({
    requireAllSignatures: false,
  });

  return Buffer.from(serializedTransaction).toString("base64");
}

export default SolanaTransaction;
