import dayjs from "dayjs";
import type { Account, Transaction } from "../types";
import { formatCurrency } from "../utils/formatters";

export function AccountModal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <header>
          <h3>Add Account</h3>
          <button type="button" className="close-button" onClick={onClose}>
            Close
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  uploadAccountId: string;
  uploadFormat: "csv" | "pdf";
  uploading: boolean;
  onAccountChange: (value: string) => void;
  onFormatChange: (value: "csv" | "pdf") => void;
  onFileChange: (file: File | null) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

export function UploadModal({
  open,
  onClose,
  accounts,
  uploadAccountId,
  uploadFormat,
  uploading,
  onAccountChange,
  onFormatChange,
  onFileChange,
  onSubmit,
}: UploadModalProps) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <header>
          <h3>Upload Statement</h3>
          <button type="button" className="close-button" onClick={onClose}>
            Close
          </button>
        </header>
        <form className="stack" onSubmit={onSubmit}>
          <label>
            Account
            <select value={uploadAccountId} onChange={(e) => onAccountChange(e.target.value)} required>
              <option value="" disabled>
                Choose account
              </option>
              {accounts.map((acct) => (
                <option key={acct.id} value={acct.id}>
                  {acct.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {uploadFormat === "pdf" ? "PDF Statement" : "CSV File"}
            <input
              type="file"
              accept={uploadFormat === "pdf" ? "application/pdf,.pdf" : ".csv,text/csv"}
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
              required
            />
          </label>
          <div className="format-toggle">
            <label>
              <input
                type="radio"
                name="upload-format"
                value="csv"
                checked={uploadFormat === "csv"}
                onChange={() => onFormatChange("csv")}
              />
              CSV
            </label>
            <label>
              <input
                type="radio"
                name="upload-format"
                value="pdf"
                checked={uploadFormat === "pdf"}
                onChange={() => onFormatChange("pdf")}
              />
              PDF
            </label>
          </div>
          <button type="submit" className="action-button" disabled={uploading}>
            {uploading ? "Uploading..." : "Upload & categorize"}
          </button>
          {uploading && <p className="uploading-indicator">Processing file...</p>}
        </form>
      </div>
    </div>
  );
}

interface BreakdownModalProps {
  open: boolean;
  onClose: () => void;
  monthLabel: string;
  year: number;
  transactions: Transaction[];
  loading: boolean;
  label: string;
}

export function BreakdownModal({
  open,
  onClose,
  monthLabel,
  year,
  transactions,
  loading,
  label,
}: BreakdownModalProps) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <header>
          <h3>{label}</h3>
          <button type="button" className="close-button" onClick={onClose}>
            Close
          </button>
        </header>
        <p>
          {monthLabel} {year} — {transactions.length} transactions
        </p>
        {loading ? (
          <p className="placeholder">Loading breakdown...</p>
        ) : transactions.length === 0 ? (
          <p className="placeholder">No transactions matched.</p>
        ) : (
          <div className="table-wrapper modal-table">
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
                    <td>{txn.category ?? "Uncategorized"}</td>
                    <td className={txn.amount >= 0 ? "positive" : "negative"}>
                      {formatCurrency(Number(txn.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
