"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  createSorobanEventPoller,
  type NormalizedSorobanEvent,
  type RpcHealth,
  type SorobanEventPoller,
} from "./events";
import {
  getStoredContractId,
  storeSelectedContractId,
  clearSelectedContractId,
  getStoredContracts,
  storeContracts,
  getDefaultContractId,
  type DeployedContract,
} from "./contractSelection";

export interface SorobanContextValue {
  contractId: string | undefined;
  setContractId: (id: string | undefined) => void;
  availableContracts: DeployedContract[];
  addContract: (contract: DeployedContract) => void;
  removeContract: (id: string) => void;
  events: NormalizedSorobanEvent[];
  health: RpcHealth;
  poller: SorobanEventPoller | null;
}

const SorobanContext = createContext<SorobanContextValue>({
  contractId: undefined,
  setContractId: () => {},
  availableContracts: [],
  addContract: () => {},
  removeContract: () => {},
  events: [],
  health: { connected: false, lastCheck: 0, lastEventTimestamp: null, error: null },
  poller: null,
});

export function useSoroban() {
  return useContext(SorobanContext);
}

export interface SorobanProviderProps {
  children: ReactNode;
  rpcUrl?: string;
  contractId?: string;
  defaultContractId?: string;
}

export function SorobanProvider({
  children,
  rpcUrl,
  contractId: propContractId,
  defaultContractId,
}: SorobanProviderProps) {
  const [activeContractId, setActiveContractId] = useState<string | undefined>(() => {
    if (propContractId !== undefined) return propContractId;
    const stored = getStoredContractId();
    if (stored !== undefined) return stored;
    return defaultContractId ?? getDefaultContractId();
  });

  const [availableContracts, setAvailableContracts] = useState<DeployedContract[]>(() => {
    return getStoredContracts();
  });

  const [events, setEvents] = useState<NormalizedSorobanEvent[]>([]);
  const [health, setHealth] = useState<RpcHealth>({
    connected: false,
    lastCheck: 0,
    lastEventTimestamp: null,
    error: null,
  });
  const [poller, setPoller] = useState<SorobanEventPoller | null>(null);

  // Sync if propContractId is explicitly passed and changes
  useEffect(() => {
    if (propContractId !== undefined) {
      setActiveContractId(propContractId);
    }
  }, [propContractId]);

  const setContractId = useCallback((id: string | undefined) => {
    const trimmed = id?.trim() || undefined;
    setActiveContractId(trimmed);
    if (trimmed) {
      storeSelectedContractId(trimmed);
    } else {
      clearSelectedContractId();
    }
  }, []);

  const addContract = useCallback((contract: DeployedContract) => {
    setAvailableContracts((prev) => {
      const existing = prev.find((c) => c.id === contract.id);
      let updated: DeployedContract[];
      if (existing) {
        updated = prev.map((c) => (c.id === contract.id ? { ...c, ...contract } : c));
      } else {
        updated = [...prev, { ...contract, isCustom: true }];
      }
      storeContracts(updated);
      return updated;
    });
  }, []);

  const removeContract = useCallback(
    (id: string) => {
      setAvailableContracts((prev) => {
        const updated = prev.filter((c) => c.id !== id);
        storeContracts(updated);
        return updated;
      });

      if (activeContractId === id) {
        const fallback = getDefaultContractId();
        setContractId(fallback);
      }
    },
    [activeContractId, setContractId]
  );

  // Tear down and re-establish the poller cleanly on contractId / rpcUrl change
  useEffect(() => {
    // Clear previous events and health to prevent stale leakage
    setEvents([]);
    setHealth({
      connected: false,
      lastCheck: 0,
      lastEventTimestamp: null,
      error: null,
    });

    const newPoller = createSorobanEventPoller(rpcUrl, activeContractId);
    setPoller(newPoller);

    const unsubHealth = newPoller.onHealth(setHealth);
    const unsubEvents = newPoller.onEvents((newEvents) => {
      setEvents((prev) => {
        const combined = [...newEvents, ...prev];
        return combined.slice(0, 200);
      });
    });

    newPoller.start();

    return () => {
      newPoller.stop();
      unsubHealth();
      unsubEvents();
    };
  }, [rpcUrl, activeContractId]);

  // Pause adaptive polling while the tab is hidden and resume with an
  // immediate catch-up poll on visibility return so no events are missed.
  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        poller.pause();
      } else {
        poller.resume();
      }
    };

    handleVisibilityChange();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [poller]);

  return (
    <SorobanContext.Provider
      value={{
        contractId: activeContractId,
        setContractId,
        availableContracts,
        addContract,
        removeContract,
        events,
        health,
        poller,
      }}
    >
      {children}
    </SorobanContext.Provider>
  );
}

export function useSorobanEvents() {
  return useSoroban().events;
}

export function useSorobanHealth() {
  return useSoroban().health;
}

export function useContractSelection() {
  const { contractId, setContractId, availableContracts, addContract, removeContract } =
    useSoroban();
  return { contractId, setContractId, availableContracts, addContract, removeContract };
}
