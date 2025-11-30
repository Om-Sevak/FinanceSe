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
import type { CategoryExpenseSummary } from "../types";

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
}

export function ChartsSection({
  dailyTrend,
  yearlySeries,
  categorySummary,
  loadingTransactions,
  loadingDashboard,
}: Props) {
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
      </section>
    </>
  );
}
