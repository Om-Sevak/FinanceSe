import type { Account } from "../types";
import { formatAccountType } from "../utils/formatters";
import { PlaidConnectButton } from "./PlaidConnectButton";

interface Props {
  accounts: Account[];
  onAddAccount: () => void;
  onUpload: (accountId: number) => void;
  onSync: (accountId: number) => void;
  onAccountsConnected: (accounts: Account[]) => void;
  onError?: (message: string) => void;
  syncingAccountId?: number | null;
}

export function AccountsPanel({
  accounts,
  onAddAccount,
  onUpload,
  onSync,
  onAccountsConnected,
  onError,
  syncingAccountId,
}: Props) {
  return (
    <div className="card">
      <header>
        <h2>Accounts</h2>
        <p>Bank accounts, credit cards, investment vehicles</p>
      </header>
      {accounts.length === 0 ? (
        <p className="placeholder">No accounts yet. Add one below.</p>
      ) : (
        <ul className="account-list">
          {accounts.map((acct) => (
            <li key={acct.id}>
              <div>
                <strong>{acct.name}</strong>
                <p>
                  {formatAccountType(acct.type)} - {acct.institution}
                </p>
                <button
                  type="button"
                  className="link-button subtle"
                  onClick={() => onUpload(acct.id)}
                >
                  Upload Statement
                </button>
                {acct.plaid_account_id && (
                  <button
                    type="button"
                    className="link-button subtle"
                    onClick={() => onSync(acct.id)}
                    disabled={syncingAccountId === acct.id}
                  >
                    {syncingAccountId === acct.id ? "Syncing..." : "Sync"}
                  </button>
                )}
              </div>
              <span>{acct.currency}</span>
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <button type="button" className="action-button" onClick={onAddAccount}>
          Add Account
        </button>
        <PlaidConnectButton
          onAccountsConnected={onAccountsConnected}
          onError={onError}
        />
      </div>
    </div>
  );
}
