import type { TransactionSummary } from "../types";

type BreakdownKind = "income" | "expense" | "investment";

interface YearlyTotals {
  totalIncome: number;
  totalExpenses: number;
  netFlow: number;
}

interface Props {
  summary: TransactionSummary | null;
  yearlyTotals: YearlyTotals;
  selectedMonth: number;
  selectedYear: number;
  monthNames: string[];
  onShowBreakdown: (kind: BreakdownKind) => void;
  formatCurrency: (value: number) => string;
  formatPercent: (value: number) => string;
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
    <div className={`metric-card ${highlight ?? ""} ${onClick ? "clickable" : ""}`} onClick={onClick} role={onClick ? "button" : undefined}>
      <p className="metric-label">{label}</p>
      <p className={`metric-value ${highlight ?? ""}`}>{value}</p>
      {hint && <p className="metric-hint">{hint}</p>}
    </div>
  );
}

export function MetricsGrid({
  summary,
  yearlyTotals,
  selectedMonth,
  selectedYear,
  monthNames,
  onShowBreakdown,
  formatCurrency,
  formatPercent,
}: Props) {
  return (
    <section className="metrics-grid">
      <MetricCard
        label="Total Income"
        value={summary ? formatCurrency(summary.total_income) : "--"}
        hint="All accounts, selected month"
        highlight="positive"
        onClick={() => onShowBreakdown("income")}
      />
      <MetricCard
        label="Total Expenses"
        value={summary ? formatCurrency(Math.abs(summary.total_expenses)) : "--"}
        hint="Includes credit card payments"
        highlight="negative"
        onClick={() => onShowBreakdown("expense")}
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
        onClick={() => onShowBreakdown("investment")}
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
  );
}
