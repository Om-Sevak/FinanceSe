import type { Account } from "../types";

type AccountId = number | "all";

interface Props {
  monthNames: string[];
  yearOptions: number[];
  selectedYear: number;
  selectedMonth: number;
  selectedAccountId: AccountId;
  accounts: Account[];
  purging: boolean;
  purgingAccounts: boolean;
  recategorizing: boolean;
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
  onAccountChange: (id: AccountId) => void;
  onPurgeAll: () => void;
  onPurgeAccounts: () => void;
  onRecategorize: () => void;
}

export function Header({
  monthNames,
  yearOptions,
  selectedYear,
  selectedMonth,
  selectedAccountId,
  accounts,
  purging,
  purgingAccounts,
  recategorizing,
  onYearChange,
  onMonthChange,
  onAccountChange,
  onPurgeAll,
  onPurgeAccounts,
  onRecategorize,
}: Props) {
  return (
    <header className="hero">
      <div>
        <p className="eyebrow">Personal Finance Command Center</p>
        <h1>Finance Dashboard</h1>
        <p className="subtitle">
          Upload monthly statements, track every account, and stay on top of your cash flow, savings rate,
          and spending trends.
        </p>
      </div>
      <div className="filters">
        <label>
          Year
          <select value={selectedYear} onChange={(e) => onYearChange(Number(e.target.value))}>
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
        <label>
          Month
          <select value={selectedMonth} onChange={(e) => onMonthChange(Number(e.target.value))}>
            {monthNames.map((month, idx) => (
              <option key={month} value={idx + 1}>
                {month}
              </option>
            ))}
          </select>
        </label>
        <label>
          Account
          <select
            value={selectedAccountId === "all" ? "all" : selectedAccountId}
            onChange={(e) => onAccountChange(e.target.value === "all" ? "all" : Number(e.target.value))}
          >
            <option value="all">All accounts</option>
            {accounts.map((acct) => (
              <option key={acct.id} value={acct.id}>
                {acct.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="dev-actions">
        <button type="button" className="dev-button" onClick={onPurgeAll} disabled={purging}>
          {purging ? "Purging..." : "DEV: Clear Transactions"}
        </button>
        <button type="button" className="dev-button danger" onClick={onPurgeAccounts} disabled={purgingAccounts}>
          {purgingAccounts ? "Deleting..." : "DEV: Clear Accounts"}
        </button>
        <button type="button" className="dev-button neutral" onClick={onRecategorize} disabled={recategorizing}>
          {recategorizing ? "Categorizing..." : "DEV: Reapply Categories"}
        </button>
      </div>
    </header>
  );
}
