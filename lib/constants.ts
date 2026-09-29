import type { StatusMeta, TxStatus } from "./types";

export const STATUS_META: Record<TxStatus, StatusMeta> = {
  PENDING: {
    color: "var(--status-pending)",
    bg: "var(--status-pending-bg)",
    glow: "var(--status-pending-glow)",
    label: "PENDING",
  },
  PROCESSING: {
    color: "var(--status-processing)",
    bg: "var(--status-processing-bg)",
    glow: "var(--status-processing-glow)",
    label: "PROCESSING",
  },
  COMPLETED: {
    color: "var(--status-completed)",
    bg: "var(--status-completed-bg)",
    glow: "var(--status-completed-glow)",
    label: "COMPLETED",
  },
  FAILED: {
    color: "var(--status-failed)",
    bg: "var(--status-failed-bg)",
    glow: "var(--status-failed-glow)",
    label: "FAILED",
  },
};

export const AMBER = "var(--accent)";
export const NEUTRAL = "var(--fg)";
export const BG0 = "var(--bg-0)";
export const BG1 = "var(--bg-1)";
export const BG2 = "var(--bg-2)";
export const BG3 = "var(--bg-3)";
export const BORDER = "var(--border)";
export const DIM = "var(--dim)";

/**
 * The app's monospace stack.
 *
 * The variable is defined by `next/font` in `app/layout.tsx`, which self-hosts
 * the face and generates its own family name — so the literal string
 * "IBM Plex Mono" no longer resolves to anything and must not be used.
 *
 * Form controls do not inherit `font-family` from `body`, so buttons, inputs
 * and selects still need this applied explicitly rather than relying on the
 * cascade.
 */
export const MONO = "var(--font-ibm-plex-mono), monospace";

export const ABI_ENDPOINTS = [
  {
    name: "initialize",
    sig: "initialize(admin: Address, relay_signer: Address)",
    access: "one-time",
    desc: "Bootstrap the contract. Fails if already initialized. One-time call only.",
  },
  {
    name: "register_transaction",
    sig: "register_transaction(payload: TxPayload) → tx_id: String",
    access: "relay_signer",
    desc: "Register a new transaction. Returns a UUID. Emits TransactionRegistered event.",
  },
  {
    name: "start_processing",
    sig: "start_processing(tx_id: String)",
    access: "relay_signer",
    desc: "Advance transaction PENDING → PROCESSING. Emits StatusChanged.",
  },
  {
    name: "complete_transaction",
    sig: "complete_transaction(tx_id: String)",
    access: "relay_signer",
    desc: "Advance PROCESSING → COMPLETED. Emits StatusChanged + triggers callback.",
  },
  {
    name: "fail_transaction",
    sig: "fail_transaction(tx_id: String, reason: String)",
    access: "relay_signer",
    desc: "Mark transaction as FAILED with a reason string. Emits StatusChanged.",
  },
  {
    name: "get_transaction",
    sig: "get_transaction(tx_id: String) → Transaction",
    access: "public",
    desc: "Read-only simulation. Returns full Transaction struct from ledger storage.",
  },
  {
    name: "is_duplicate",
    sig: "is_duplicate(tx_id: String) → bool",
    access: "public",
    desc: "Check whether a tx_id has already been registered. Safe read-only call.",
  },
  {
    name: "register_callback",
    sig: "register_callback(payload: CallbackPayload)",
    access: "relay_signer",
    desc: "Register a webhook URL for a transaction lifecycle event notification.",
  },
  {
    name: "transfer_admin",
    sig: "transfer_admin(new_admin: Address)",
    access: "admin",
    desc: "Transfer admin rights. Caller must be the current admin address.",
  },
  {
    name: "set_relay_signer",
    sig: "set_relay_signer(new_signer: Address)",
    access: "admin",
    desc: "Replace the relay signer address. Caller must be the current admin.",
  },
  {
    name: "health",
    sig: "health() → String",
    access: "public",
    desc: "Returns contract health string. No signing required.",
  },
  {
    name: "version",
    sig: "version() → String",
    access: "public",
    desc: "Returns contract semver string e.g. '0.1.0'.",
  },
];
