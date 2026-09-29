export type TxStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface Transaction {
  id: string;
  asset: string;
  amount: number;
  status: TxStatus;
  timestamp: number;
  from: string;
  to: string;
  memo: string;
  callback_url: string;
  retries: number;
  created_at: number;
}

export interface ContractInfo {
  version: string;
  network: string;
  address: string;
  admin: string;
  relay_signer: string;
  health: string;
}

export interface StatusMeta {
  color: string;
  bg: string;
  glow: string;
  label: string;
}

export interface CallbackPayload {
  tx_id: string;
  callback_url: string;
  secret: string;
}

/**
 * Estimated network fee for a Soroban contract call, derived from the
 * resource usage reported by `simulateContractCall`.
 */
export interface FeeEstimate {
  /** Total estimated fee in stroops (inclusion + resource fees). */
  totalStroops: number;
  /** Base inclusion fee in stroops. */
  inclusionStroops: number;
  /** Resource fee in stroops derived from simulated CPU/mem/ledger usage. */
  resourceStroops: number;
  /** Estimated fee in XLM (1 XLM = 10_000_000 stroops). */
  totalXlm: number;
  /** Minimum resource fee returned by the simulation, in stroops. */
  minResourceStroops: number;
}

/**
 * A constructed fee-bump transaction ready for the user to sign and submit.
 * Built via `TransactionBuilder.buildFeeBumpTransaction`.
 */
export interface FeeBumpTransaction {
  /** Base64-encoded XDR of the fee-bump envelope. */
  xdr: string;
  /** Hash of the inner (original) transaction being bumped. */
  innerHash: string;
  /** Fee bid for the bump, in stroops. */
  feeStroops: number;
  /** Account funding the bump (the fee source). */
  feeSource: string;
}

/**
 * Result of attempting to build a fee-bump for a pending transaction.
 * `stale` is true when the original transaction confirmed (or otherwise
 * changed state) in the interim, so no bump should be submitted.
 */
export interface FeeBumpResult {
  bump: FeeBumpTransaction | null;
  stale: boolean;
  reason?: string;
}
