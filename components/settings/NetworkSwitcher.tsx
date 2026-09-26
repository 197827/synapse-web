'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SorobanRpc } from '@stellar/stellar-sdk';

/**
 * Typed registry of predefined Soroban RPC environments.
 * A custom endpoint can be supplied at runtime in addition to these.
 */
export interface SorobanEnvironment {
  name: string;
  rpcUrl: string;
  networkPassphrase: string;
}

export const PREDEFINED_ENVIRONMENTS: SorobanEnvironment[] = [
  {
    name: 'Testnet',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  },
  {
    name: 'Futurenet',
    rpcUrl: 'https://rpc-futurenet.stellar.org',
    networkPassphrase: 'Test SDF Future Network ; October 2022',
  },
];

export const STORAGE_KEY = 'soroban:environment';

/**
 * Read the persisted environment from localStorage, falling back to the
 * build-time env var (or Testnet) when nothing valid is stored.
 */
export function loadStoredEnvironment(): SorobanEnvironment {
  const fallback: SorobanEnvironment = {
    name: 'Testnet',
    rpcUrl:
      process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ??
      PREDEFINED_ENVIRONMENTS[0].rpcUrl,
    networkPassphrase: PREDEFINED_ENVIRONMENTS[0].networkPassphrase,
  };

  if (typeof window === 'undefined') return fallback;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<SorobanEnvironment>;
    if (parsed && parsed.rpcUrl && parsed.networkPassphrase) {
      return {
        name: parsed.name ?? 'Custom',
        rpcUrl: parsed.rpcUrl,
        networkPassphrase: parsed.networkPassphrase,
      };
    }
  } catch {
    // Ignore malformed storage and fall through to the default.
  }
  return fallback;
}

/**
 * Verify a custom endpoint is reachable and speaks Soroban RPC before we
 * commit the switch. Uses getHealth/getNetwork as a basic connectivity check.
 */
export async function validateEndpoint(
  rpcUrl: string,
): Promise<{ ok: true; networkPassphrase: string } | { ok: false; error: string }> {
  try {
    const server = new SorobanRpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });
    const network = await server.getNetwork();
    if (!network || !network.passphrase) {
      return { ok: false, error: 'Endpoint did not return a network passphrase.' };
    }
    return { ok: true, networkPassphrase: network.passphrase };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: `Could not reach Soroban RPC endpoint: ${message}` };
  }
}

interface NetworkSwitcherProps {
  /** Current active environment, if controlled by a parent provider. */
  current?: SorobanEnvironment;
  /** Called after a valid environment is selected and persisted. */
  onChange?: (environment: SorobanEnvironment) => void;
}

export default function NetworkSwitcher({ current, onChange }: NetworkSwitcherProps) {
  const [selected, setSelected] = useState<SorobanEnvironment>(
    () => current ?? loadStoredEnvironment(),
  );
  const [customUrl, setCustomUrl] = useState('');
  const [customPassphrase, setCustomPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (current) setSelected(current);
  }, [current]);

  const predefinedNames = useMemo(
    () => new Set(PREDEFINED_ENVIRONMENTS.map((env) => env.name)),
    [],
  );

  const commit = useCallback(
    (environment: SorobanEnvironment) => {
      setSelected(environment);
      setError(null);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(environment));
      } catch {
        // Persistence is best-effort; the in-memory switch still applies.
      }
      onChange?.(environment);
    },
    [onChange],
  );

  const handlePredefined = useCallback(
    (environment: SorobanEnvironment) => {
      if (environment.rpcUrl === selected.rpcUrl) return;
      commit(environment);
    },
    [commit, selected.rpcUrl],
  );

  const handleCustomSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const rpcUrl = customUrl.trim();
      if (!rpcUrl) {
        setError('Enter a custom RPC endpoint URL.');
        return;
      }

      setPending(true);
      setError(null);
      const result = await validateEndpoint(rpcUrl);
      setPending(false);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      commit({
        name: 'Custom',
        rpcUrl,
        networkPassphrase: customPassphrase.trim() || result.networkPassphrase,
      });
    },
    [commit, customPassphrase, customUrl],
  );

  return (
    <div className="network-switcher">
      <fieldset>
        <legend>Network / RPC environment</legend>
        {PREDEFINED_ENVIRONMENTS.map((environment) => (
          <label key={environment.name}>
            <input
              type="radio"
              name="soroban-environment"
              value={environment.name}
              checked={selected.rpcUrl === environment.rpcUrl}
              onChange={() => handlePredefined(environment)}
            />
            {environment.name}
          </label>
        ))}
        {!predefinedNames.has(selected.name) && (
          <p className="network-switcher__active">
            Active custom endpoint: {selected.rpcUrl}
          </p>
        )}
      </fieldset>

      <form onSubmit={handleCustomSubmit}>
        <label>
          Custom RPC endpoint
          <input
            type="url"
            placeholder="https://my-soroban-rpc.example.com"
            value={customUrl}
            onChange={(event) => setCustomUrl(event.target.value)}
          />
        </label>
        <label>
          Network passphrase (optional)
          <input
            type="text"
            placeholder="Detected automatically"
            value={customPassphrase}
            onChange={(event) => setCustomPassphrase(event.target.value)}
          />
        </label>
        <button type="submit" disabled={pending}>
          {pending ? 'Checking endpoint…' : 'Use custom endpoint'}
        </button>
      </form>

      {error && (
        <p role="alert" className="network-switcher__error">
          {error}
        </p>
      )}
    </div>
  );
}
