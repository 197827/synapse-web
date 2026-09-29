"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { scValToNative } from "@stellar/stellar-sdk";
import { useSoroban, useSorobanEvents } from "./SorobanProvider";
import { simulateContractCall, stringArg } from "./contract";
import {
  mergeTransactionEvents,
  nativeToTransaction,
  PLACEHOLDER_MARKER,
} from "./transactionMerge";
import { useWallet } from "@/lib/wallet/WalletProvider";
import type { Transaction } from "@/lib/types";

const RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org";

/**
 * Merges the mock baseline with live events from the RPC event poller (see
 * mergeTransactionEvents). When a wallet is connected and a real contract is
 * configured, placeholder rows are enriched with full details via a
 * get_transaction() read-only call.
 *
 * When the active contractId changes, enriched state and fetch tracking are
 * cleared immediately to guarantee no stale transaction data leaks.
 */
export function useLiveTransactions(): Transaction[] {
  const events = useSorobanEvents();
  const { contractId } = useSoroban();
  const { address } = useWallet();
  const [enriched, setEnriched] = useState<Record<string, Transaction>>({});
  const fetchedIds = useRef<Set<string>>(new Set());

  // Clear enriched state and fetched tracker whenever contractId changes
  useEffect(() => {
    setEnriched({});
    fetchedIds.current.clear();
  }, [contractId]);

  const baseline = useMemo(() => mergeTransactionEvents(events), [events]);

  useEffect(() => {
    if (!address || !contractId) return;

    const toFetch = baseline.filter(
      (tx) => tx.asset === PLACEHOLDER_MARKER && !fetchedIds.current.has(tx.id)
    );
    if (toFetch.length === 0) return;

    for (const tx of toFetch) {
      fetchedIds.current.add(tx.id);
      simulateContractCall(RPC_URL, contractId, address, "get_transaction", [stringArg(tx.id)])
        .then((simulated) => {
          if (!simulated.result) return;
          const native = scValToNative(simulated.result.retval);
          setEnriched((prev) => ({ ...prev, [tx.id]: nativeToTransaction(tx.id, native, tx) }));
        })
        .catch(() => {
          // Leave the placeholder row in place; enrichment is best-effort.
        });
    }
  }, [baseline, address, contractId]);

  return useMemo(() => baseline.map((tx) => enriched[tx.id] ?? tx), [baseline, enriched]);
}
