import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { createLinkToken, exchangeToken } from "../api";
import type { Account } from "../types";

interface Props {
  onAccountsConnected: (accounts: Account[]) => void;
  onError?: (message: string) => void;
}

export function PlaidConnectButton({ onAccountsConnected, onError }: Props) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    createLinkToken()
      .then((res) => setLinkToken(res.link_token))
      .catch(() => {
        // Plaid not configured on this server — hide button silently
        setLinkToken(null);
      });
  }, []);

  const onSuccess = useCallback(
    async (
      publicToken: string,
      metadata: { institution?: { name?: string } | null },
    ) => {
      setConnecting(true);
      try {
        const accounts = await exchangeToken(
          publicToken,
          metadata?.institution?.name ?? "Connected Bank",
        );
        onAccountsConnected(accounts);
      } catch {
        onError?.("Failed to connect bank account.");
      } finally {
        setConnecting(false);
      }
    },
    [onAccountsConnected, onError],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken ?? "",
    onSuccess,
  });

  if (!linkToken) return null;

  return (
    <button
      type="button"
      className="action-button"
      onClick={() => open()}
      disabled={!ready || connecting}
    >
      {connecting ? "Connecting..." : "Connect Bank"}
    </button>
  );
}
