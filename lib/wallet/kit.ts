import { StellarWalletsKit, Networks } from "@creit.tech/stellar-wallets-kit";
import { FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { xBullModule } from "@creit.tech/stellar-wallets-kit/modules/xbull";
import { LedgerModule } from "@creit.tech/stellar-wallets-kit/modules/ledger";
import { getStoredWalletId } from "./storage";

export { getStoredWalletId, storeSelectedWalletId, clearSelectedWalletId } from "./storage";

let initialized = false;

export function ensureWalletKitInitialized(): void {
  if (initialized || typeof window === "undefined") return;

  StellarWalletsKit.init({
    network: Networks.TESTNET,
    selectedWalletId: getStoredWalletId(),
    modules: [new FreighterModule(), new xBullModule(), new LedgerModule()],
  });

  initialized = true;
}

export { StellarWalletsKit };
