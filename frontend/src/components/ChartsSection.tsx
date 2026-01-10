import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CategoryExpenseSummary, TransactionSummary } from "../types";

interface DailyPoint {
  date: string;
  income: number;
  expenses: number;
  net: number;
}

interface YearlyPoint {
  monthLabel: string;
  income: number;
  expenses: number;
  net: number;
}

interface Props {
  dailyTrend: DailyPoint[];
  yearlySeries: YearlyPoint[];
  categorySummary: CategoryExpenseSummary[];
  loadingTransactions: boolean;
  loadingDashboard: boolean;
  summary: TransactionSummary | null;
}

export function ChartsSection({
  dailyTrend,
  yearlySeries,
  categorySummary,
  loadingTransactions,
  loadingDashboard,
  summary,
}: Props) {
  const RADIAN = Math.PI / 180;
  const sliceColors = [
    "#ef4444",
    "#f97316",
    "#facc15",
    "#22c55e",
    "#14b8a6",
    "#0ea5e9",
    "#6366f1",
    "#ec4899",
    "#94a3b8",
    "#7c3aed",
  ];

  const renderPercentageLabel = ({
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    percent,
  }: any) => {
    if (percent < 0.03) return null;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text
        x={x}
        y={y}
        fill="#fff"
        fontSize={12}
        textAnchor={x > cx ? "start" : "end"}
        dominantBaseline="central"
      >
        {(percent * 100).toFixed(0)}%
      </text>
    );
  };

  return (
    <>
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
                <Line type="monotone" dataKey="income" stroke="#16a34a" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="net" stroke="#2563eb" strokeWidth={2} dot={false} />
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
            (() => {
              const pieData = categorySummary.map((entry, index) => ({
                ...entry,
                amount: Math.abs(entry.total_amount),
                color: sliceColors[index % sliceColors.length],
              }));
              return (
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                    <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                    <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ width: 140 }} />
                    <Pie
                      data={pieData}
                      dataKey="amount"
                      nameKey="category"
                      cx="40%"
                      cy="50%"
                      outerRadius={100}
                      innerRadius={40}
                      labelLine={false}
                      label={renderPercentageLabel}
                    >
                      {pieData.map((entry) => (
                        <Cell key={`cell-${entry.category}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              );
            })()
          )}
        </div>
      </section>

      <section className="charts-grid">
        <div className="card">
          <header>
            <h2>Yearly Momentum</h2>
            <p>Income, expenses, and net by month</p>
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
        <div className="card">
          <header>
            <h2>Allocation Breakdown</h2>
            <p>How this month's income was used</p>
          </header>
          {loadingTransactions ? (
            <p className="placeholder">Loading summary…</p>
          ) : !summary ? (
            <p className="placeholder">No summary available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <PieChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                <Legend verticalAlign="bottom" height={36} />
                <Pie
                  data={[
                    { name: "Expenses", value: Math.abs(summary.total_expenses), fill: "#ef4444" },
                    { name: "Invested", value: summary.total_invested, fill: "#0ea5e9" },
                    {
                      name: "Saved",
                      value: Math.max(
                        summary.total_income - Math.abs(summary.total_expenses) - summary.total_invested,
                        0
                      ),
                      fill: "#22c55e",
                    },
                  ]}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  innerRadius={40}
                  labelLine={false}
                  label={renderPercentageLabel}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
    </>
  );
}
