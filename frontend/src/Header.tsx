import { useSolanaAddress } from "@coinbase/cdp-hooks";
import { AuthButton } from "@coinbase/cdp-react/components/AuthButton";
import { useCallback, useEffect, useState } from "react";

import { IconCheck, IconCopy, IconUser } from "./Icons";

/**
 * Header component
 */
function Header() {
  const { solanaAddress } = useSolanaAddress();
  const [isCopied, setIsCopied] = useState(false);

  const formatAddress = useCallback((address: string) => {
    if (!address) return "";
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  }, []);

  const copyAddress = async () => {
    if (!solanaAddress) return;
    try {
      await navigator.clipboard.writeText(solanaAddress);
      setIsCopied(true);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    if (!isCopied) return;
    const timeout = setTimeout(() => {
      setIsCopied(false);
    }, 2000);
    return () => clearTimeout(timeout);
  }, [isCopied]);

  return (
    <header>
      <div className="header-inner">
        <div className="title-container">
          <h1 className="site-title">Monra</h1>
        </div>
        <div className="user-info flex-row-container">
          {solanaAddress && (
            <button
              aria-label="copy wallet address"
              className="flex-row-container copy-address-button"
              onClick={copyAddress}
            >
              {!isCopied && (
                <>
                  <IconUser className="user-icon user-icon--user" />
                  <IconCopy className="user-icon user-icon--copy" />
                </>
              )}
              {isCopied && <IconCheck className="user-icon user-icon--check" />}
              <span className="wallet-address">{formatAddress(solanaAddress)}</span>
            </button>
          )}
          <AuthButton />
        </div>
      </div>
    </header>
  );
}

export default Header;
