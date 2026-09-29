"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  ensureWalletKitInitialized,
  StellarWalletsKit,
  storeSelectedWalletId,
  clearSelectedWalletId,
  getStoredWalletId,
  isWalletConnectModule,
} from "./kit";

/**
 * Typed set of wallet connection failure modes. Each maps to distinct,
 * actionable recovery copy in the connection-error UI.
 */
export type WalletErrorKind =
  | "not-installed"
  | "locked"
  | "rejected"
  | "wrong-network"
  | "unknown";

export interface WalletError {
  kind: WalletErrorKind;
  /** Human-readable, actionable message for the user. */
  message: string;
  /** Install page for the specific wallet, when kind is "not-installed". */
  installUrl?: string;
  /** Raw underlying error message, for diagnostics. */
  raw?: string;
}

/**
 * Install pages for the wallets we support. Used to give the "not installed"
 * state a direct, wallet-specific link instead of a generic message.
 */
const INSTALL_URLS: Record<string, string> = {
  freighter: "https://www.freighter.app/",
  xbull: "https://xbull.app/",
};

/**
 * Best-effort identification of the wallet the user attempted to connect with,
 * so the "not installed" state can link to the correct install page.
 */
function detectWalletId(raw: string): string | null {
  const lower = raw.toLowerCase();
  if (lower.includes("freighter")) return "freighter";
  if (lower.includes("xbull")) return "xbull";
  try {
    const productId = StellarWalletsKit.selectedModule?.productId;
    if (typeof productId === "string" && productId.length > 0) {
      return productId.toLowerCase();
    }
  } catch {
    // No module selected yet; fall through.
  }
  return null;
}

/**
 * Classify a raw kit/extension error into a typed recovery state. Freighter and
 * xBull surface different error shapes (string codes vs. thrown Error
 * messages), so we normalize to a string and match on well-known signals.
 */
export function classifyWalletError(err: unknown): WalletError {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "";
  const lower = raw.toLowerCase();

  // Not installed: extension absent / not detected by the page.
  if (
    lower.includes("not installed") ||
    lower.includes("not detected") ||
    lower.includes("not available") ||
    lower.includes("no wallet") ||
    lower.includes("is not connected") ||
    lower.includes("extension not found") ||
    lower.includes("wallet not found")
  ) {
    const walletId = detectWalletId(raw);
    const installUrl = walletId ? INSTALL_URLS[walletId] : undefined;
    const walletName = walletId ? walletId.charAt(0).toUpperCase() + walletId.slice(1) : "wallet";
    return {
      kind: "not-installed",
      message: `The ${walletName} extension isn't installed. Install it, then try connecting again.`,
      installUrl,
      raw,
    };
  }

  // Locked: extension present but requires the user to unlock it first.
  if (
    lower.includes("locked") ||
    lower.includes("unlock") ||
    lower.includes("password") ||
    lower.includes("wallet is locked")
  ) {
    return {
      kind: "locked",
      message: "Your wallet is locked. Unlock the extension, then try connecting again.",
      raw,
    };
  }

  // Rejected: user dismissed or declined the connection prompt.
  if (
    lower.includes("reject") ||
    lower.includes("denied") ||
    lower.includes("declined") ||
    lower.includes("cancel") ||
    lower.includes("user closed") ||
    lower.includes("dismiss")
  ) {
    return {
      kind: "rejected",
      message: "Connection request was rejected. Approve the request in your wallet to connect.",
      raw,
    };
  }

  // Wrong network: wallet is on a different network than the app expects.
  if (
    lower.includes("wrong network") ||
    lower.includes("network mismatch") ||
    lower.includes("unsupported network") ||
    lower.includes("incorrect network") ||
    lower.includes("switch network")
  ) {
    return {
      kind: "wrong-network",
      message: "Your wallet is on the wrong network. Switch to the correct network and try again.",
      raw,
    };
  }

  return {
    kind: "unknown",
    message: raw || "Something went wrong connecting your wallet. Please try again.",
    raw,
  };
}

interface WalletContextValue {
  address: string | null;
  accounts: string[];
  connecting: boolean;
  error: WalletError | null;
  /**
   * True while a WalletConnect pairing is in progress (QR shown / deep link
   * opened). Consumers can use this to render the pairing UI.
   */
  pairing: boolean;
  /**
   * URI to render as a QR code (desktop) or open as a deep link (mobile) while
   * pairing via WalletConnect. Null when not pairing.
   */
  pairingUri: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  switchAccount: (account: string) => void;
}

const WalletContext = createContext<WalletContextValue>({
  address: null,
  accounts: [],
  connecting: false,
  error: null,
  pairing: false,
  pairingUri: null,
  connect: async () => {},
  disconnect: async () => {},
  switchAccount: () => {},
});

export function useWallet() {
  return useContext(WalletContext);
}

/**
 * Best-effort enumeration of the accounts the connected extension exposes.
 * Wallets that don't support multi-account enumeration return a single
 * account (or throw), in which case the switcher stays hidden.
 */
async function enumerateAccounts(activeAddress: string): Promise<string[]> {
  try {
    const kit = StellarWalletsKit as unknown as {
      getNetwork?: () => Promise<unknown>;
      getAccounts?: () => Promise<string[]>;
    };
    if (typeof kit.getAccounts === "function") {
      const accounts = await kit.getAccounts();
      if (Array.isArray(accounts) && accounts.length > 0) {
        return accounts.includes(activeAddress) ? accounts : [activeAddress, ...accounts];
      }
    }
  } catch {
    // Extension doesn't support enumeration; fall through to single account.
  }
  return [activeAddress];
}

/**
 * WalletConnect exposes a pairing URI (wc:...) that must be rendered as a QR
 * code on desktop or opened as a deep link on mobile. The kit surfaces it via
 * the module's `getQrCode`/`getUri` helpers depending on version, so we probe
 * both and fall back to null when neither is available.
 */
async function getPairingUri(): Promise<string | null> {
  try {
    const module = StellarWalletsKit.selectedModule as unknown as {
      getQrCode?: () => Promise<{ uri?: string } | string>;
      getUri?: () => Promise<string> | string;
    };
    if (typeof module.getUri === "function") {
      const uri = await module.getUri();
      if (typeof uri === "string" && uri.length > 0) return uri;
    }
    if (typeof module.getQrCode === "function") {
      const qr = await module.getQrCode();
      if (typeof qr === "string" && qr.length > 0) return qr;
      if (qr && typeof qr === "object" && typeof qr.uri === "string") return qr.uri;
    }
  } catch {
    // Module doesn't expose a pairing URI; nothing to render.
  }
  return null;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<WalletError | null>(null);
  const [pairing, setPairing] = useState(false);
  const [pairingUri, setPairingUri] = useState<string | null>(null);

  useEffect(() => {
    ensureWalletKitInitialized();
    if (!getStoredWalletId()) return;

    let cancelled = false;
    StellarWalletsKit.getAddress()
      .then(async ({ address: restoredAddress }) => {
        if (cancelled) return;
        setAddress(restoredAddress);
        const enumerated = await enumerateAccounts(restoredAddress);
        if (!cancelled) setAccounts(enumerated);
      })
      .catch(() => {
        // Session expired or relay disconnected: clear the stale session and
        // surface a reconnect prompt instead of silently failing.
        clearSelectedWalletId();
        if (!cancelled) {
          setError({
            kind: "unknown",
            message: "Wallet session expired. Please reconnect.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async () => {
    ensureWalletKitInitialized();
    setConnecting(true);
    setError(null);
    setPairingUri(null);
    try {
      await StellarWalletsKit.authModal({});
      const selected = StellarWalletsKit.selectedModule;
      const walletConnect = isWalletConnectModule(selected);
      if (walletConnect) {
        setPairing(true);
        setPairingUri(await getPairingUri());
      }
      const { address: connectedAddress } = await StellarWalletsKit.getAddress();
      setAddress(connectedAddress);
      setAccounts(await enumerateAccounts(connectedAddress));
      storeSelectedWalletId(selected.productId);
    } catch (err) {
      setError(classifyWalletError(err));
    } finally {
      setPairing(false);
      setPairingUri(null);
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
    setAccounts([]);
    setPairing(false);
    setPairingUri(null);
  }, []);

  const switchAccount = useCallback((account: string) => {
    setAccounts((current) => (current.includes(account) ? current : [...current, account]));
    setAddress(account);
  }, []);

  return (
    <WalletContext.Provider
      value={{
        address,
        accounts,
        connecting,
        error,
        pairing,
        pairingUri,
        connect,
        disconnect,
        switchAccount,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}
