"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  ensureWalletKitInitialized,
  StellarWalletsKit,
  storeSelectedWalletId,
  clearSelectedWalletId,
  getStoredWalletId,
  isLedgerModule,
} from "./kit";

interface WalletContextValue {
  address: string | null;
  connecting: boolean;
  error: string | null;
  /** True while a Ledger device is awaiting on-device confirmation. */
  awaitingDeviceConfirmation: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue>({
  address: null,
  connecting: false,
  error: null,
  awaitingDeviceConfirmation: false,
  connect: async () => {},
  disconnect: async () => {},
});

export function useWallet() {
  return useContext(WalletContext);
}

/**
 * Ledger signing requires a physical on-device confirmation which can take a
 * while. We surface a distinct state so the UI can show "Confirm on your
 * Ledger device" instead of appearing frozen or hung.
 */
function isDeviceConfirmationError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /reject|denied|cancel|declin/i.test(message);
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingDeviceConfirmation, setAwaitingDeviceConfirmation] = useState(false);

  useEffect(() => {
    ensureWalletKitInitialized();
    if (!getStoredWalletId()) return;

    let cancelled = false;
    StellarWalletsKit.getAddress()
      .then(({ address: restoredAddress }) => {
        if (!cancelled) setAddress(restoredAddress);
      })
      .catch(() => {
        clearSelectedWalletId();
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async () => {
    ensureWalletKitInitialized();
    setConnecting(true);
    setError(null);
    setAwaitingDeviceConfirmation(false);
    try {
      await StellarWalletsKit.authModal({});
      const selectedModule = StellarWalletsKit.selectedModule;
      const ledger = isLedgerModule(selectedModule);
      if (ledger) setAwaitingDeviceConfirmation(true);
      const { address: connectedAddress } = await StellarWalletsKit.getAddress();
      setAddress(connectedAddress);
      storeSelectedWalletId(selectedModule.productId);
    } catch (err) {
      if (isDeviceConfirmationError(err)) {
        setError("Request rejected on your Ledger device. Please try again.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to connect wallet");
      }
    } finally {
      setAwaitingDeviceConfirmation(false);
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await StellarWalletsKit.disconnect();
    } catch {
      // Some modules don't implement disconnect(); local state is cleared regardless.
    }
    clearSelectedWalletId();
    setAddress(null);
    setAwaitingDeviceConfirmation(false);
  }, []);

  return (
    <WalletContext.Provider
      value={{ address, connecting, error, awaitingDeviceConfirmation, connect, disconnect }}
    >
      {children}
    </WalletContext.Provider>
  );
}
