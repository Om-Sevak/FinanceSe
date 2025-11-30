import dayjs from "dayjs";
import type { Transaction } from "../types";
import { formatCurrency } from "../utils/formatters";

interface Props {
  transactions: Transaction[];
  categoryOptions: string[];
  updatingCategoryId: number | null;
  onCategoryChange: (txn: Transaction, category: string) => void;
}

export function TransactionsTable({
  transactions,
  categoryOptions,
  updatingCategoryId,
  onCategoryChange,
}: Props) {
  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Account</th>
            <th>Category</th>
            <th className="amount">Amount</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((txn) => (
            <tr key={txn.id}>
              <td>{dayjs(txn.date).format("MMM D")}</td>
              <td>{txn.description_clean ?? txn.description_raw}</td>
              <td>{txn.account?.name ?? txn.account_id}</td>
              <td className="category-cell">
                <div className="category-select-wrapper">
                  <select
                    className="category-select"
                    value={txn.category ?? ""}
                    onChange={(e) => onCategoryChange(txn, e.target.value || "Uncategorized")}
                    disabled={updatingCategoryId === txn.id}
                  >
                    <option value="">Uncategorized</option>
                    {categoryOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {updatingCategoryId === txn.id && <span className="saving-indicator">Saving…</span>}
                </div>
              </td>
              <td className={txn.amount >= 0 ? "positive" : "negative"}>
                {formatCurrency(Number(txn.amount))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
