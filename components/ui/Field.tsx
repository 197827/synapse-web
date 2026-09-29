"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { BG3, BORDER, DIM, MONO } from "@/lib/constants";
import { listAddresses, type AddressBookEntry } from "@/lib/wallet/addressBook";

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  /** Enable address-book autocomplete suggestions for this field. */
  addressBook?: boolean;
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  addressBook = false,
}: FieldProps) {
  const [entries, setEntries] = useState<AddressBookEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!addressBook) return;
    setEntries(listAddresses());
  }, [addressBook]);

  const suggestions = useMemo(() => {
    if (!addressBook) return [];
    const q = value.trim().toLowerCase();
    return entries
      .filter(
        (e) =>
          !q ||
          e.address.toLowerCase().includes(q) ||
          e.label.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [addressBook, entries, value]);

  const showList = addressBook && open && suggestions.length > 0;

  const select = (entry: AddressBookEntry) => {
    onChange(entry.address);
    setOpen(false);
  };

  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          fontSize: 9,
          color: DIM,
          fontFamily: MONO,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setHighlight(0);
          if (addressBook) setOpen(true);
        }}
        placeholder={placeholder}
        autoComplete={addressBook ? "off" : undefined}
        onKeyDown={(e) => {
          if (!showList) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => (h + 1) % suggestions.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            select(suggestions[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        style={{
          width: "100%",
          background: BG3,
          border: `1px solid ${BORDER}`,
          color: "#eee",
          fontFamily: MONO,
          fontSize: 11,
          padding: "7px 10px",
          outline: "none",
          transition: "border-color 0.15s",
        }}
        onFocus={(e) => {
          e.target.style.borderColor = "rgba(245,166,35,0.45)";
          if (addressBook) setOpen(true);
        }}
        onBlur={(e) => {
          e.target.style.borderColor = BORDER;
          if (blurTimer.current) clearTimeout(blurTimer.current);
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
      />
      {showList && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 20,
            marginTop: 2,
            background: BG3,
            border: `1px solid ${BORDER}`,
            maxHeight: 180,
            overflowY: "auto",
          }}
        >
          {suggestions.map((entry, i) => (
            <div
              key={entry.address}
              onMouseDown={(e) => {
                e.preventDefault();
                select(entry);
              }}
              onMouseEnter={() => setHighlight(i)}
              style={{
                padding: "6px 10px",
                cursor: "pointer",
                background: i === highlight ? "rgba(245,166,35,0.12)" : "transparent",
              }}
            >
              <div style={{ fontSize: 10, color: "#eee", fontFamily: MONO }}>
                {entry.label}
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: DIM,
                  fontFamily: MONO,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {entry.address}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
