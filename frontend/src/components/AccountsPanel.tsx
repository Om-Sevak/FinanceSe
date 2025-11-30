import type { Account } from "../types";
import { formatAccountType } from "../utils/formatters";

interface Props {
  accounts: Account[];
  onAddAccount: () => void;
  onUpload: (accountId: number) => void;
}

export function AccountsPanel({ accounts, onAddAccount, onUpload }: Props) {
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
              </div>
              <span>{acct.currency}</span>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="action-button" onClick={onAddAccount}>
        Add Account
      </button>
    </div>
  );
}
