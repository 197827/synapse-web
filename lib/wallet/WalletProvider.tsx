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

const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon-testnet.stellar.org";
const BALANCE_CACHE_MS = 15_000;
const LOW_BALANCE_THRESHOLD_XLM = 1;

export interface WalletBalance {
  asset: string;
  balance: string;
}

interface WalletContextValue {
  address: string | null;
  connecting: boolean;
  error: string | null;
  /** True while a Ledger device is awaiting on-device confirmation. */
  awaitingDeviceConfirmation: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  balances: WalletBalance[];
  balanceLoading: boolean;
  balanceError: string | null;
  accountFunded: boolean;
  lowBalance: boolean;
  refreshBalance: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue>({
  address: null,
  connecting: false,
  error: null,
  awaitingDeviceConfirmation: false,
  connect: async () => {},
  disconnect: async () => {},
  balances: [],
  balanceLoading: false,
  balanceError: null,
  accountFunded: true,
  lowBalance: false,
  refreshBalance: async () => {},
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
  const [balances, setBalances] = useState<WalletBalance[]>([]);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [accountFunded, setAccountFunded] = useState(true);
  const [lastFetchedAt, setLastFetchedAt] = useState(0);
  const [awaitingDeviceConfirmation, setAwaitingDeviceConfirmation] = useState(false);

  const fetchBalance = useCallback(async (account: string, force = false) => {
    if (!force && Date.now() - lastFetchedAt < BALANCE_CACHE_MS) return;
    setBalanceLoading(true);
    setBalanceError(null);
    try {
      const res = await fetch(`${HORIZON_URL}/accounts/${account}`);
      if (res.status === 404) {
        setBalances([]);
        setAccountFunded(false);
        setLastFetchedAt(Date.now());
        return;
      }
      if (!res.ok) throw new Error(`Horizon responded with ${res.status}`);
      const data = (await res.json()) as {
        balances?: Array<{ asset_type: string; asset_code?: string; balance: string }>;
      };
      const parsed: WalletBalance[] = (data.balances ?? []).map((b) => ({
        asset: b.asset_type === "native" ? "XLM" : b.asset_code ?? b.asset_type,
        balance: b.balance,
      }));
      setBalances(parsed);
      setAccountFunded(true);
      setLastFetchedAt(Date.now());
    } catch (err) {
      setBalanceError(err instanceof Error ? err.message : "Failed to load balance");
    } finally {
      setBalanceLoading(false);
    }
  }, [lastFetchedAt]);

  const refreshBalance = useCallback(async () => {
    if (address) await fetchBalance(address, true);
  }, [address, fetchBalance]);

  useEffect(() => {
    ensureWalletKitInitialized();
    const storedWalletId = getStoredWalletId();
    if (!storedWalletId) return;

    // The persisted wallet may no longer be installed/available. If the kit
    // can't resolve it, clear the stale selection instead of retrying forever.
    const available = StellarWalletsKit.modules?.some(
      (m) => m.productId === storedWalletId,
    );
    if (!available) {
      clearSelectedWalletId();
      return;
    }

    let cancelled = false;
    StellarWalletsKit.getAddress()
      .then(({ address: restoredAddress }) => {
        if (!cancelled) setAddress(restoredAddress);
      })
      .catch(() => {
        // Silent reconnection isn't supported (or was rejected) by this wallet;
        // fall back to the disconnected state without prompting the user.
        if (!cancelled) clearSelectedWalletId();
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!address) {
      setBalances([]);
      setAccountFunded(true);
      setBalanceError(null);
      return;
    }
    void fetchBalance(address, true);
  }, [address, fetchBalance]);

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

  const nativeBalance = balances.find((b) => b.asset === "XLM");
  const lowBalance =
    accountFunded &&
    nativeBalance !== undefined &&
    Number(nativeBalance.balance) < LOW_BALANCE_THRESHOLD_XLM;

  return (
    <WalletContext.Provider
      value={{
        address,
        connecting,
        error,
        awaitingDeviceConfirmation,
        connect,
        disconnect,
        balances,
        balanceLoading,
        balanceError,
        accountFunded,
        lowBalance,
        refreshBalance,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}
