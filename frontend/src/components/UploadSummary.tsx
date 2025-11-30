import dayjs from "dayjs";
import type { Transaction } from "../types";
import { formatCurrency } from "../utils/formatters";

interface Props {
  uploadPreview: Transaction[] | null;
}

export function UploadSummary({ uploadPreview }: Props) {
  return (
    <div className="card">
      <header>
        <h2>Recent Uploads</h2>
        <p>Last batch imported from statements</p>
      </header>
      {uploadPreview ? (
        <div className="upload-preview">
          <p>
            Server added {uploadPreview.length} transaction
            {uploadPreview.length === 1 ? "" : "s"}.
          </p>
          <ul>
            {uploadPreview.slice(0, 5).map((txn) => (
              <li key={txn.id}>
                <span>{dayjs(txn.date).format("MMM D")}</span>
                <span>{txn.description_clean ?? txn.description_raw}</span>
                <span className={txn.amount >= 0 ? "positive" : "negative"}>
                  {formatCurrency(Number(txn.amount))}
                </span>
              </li>
            ))}
          </ul>
          {uploadPreview.length > 5 && (
            <p className="upload-preview-note">
              Showing first 5 of {uploadPreview.length} entries.
            </p>
          )}
        </div>
      ) : (
        <p className="placeholder">No uploads yet. Use “Upload Statement” inside an account.</p>
      )}
    </div>
  );
}
