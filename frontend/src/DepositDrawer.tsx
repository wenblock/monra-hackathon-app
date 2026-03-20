import { Check, Copy, Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { TRANSFER_ASSETS, getTransferAssetIconPath, getTransferAssetLabel } from "@/assets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import InlineNotice from "@/components/ui/inline-notice";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { logRuntimeError } from "@/lib/log-runtime-error";

interface DepositDrawerProps {
  onOpenChange: (isOpen: boolean) => void;
  open: boolean;
  walletAddress: string | null;
}

function DepositDrawer({ onOpenChange, open, walletAddress }: DepositDrawerProps) {
  const [copyError, setCopyError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [qrCodeError, setQrCodeError] = useState<string | null>(null);

  const copyAddress = useCallback(async () => {
    if (!walletAddress) {
      return;
    }

    try {
      await navigator.clipboard.writeText(walletAddress);
      setIsCopied(true);
      setCopyError(null);
    } catch (error) {
      logRuntimeError("Unable to copy deposit wallet address.", error);
      setCopyError("Unable to copy the wallet address. Copy it manually for now.");
    }
  }, [walletAddress]);

  useEffect(() => {
    if (!isCopied) {
      return;
    }

    const timeout = window.setTimeout(() => setIsCopied(false), 1800);
    return () => window.clearTimeout(timeout);
  }, [isCopied]);

  useEffect(() => {
    if (!open || !walletAddress) {
      setQrCodeDataUrl(null);
      setQrCodeError(null);
      return;
    }

    let cancelled = false;

    void import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(walletAddress, {
          margin: 1,
          width: 280,
        }),
      )
      .then((result: string) => {
        if (!cancelled) {
          setQrCodeDataUrl(result);
          setQrCodeError(null);
        }
      })
      .catch((error: unknown) => {
        logRuntimeError("Unable to generate deposit QR code.", error);
        if (!cancelled) {
          setQrCodeDataUrl(null);
          setQrCodeError(
            "We could not generate the QR code. The wallet address is still available to copy.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, walletAddress]);

  useEffect(() => {
    if (open) {
      return;
    }

    setCopyError(null);
    setIsCopied(false);
    setQrCodeDataUrl(null);
    setQrCodeError(null);
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[min(94vw,32rem)] overflow-y-auto bg-background text-foreground"
      >
        <SheetHeader className="border-b border-border/80 bg-background pb-5">
          <SheetTitle>Deposit</SheetTitle>
          <SheetDescription>
            Receive supported assets on Solana Mainnet using your treasury wallet address.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 p-6">
          {copyError ? (
            <InlineNotice variant="warning" title="Copy unavailable">
              {copyError}
            </InlineNotice>
          ) : null}

          {qrCodeError ? (
            <InlineNotice variant="warning" title="QR code unavailable">
              {qrCodeError}
            </InlineNotice>
          ) : null}

          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Receive address</p>
            <div className="flex justify-center rounded-[calc(var(--radius)+6px)] border bg-secondary/25 p-5">
              {walletAddress && qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt="Treasury deposit QR code"
                  className="size-64 rounded-2xl bg-white p-3"
                />
              ) : (
                <div className="flex size-64 items-center justify-center rounded-2xl bg-white px-6 text-center text-sm text-muted-foreground">
                  {walletAddress
                    ? "QR code unavailable"
                    : "Wallet is still syncing to the backend."}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[calc(var(--radius)+6px)] border border-border/80 bg-secondary/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-mono uppercase tracking-[0.22em] text-muted-foreground">
                  Wallet address
                </p>
                <p className="mt-2 break-all font-mono text-sm text-foreground">
                  {walletAddress ?? "Wallet is still syncing to the backend."}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                disabled={!walletAddress}
                onClick={() => void copyAddress()}
              >
                {isCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
                <span className="sr-only">Copy wallet address</span>
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Supported network</p>
            <Badge variant="secondary" className="w-fit">
              Solana Mainnet
            </Badge>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Supported assets</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {TRANSFER_ASSETS.map(asset => (
                <div
                  key={asset}
                  className="flex items-center gap-3 rounded-[calc(var(--radius)+4px)] border border-border/70 bg-card px-4 py-3"
                >
                  <img
                    src={getTransferAssetIconPath(asset)}
                    alt={`${getTransferAssetLabel(asset)} token icon`}
                    className="size-9 rounded-full bg-white object-contain p-1"
                  />
                  <span className="font-medium text-foreground">{getTransferAssetLabel(asset)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[calc(var(--radius)+6px)] border border-dashed border-border bg-secondary/25 p-4 text-sm text-muted-foreground">
            Send funds only on Solana Mainnet to avoid asset loss.
          </div>

          <div className="flex items-center gap-3 rounded-[calc(var(--radius)+6px)] border border-primary/15 bg-primary/5 p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Wallet className="size-4" />
            </span>
            <p className="text-sm text-foreground">
              Receive SOL, USDC, and EURC at this treasury address.
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default DepositDrawer;
