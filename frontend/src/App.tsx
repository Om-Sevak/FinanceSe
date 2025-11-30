import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import dayjs from "dayjs";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  createAccount,
  getExpensesByCategory,
  getMonthlySummary,
  getTransactionBreakdown,
  listAccounts,
  listTransactions,
  purgeAccounts,
  purgeTransactions,
  recategorizeTransactions,
  updateTransactionCategory,
  uploadPdfStatement,
  uploadStatement,
} from "./api";
import type {
  Account,
  AccountCreate,
  CategoryExpenseSummary,
  Transaction,
  TransactionCategoryUpdateResponse,
  TransactionSummary,
} from "./types";
import "./App.css";

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const today = dayjs();

const ACCOUNT_TYPE_OPTIONS = [
  { value: "chequing", label: "Chequing" },
  { value: "savings", label: "Savings" },
  { value: "cash", label: "Cash" },
  { value: "credit", label: "Credit Card" },
  { value: "line_of_credit", label: "Line of Credit" },
  { value: "tfsa", label: "TFSA" },
  { value: "rrsp", label: "RRSP" },
  { value: "rsp", label: "RSP" },
  { value: "resp", label: "RESP" },
  { value: "brokerage", label: "Brokerage/Investment" },
  { value: "investment", label: "Other Investment" },
  { value: "fhsa", label: "FHSA" },
  { value: "loan", label: "Loan/Mortgage" },
];

type BreakdownKind = "income" | "expense" | "investment";

const BREAKDOWN_LABELS: Record<BreakdownKind, string> = {
  income: "Total Income",
  expense: "Total Expenses",
  investment: "Total Invested",
};

function formatCurrency(value: number) {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatAccountType(value: string) {
  return (
    ACCOUNT_TYPE_OPTIONS.find((option) => option.value === value)?.label ??
    value
  );
}

export default function App() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [yearlyTransactions, setYearlyTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<TransactionSummary | null>(null);
  const [categorySummary, setCategorySummary] = useState<
    CategoryExpenseSummary[]
  >([]);
  const [selectedYear, setSelectedYear] = useState(today.year());
  const [selectedMonth, setSelectedMonth] = useState(today.month() + 1);
  const [selectedAccountId, setSelectedAccountId] = useState<number | "all">(
    "all",
  );
  const [accountForm, setAccountForm] = useState<AccountCreate>({
    name: "",
    type: "chequing",
    institution: "",
    currency: "CAD",
  });
  const [uploadAccountId, setUploadAccountId] = useState<string>("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<Transaction[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadFormat, setUploadFormat] = useState<"csv" | "pdf">("csv");
  const [purging, setPurging] = useState(false);
  const [purgingAccounts, setPurgingAccounts] = useState(false);
  const [recategorizing, setRecategorizing] = useState(false);
  const [breakdownType, setBreakdownType] = useState<BreakdownKind | null>(null);
  const [breakdownTransactions, setBreakdownTransactions] = useState<Transaction[]>([]);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatingCategoryId, setUpdatingCategoryId] = useState<number | null>(null);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);

  const yearOptions = useMemo(() => {
    const baseYear = today.year();
    return Array.from({ length: 6 }, (_, idx) => baseYear - 3 + idx);
  }, []);

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    loadMonthlyData();
  }, [selectedAccountId, selectedYear, selectedMonth]);

  useEffect(() => {
    loadDashboardData();
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    loadYearlySnapshot();
  }, [selectedYear]);

  useEffect(() => {
    if (accounts.length && !uploadAccountId) {
      setUploadAccountId(String(accounts[0].id));
    }
  }, [accounts, uploadAccountId]);
  const dailyTrend = useMemo(() => {
    const map = new Map<
      string,
      { dateKey: string; income: number; expenses: number }
    >();
    transactions.forEach((txn) => {
      const key = dayjs(txn.date).format("YYYY-MM-DD");
      const entry = map.get(key) ?? { dateKey: key, income: 0, expenses: 0 };
      if (txn.amount >= 0) {
        entry.income += Number(txn.amount);
      } else {
        entry.expenses += Math.abs(Number(txn.amount));
      }
      map.set(key, entry);
    });

    return Array.from(map.values())
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
      .map((entry) => ({
        date: dayjs(entry.dateKey).format("MMM D"),
        income: Number(entry.income.toFixed(2)),
        expenses: Number(entry.expenses.toFixed(2)),
        net: Number((entry.income - entry.expenses).toFixed(2)),
      }));
  }, [transactions]);

  const yearlySeries = useMemo(() => {
    const baseline = Array.from({ length: 12 }, (_, idx) => ({
      monthLabel: dayjs().month(idx).format("MMM"),
      income: 0,
      expenses: 0,
      net: 0,
    }));

    yearlyTransactions.forEach((txn) => {
      const monthIdx = dayjs(txn.date).month();
      const bucket = baseline[monthIdx];
      if (txn.amount >= 0) {
        bucket.income += Number(txn.amount);
      } else {
        bucket.expenses += Math.abs(Number(txn.amount));
      }
    });

    baseline.forEach((bucket) => {
      bucket.net = Number((bucket.income - bucket.expenses).toFixed(2));
      bucket.income = Number(bucket.income.toFixed(2));
      bucket.expenses = Number(bucket.expenses.toFixed(2));
    });

    return baseline;
  }, [yearlyTransactions]);

  const yearlyTotals = useMemo(() => {
    return yearlySeries.reduce(
      (acc, month) => {
        acc.totalIncome += month.income;
        acc.totalExpenses += month.expenses;
        acc.netFlow += month.net;
        return acc;
      },
      { totalIncome: 0, totalExpenses: 0, netFlow: 0 },
    );
  }, [yearlySeries]);

  const topCategories = useMemo(() => {
    return [...categorySummary]
      .map((entry) => ({
        ...entry,
        total_amount: Math.abs(entry.total_amount),
      }))
      .sort((a, b) => b.total_amount - a.total_amount)
      .slice(0, 5);
  }, [categorySummary]);

  const categoryOptions = useMemo(() => {
    const defaults = [
      "Income",
      "Groceries",
      "Restaurants",
      "Transportation",
      "Shopping",
      "Health",
      "Entertainment",
      "Utilities",
      "Rent",
      "Investment",
      "Credit Payment",
      "Uncategorized",
    ];
    const fromData = Array.from(
      new Set(
        transactions
          .map((txn) => txn.category)
          .filter((cat): cat is string => Boolean(cat)),
      ),
    );
    return Array.from(new Set([...defaults, ...fromData]));
  }, [transactions]);
  async function loadAccounts() {
    try {
      const data = await listAccounts();
      setAccounts(data);
    } catch (err) {
      console.error(err);
      setError("Unable to fetch accounts. Please ensure the API is running.");
    }
  }

  async function loadMonthlyData() {
    setLoadingTransactions(true);
    setError(null);
    try {
      const params: { year: number; month: number; account_id?: number } = {
        year: selectedYear,
        month: selectedMonth,
      };
      if (selectedAccountId !== "all") {
        params.account_id = selectedAccountId;
      }
      const data = await listTransactions(params);
      setTransactions(data);
    } catch (err) {
      console.error(err);
      setError("Unable to load transactions for the selected filters.");
    } finally {
      setLoadingTransactions(false);
    }
  }

  async function loadDashboardData() {
    setLoadingDashboard(true);
    setError(null);
    try {
      const [summaryData, categoryData] = await Promise.all([
        getMonthlySummary(selectedYear, selectedMonth),
        getExpensesByCategory(selectedYear, selectedMonth),
      ]);
      setSummary(summaryData);
      setCategorySummary(categoryData);
    } catch (err) {
      console.error(err);
      setError("Unable to load dashboard data.");
    } finally {
      setLoadingDashboard(false);
    }
  }

  async function loadYearlySnapshot() {
    try {
      const yearlyData = await listTransactions({ year: selectedYear });
      setYearlyTransactions(yearlyData);
    } catch (err) {
      console.error(err);
      setError("Unable to build yearly overview.");
    }
  }

  async function handlePurgeAll() {
    const confirmed = window.confirm(
      "This will delete every transaction in the database. Continue?",
    );
    if (!confirmed) {
      return;
    }

    setPurging(true);
    setError(null);
    try {
      await purgeTransactions();
      setTransactions([]);
      setYearlyTransactions([]);
      setSummary(null);
      setCategorySummary([]);
      setNotification("All transactions deleted.");
    } catch (err) {
      console.error(err);
      setError("Failed to clear transactions.");
    } finally {
      setPurging(false);
      loadDashboardData();
      loadMonthlyData();
      loadYearlySnapshot();
    }
  }

  async function handlePurgeAccounts() {
    const confirmed = window.confirm(
      "This will delete every account and transaction via cascading delete. Continue?",
    );
    if (!confirmed) {
      return;
    }

    setPurgingAccounts(true);
    setError(null);
    try {
      await purgeAccounts();
      setAccounts([]);
      setTransactions([]);
      setYearlyTransactions([]);
      setSummary(null);
      setCategorySummary([]);
      setNotification("All accounts deleted.");
    } catch (err) {
      console.error(err);
      setError("Failed to clear accounts.");
    } finally {
      setPurgingAccounts(false);
    }
  }

  async function handleRecategorize() {
    const confirmed = window.confirm(
      "Re-run categorization for every transaction?",
    );
    if (!confirmed) {
      return;
    }
    setRecategorizing(true);
    setError(null);
    try {
      const { updated, total } = await recategorizeTransactions();
      setNotification(`Updated ${updated} of ${total} transactions.`);
      await loadMonthlyData();
      await loadDashboardData();
      await loadYearlySnapshot();
    } catch (err) {
      console.error(err);
      setError("Failed to re-categorize transactions.");
    } finally {
      setRecategorizing(false);
    }
  }

  async function handleShowBreakdown(kind: BreakdownKind) {
    setBreakdownType(kind);
    setBreakdownTransactions([]);
    setBreakdownLoading(true);
    try {
      const data = await getTransactionBreakdown(kind, selectedYear, selectedMonth);
      setBreakdownTransactions(data);
    } catch (err) {
      console.error(err);
      setError("Unable to load breakdown details.");
    } finally {
      setBreakdownLoading(false);
    }
  }

  function closeBreakdown() {
    setBreakdownType(null);
    setBreakdownTransactions([]);
    setBreakdownLoading(false);
  }

  async function handleAccountSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createAccount(accountForm);
      setAccountForm({
        name: "",
        type: "",
        institution: "",
        currency: accountForm.currency,
      });
      setNotification("Account added successfully.");
      loadAccounts();
      setShowAccountModal(false);
    } catch (err) {
      console.error(err);
      setError("Failed to create account.");
    }
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!uploadAccountId || !uploadFile) {
      setError("Choose both an account and a statement file.");
      return;
    }

    setUploading(true);
    try {
      const created =
        uploadFormat === "pdf"
          ? await uploadPdfStatement(Number(uploadAccountId), uploadFile)
          : await uploadStatement(Number(uploadAccountId), uploadFile);
      setUploadFile(null);
      event.currentTarget.reset();
      setUploadPreview(created);
      setNotification(
        `Uploaded ${created.length} transaction${created.length === 1 ? "" : "s"}.`,
      );
      await Promise.all([loadMonthlyData(), loadDashboardData(), loadYearlySnapshot()]);
      setShowUploadModal(false);
    } catch (err) {
      console.error(err);
      setError("Failed to upload the statement. Double check the format.");
      setUploadPreview(null);
    } finally {
      setUploading(false);
    }
  }

  async function handleCategoryUpdate(txn: Transaction, nextCategory: string) {
    setUpdatingCategoryId(txn.id);
    setError(null);
    try {
      const payload = { category: nextCategory || "Uncategorized", retrain: true };
      const response: TransactionCategoryUpdateResponse =
        await updateTransactionCategory(txn.id, payload);
      setTransactions((prev) =>
        prev.map((item) => (item.id === txn.id ? response.transaction : item)),
      );
      if (response.training?.trained) {
        setNotification(
          `Category updated and model retrained on ${response.training.samples} samples.`,
        );
      } else {
        setNotification("Category updated.");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to update category.");
    } finally {
      setUpdatingCategoryId(null);
    }
  }

  function MetricCard({
    label,
    value,
    hint,
    highlight,
    onClick,
  }: {
    label: string;
    value: string;
    hint?: string;
    highlight?: "positive" | "negative";
    onClick?: () => void;
  }) {
    return (
      <div
        className={`metric-card ${highlight ?? ""} ${onClick ? "clickable" : ""}`}
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
      >
        <p className="metric-label">{label}</p>
        <p className={`metric-value ${highlight ?? ""}`}>{value}</p>
        {hint && <p className="metric-hint">{hint}</p>}
      </div>
    );
  }
  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Personal Finance Command Center</p>
          <h1>Finance Dashboard</h1>
          <p className="subtitle">
            Upload monthly statements, track every account, and stay on top of
            your cash flow, savings rate, and spending trends.
          </p>
        </div>
        <div className="filters">
          <label>
            Year
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label>
            Month
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
            >
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
              onChange={(e) =>
                setSelectedAccountId(
                  e.target.value === "all" ? "all" : Number(e.target.value),
                )
              }
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
          <button
            type="button"
            className="dev-button"
            onClick={handlePurgeAll}
            disabled={purging}
          >
            {purging ? "Purging..." : "DEV: Clear Transactions"}
          </button>
          <button
            type="button"
            className="dev-button danger"
            onClick={handlePurgeAccounts}
            disabled={purgingAccounts}
          >
            {purgingAccounts ? "Deleting..." : "DEV: Clear Accounts"}
          </button>
          <button
            type="button"
            className="dev-button neutral"
            onClick={handleRecategorize}
            disabled={recategorizing}
          >
            {recategorizing ? "Categorizing..." : "DEV: Reapply Categories"}
          </button>
        </div>
      </header>

      {notification && (
        <div className="toast success" onAnimationEnd={() => setNotification(null)}>
          {notification}
        </div>
      )}
      {error && (
        <div className="toast error" onAnimationEnd={() => setError(null)}>
          {error}
        </div>
      )}

      <section className="metrics-grid">
        <MetricCard
          label="Total Income"
          value={summary ? formatCurrency(summary.total_income) : "--"}
          hint="All accounts, selected month"
          highlight="positive"
          onClick={() => handleShowBreakdown("income")}
        />
        <MetricCard
          label="Total Expenses"
          value={
            summary ? formatCurrency(Math.abs(summary.total_expenses)) : "--"
          }
          hint="Includes credit card payments"
          highlight="negative"
          onClick={() => handleShowBreakdown("expense")}
        />
        <MetricCard
          label="Net Cash Flow"
          value={summary ? formatCurrency(summary.net_flow) : "--"}
          hint="Income + Expenses"
          highlight={summary && summary.net_flow >= 0 ? "positive" : "negative"}
        />
        <MetricCard
          label="Savings Rate"
          value={summary ? formatPercent(summary.savings_rate) : "--"}
          hint="(Income - Expenses) / Income"
        />
        <MetricCard
          label="Total Invested"
          value={summary ? formatCurrency(summary.total_invested) : "--"}
          hint="Categorized as Investment"
          highlight="positive"
          onClick={() => handleShowBreakdown("investment")}
        />
        <MetricCard
          label="Net Worth (approx.)"
          value={summary ? formatCurrency(summary.net_worth) : "--"}
          hint="Running total of all transactions"
        />
        <MetricCard
          label="Year-To-Date Net Flow"
          value={formatCurrency(yearlyTotals.netFlow)}
          hint={`Jan-${monthNames[selectedMonth - 1].slice(0, 3)} ${selectedYear}`}
          highlight={yearlyTotals.netFlow >= 0 ? "positive" : "negative"}
        />
      </section>

      <section className="charts-grid">
        <div className="card">
          <header>
            <h2>Daily Net Flow</h2>
            <p>Income vs expenses for the selected month</p>
          </header>
          {loadingTransactions ? (
            <p className="placeholder">Loading transactions...</p>
          ) : dailyTrend.length === 0 ? (
            <p className="placeholder">No transactions recorded.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="income"
                  stroke="#16a34a"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="expenses"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="net"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <header>
            <h2>Expenses by Category</h2>
            <p>Top categories for the selected month</p>
          </header>
          {loadingDashboard ? (
            <p className="placeholder">Loading categories...</p>
          ) : categorySummary.length === 0 ? (
            <p className="placeholder">No categorized expenses.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={categorySummary.map((entry) => ({
                  ...entry,
                  amount: Math.abs(entry.total_amount),
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="amount" fill="#f97316" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="charts-grid">
        <div className="card">
          <header>
            <h2>Yearly Momentum</h2>
            <p>{selectedYear} income, expenses, and net by month</p>
          </header>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={yearlySeries}>
              <defs>
                <linearGradient id="netGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="monthLabel" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="income" stackId="1" stroke="#16a34a" fill="#16a34a20" />
              <Area type="monotone" dataKey="expenses" stackId="1" stroke="#ef4444" fill="#ef444420" />
              <Area type="monotone" dataKey="net" stroke="#2563eb" fill="url(#netGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card yearly-card">
          <header>
            <h2>Year-To-Date Insights</h2>
            <p>Totals across every account</p>
          </header>
          <ul>
            <li>
              <span>Total Income</span>
              <strong>{formatCurrency(yearlyTotals.totalIncome)}</strong>
            </li>
            <li>
              <span>Total Expenses</span>
              <strong>{formatCurrency(yearlyTotals.totalExpenses)}</strong>
            </li>
            <li>
              <span>Net Flow</span>
              <strong className={yearlyTotals.netFlow >= 0 ? "positive" : "negative"}>
                {formatCurrency(yearlyTotals.netFlow)}
              </strong>
            </li>
          </ul>
          <div className="top-categories">
            <p>Top categories this month</p>
            <ol>
              {topCategories.map((entry) => (
                <li key={entry.category}>
                  <span>{entry.category}</span>
                  <span>{formatCurrency(entry.total_amount)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="two-column">
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
                      onClick={() => {
                        setUploadAccountId(String(acct.id));
                        setShowUploadModal(true);
                      }}
                    >
                      Upload Statement
                    </button>
                  </div>
                  <span>{acct.currency}</span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="action-button" onClick={() => setShowAccountModal(true)}>
            Add Account
          </button>
        </div>

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
      </section>
      <section className="card">
        <header>
          <h2>Latest Transactions</h2>
          <p>Showing entries for the selected filters</p>
        </header>
        {loadingTransactions ? (
          <p className="placeholder">Loading transactions...</p>
        ) : transactions.length === 0 ? (
          <p className="placeholder">No transactions available.</p>
        ) : (
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
                          onChange={(e) =>
                            handleCategoryUpdate(txn, e.target.value || "Uncategorized")
                          }
                          disabled={updatingCategoryId === txn.id}
                        >
                          <option value="">Uncategorized</option>
                          {categoryOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        {updatingCategoryId === txn.id && (
                          <span className="saving-indicator">Saving…</span>
                        )}
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
        )}
      </section>

      {showAccountModal && (
        <div className="modal-backdrop" onClick={() => setShowAccountModal(false)}>
          <div
            className="modal"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <header>
              <h3>Add Account</h3>
              <button type="button" className="close-button" onClick={() => setShowAccountModal(false)}>
                Close
              </button>
            </header>
            <form
              className="stack"
              onSubmit={(event) => {
                handleAccountSubmit(event);
              }}
            >
              <div className="grid-2">
                <label>
                  Name
                  <input
                    value={accountForm.name}
                    onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Type
                  <select
                    value={accountForm.type}
                    onChange={(e) => setAccountForm({ ...accountForm, type: e.target.value })}
                    required
                  >
                    {ACCOUNT_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid-2">
                <label>
                  Institution
                  <input
                    value={accountForm.institution}
                    onChange={(e) =>
                      setAccountForm({
                        ...accountForm,
                        institution: e.target.value,
                      })
                    }
                    required
                  />
                </label>
                <label>
                  Currency
                  <input
                    value={accountForm.currency}
                    onChange={(e) => setAccountForm({ ...accountForm, currency: e.target.value })}
                    required
                  />
                </label>
              </div>
              <button type="submit" className="action-button">
                Save account
              </button>
            </form>
          </div>
        </div>
      )}

      {showUploadModal && (
        <div className="modal-backdrop" onClick={() => setShowUploadModal(false)}>
          <div
            className="modal"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <header>
              <h3>Upload Statement</h3>
              <button type="button" className="close-button" onClick={() => setShowUploadModal(false)}>
                Close
              </button>
            </header>
            <form
              className="stack"
              onSubmit={(event) => {
                handleUpload(event);
              }}
            >
              <label>
                Account
                <select
                  value={uploadAccountId}
                  onChange={(e) => setUploadAccountId(e.target.value)}
                  required
                >
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
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
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
                    onChange={() => setUploadFormat("csv")}
                  />
                  CSV
                </label>
                <label>
                  <input
                    type="radio"
                    name="upload-format"
                    value="pdf"
                    checked={uploadFormat === "pdf"}
                    onChange={() => setUploadFormat("pdf")}
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
      )}

      {breakdownType && (
        <div className="modal-backdrop" onClick={closeBreakdown}>
          <div
            className="modal"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <header>
              <h3>{BREAKDOWN_LABELS[breakdownType]}</h3>
              <button type="button" className="close-button" onClick={closeBreakdown}>
                Close
              </button>
            </header>
            <p>
              {monthNames[selectedMonth - 1]} {selectedYear} -{" "}
              {breakdownTransactions.length} transactions
            </p>
            {breakdownLoading ? (
              <p className="placeholder">Loading breakdown...</p>
            ) : breakdownTransactions.length === 0 ? (
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
                    {breakdownTransactions.map((txn) => (
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
      )}
    </div>
  );
}
