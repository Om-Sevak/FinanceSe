import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import dayjs from "dayjs";
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
  registerUser,
  loginUser,
  getCurrentUser,
  setAuthToken,
} from "./api";
import type {
  Account,
  AccountCreate,
  CategoryExpenseSummary,
  Transaction,
  TransactionCategoryUpdateResponse,
  TransactionSummary,
  User,
} from "./types";
import { Header } from "./components/Header";
import { MetricsGrid } from "./components/MetricsGrid";
import { ChartsSection } from "./components/ChartsSection";
import { AccountsPanel } from "./components/AccountsPanel";
import { TransactionsTable } from "./components/TransactionsTable";
import { Tabs } from "./components/Tabs";
import { AccountModal, BreakdownModal, UploadModal } from "./components/Modals";
import { formatCurrency, formatPercent } from "./utils/formatters";
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

type DailyPoint = {
  date: string;
  income: number;
  expenses: number;
  net: number;
};

type YearlyPoint = {
  monthLabel: string;
  income: number;
  expenses: number;
  net: number;
};

export default function App() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [yearlyTransactions, setYearlyTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<TransactionSummary | null>(null);
  const [categorySummary, setCategorySummary] = useState<CategoryExpenseSummary[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | "all">(today.year());
  const [selectedMonth, setSelectedMonth] = useState<number | "all">(today.month() + 1);
  const [selectedAccountId, setSelectedAccountId] = useState<number | "all">("all");
  const [accountForm, setAccountForm] = useState<AccountCreate>({
    name: "",
    type: "chequing",
    institution: "",
    currency: "CAD",
  });
  const [uploadAccountId, setUploadAccountId] = useState<string>("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadFormat, setUploadFormat] = useState<"csv" | "pdf">("csv");
  const [uploadFolderMode, setUploadFolderMode] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgingAccounts, setPurgingAccounts] = useState(false);
  const [recategorizing, setRecategorizing] = useState(false);
  const [activeTab, setActiveTab] = useState<"metrics" | "accounts" | "transactions">("metrics");
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
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
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const yearOptions = useMemo(() => {
    const baseYear = today.year();
    return Array.from({ length: 6 }, (_, idx) => baseYear - 3 + idx);
  }, []);

  useEffect(() => {
    // hydrate token and user from storage
    const stored = localStorage.getItem("auth_token");
    if (stored) {
      setAuthToken(stored);
      getCurrentUser()
        .then((me) => setUser(me))
        .catch(() => {
          localStorage.removeItem("auth_token");
          setAuthToken(null);
        })
        .finally(() => setAuthLoading(false));
    } else {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadAccounts();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadMonthlyData();
  }, [user, selectedAccountId, selectedYear, selectedMonth]);

  useEffect(() => {
    if (!user) return;
    loadDashboardData();
  }, [user, selectedYear, selectedMonth]);

  useEffect(() => {
    if (!user) return;
    loadYearlySnapshot();
  }, [user, selectedYear]);

  useEffect(() => {
    if (!user) return;
    if (accounts.length && !uploadAccountId) {
      setUploadAccountId(String(accounts[0].id));
    }
  }, [accounts, uploadAccountId, user]);

  const dailyTrend: DailyPoint[] = useMemo(() => {
    const map = new Map<string, { dateKey: string; income: number; expenses: number }>();
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

  const yearlySeries: YearlyPoint[] = useMemo(() => {
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
    const totals = yearlySeries.reduce(
      (acc, month) => {
        acc.totalIncome += month.income;
        acc.totalExpenses += month.expenses;
        acc.netFlow += month.net;
        return acc;
      },
      { totalIncome: 0, totalExpenses: 0, netFlow: 0, totalInvested: 0 },
    );

    yearlyTransactions.forEach((txn) => {
      if ((txn.category || "").toLowerCase() === "investment") {
        totals.totalInvested += Math.abs(Number(txn.amount));
      }
    });

    totals.totalIncome = Number(totals.totalIncome.toFixed(2));
    totals.totalExpenses = Number(totals.totalExpenses.toFixed(2));
    totals.netFlow = Number(totals.netFlow.toFixed(2));
    totals.totalInvested = Number(totals.totalInvested.toFixed(2));
    return totals;
  }, [yearlySeries, yearlyTransactions]);

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
      const params: { year?: number; month?: number; account_id?: number } = {};
      if (selectedYear !== "all") params.year = selectedYear;
      if (selectedMonth !== "all") params.month = selectedMonth;
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
        getMonthlySummary(selectedYear === "all" ? undefined : selectedYear, selectedMonth === "all" ? undefined : selectedMonth),
        getExpensesByCategory(selectedYear === "all" ? undefined : selectedYear, selectedMonth === "all" ? undefined : selectedMonth),
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
      const params: { year?: number } = {};
      if (selectedYear !== "all") params.year = selectedYear;
      const yearlyData = await listTransactions(params);
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
    if (!confirmed) return;

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
    if (!confirmed) return;

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
    const confirmed = window.confirm("Re-run categorization for every transaction?");
    if (!confirmed) return;
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
      const data = await getTransactionBreakdown(
        kind,
        selectedYear === "all" ? undefined : selectedYear,
        selectedMonth === "all" ? undefined : selectedMonth,
      );
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
    if (!uploadAccountId || uploadFiles.length === 0) {
      setError("Choose both an account and at least one statement file.");
      return;
    }

    setUploading(true);
    try {
      let totalCreated = 0;
      for (const file of uploadFiles) {
        const created =
          uploadFormat === "pdf"
            ? await uploadPdfStatement(Number(uploadAccountId), file)
            : await uploadStatement(Number(uploadAccountId), file);
        totalCreated += created.length;
      }
      setUploadFiles([]);
      event.currentTarget.reset();
      setNotification(`Uploaded ${totalCreated} transaction${totalCreated === 1 ? "" : "s"} from ${uploadFiles.length} file${uploadFiles.length === 1 ? "" : "s"}.`);
      await Promise.all([loadMonthlyData(), loadDashboardData(), loadYearlySnapshot()]);
      setShowUploadModal(false);
    } catch (err) {
      console.error(err);
      setError("Failed to upload the statement. Double check the format.");
    } finally {
      setUploading(false);
    }
  }

  async function handleCategoryUpdate(txn: Transaction, nextCategory: string) {
    setUpdatingCategoryId(txn.id);
    setError(null);
    try {
      const payload = { category: nextCategory || "Uncategorized" };
      const response: TransactionCategoryUpdateResponse = await updateTransactionCategory(txn.id, payload);
      setTransactions((prev) => prev.map((item) => (item.id === txn.id ? response.transaction : item)));
      if (response.training?.trained) {
        setNotification(`Category updated and model retrained on ${response.training.samples} samples.`);
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

  async function loadAllData() {
    await Promise.all([loadAccounts(), loadMonthlyData(), loadDashboardData(), loadYearlySnapshot()]);
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setAuthSubmitting(true);
    try {
      if (authMode === "signup") {
        await registerUser(authForm);
      }
      const tokenResponse = await loginUser({ email: authForm.email, password: authForm.password });
      localStorage.setItem("auth_token", tokenResponse.access_token);
      setAuthToken(tokenResponse.access_token);
      const me = await getCurrentUser();
      setUser(me);
      await loadAllData();
    } catch (err) {
      console.error(err);
      setError("Authentication failed. Check your credentials.");
    } finally {
      setAuthSubmitting(false);
      setAuthLoading(false);
    }
  }

  if (authLoading) {
    return (
      <div className="app-shell">
        <p className="placeholder">Checking session...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-shell auth-shell">
        <div className="card auth-card">
          <header>
            <h2>{authMode === "login" ? "Welcome back" : "Create your account"}</h2>
            <p>{authMode === "login" ? "Sign in to your dashboard" : "Set up your profile to get started"}</p>
          </header>
          <div className="auth-toggle">
            <button
              className={`tab-button ${authMode === "login" ? "active" : ""}`}
              onClick={() => setAuthMode("login")}
            >
              Login
            </button>
            <button
              className={`tab-button ${authMode === "signup" ? "active" : ""}`}
              onClick={() => setAuthMode("signup")}
            >
              Sign Up
            </button>
          </div>
          <form className="stack" onSubmit={handleAuthSubmit}>
            {authMode === "signup" && (
              <label>
                Name
                <input
                  value={authForm.name}
                  onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                  required
                />
              </label>
            )}
            <label>
              Email
              <input
                type="email"
                value={authForm.email}
                onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={authForm.password}
                onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                required
              />
            </label>
            <button className="action-button" type="submit" disabled={authSubmitting}>
              {authSubmitting ? "Working..." : authMode === "login" ? "Login" : "Sign Up"}
            </button>
          </form>
          {error && <p className="toast error">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Header
        monthNames={monthNames}
        yearOptions={yearOptions}
        selectedYear={selectedYear}
        selectedMonth={selectedMonth}
        selectedAccountId={selectedAccountId}
        accounts={accounts}
        purging={purging}
        purgingAccounts={purgingAccounts}
        recategorizing={recategorizing}
        onYearChange={setSelectedYear}
        onMonthChange={setSelectedMonth}
        onAccountChange={setSelectedAccountId}
        onPurgeAll={handlePurgeAll}
        onPurgeAccounts={handlePurgeAccounts}
        onRecategorize={handleRecategorize}
      />

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

      <MetricsGrid
        summary={summary}
        yearlyTotals={yearlyTotals}
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
        monthNames={monthNames}
        onShowBreakdown={handleShowBreakdown}
        formatCurrency={formatCurrency}
        formatPercent={formatPercent}
      />

      <Tabs
        tabs={[
          {
            id: "metrics",
            label: "Key Metrics",
            content: (
              <ChartsSection
                dailyTrend={dailyTrend}
                yearlySeries={yearlySeries}
                categorySummary={categorySummary}
                loadingTransactions={loadingTransactions}
                loadingDashboard={loadingDashboard}
                summary={summary}
              />
            ),
          },
          {
            id: "accounts",
            label: "Accounts",
            content: (
              <section className="card">
                <AccountsPanel
                  accounts={accounts}
                  onAddAccount={() => setShowAccountModal(true)}
                  onUpload={(id) => {
                    setUploadAccountId(String(id));
                    setShowUploadModal(true);
                  }}
                />
              </section>
            ),
          },
          {
            id: "transactions",
            label: "Transactions",
            content: (
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
                  <TransactionsTable
                    transactions={transactions}
                    categoryOptions={categoryOptions}
                    updatingCategoryId={updatingCategoryId}
                    onCategoryChange={(txn, category) => handleCategoryUpdate(txn, category)}
                  />
                )}
              </section>
            ),
          },
        ]}
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
      />

      <AccountModal open={showAccountModal} onClose={() => setShowAccountModal(false)}>
        <form className="stack" onSubmit={handleAccountSubmit}>
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
      </AccountModal>

      <UploadModal
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        accounts={accounts}
        uploadAccountId={uploadAccountId}
        uploadFormat={uploadFormat}
        uploadFolderMode={uploadFolderMode}
        uploading={uploading}
        onAccountChange={setUploadAccountId}
        onFormatChange={setUploadFormat}
        onFolderModeChange={setUploadFolderMode}
        onFileChange={setUploadFiles}
        onSubmit={handleUpload}
      />

      <BreakdownModal
        open={Boolean(breakdownType)}
        onClose={closeBreakdown}
        monthLabel={selectedMonth === "all" ? "All months" : monthNames[(selectedMonth as number) - 1]}
        year={selectedYear}
        transactions={breakdownTransactions}
        loading={breakdownLoading}
        label={
          breakdownType === "income"
            ? "Total Income"
            : breakdownType === "expense"
              ? "Total Expenses"
              : "Total Invested"
        }
      />
    </div>
  );
}
