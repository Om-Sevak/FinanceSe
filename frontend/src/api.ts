import axios from "axios";
import type {
  Account,
  AccountCreate,
  Transaction,
  TransactionSummary,
  CategoryExpenseSummary,
  ListTransactionsParams,
  TransactionCategoryUpdatePayload,
  TransactionCategoryUpdateResponse,
  TokenResponse,
  User,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

const client = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

client.interceptors.request.use((config) => {
  if (authToken) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

export async function listAccounts() {
  const { data } = await client.get<Account[]>("/accounts");
  return data;
}

export async function createAccount(payload: AccountCreate) {
  const { data } = await client.post<Account>("/accounts", payload);
  return data;
}

export async function deleteAccount(id: number) {
  await client.delete(`/accounts/${id}`);
}

export async function listTransactions(params: ListTransactionsParams = {}) {
  const { data } = await client.get<Transaction[]>("/transactions", { params });
  return data;
}

export async function getMonthlySummary(year?: number, month?: number) {
  const params: Record<string, number> = {};
  if (typeof year === "number") params.year = year;
  if (typeof month === "number") params.month = month;
  const { data } = await client.get<TransactionSummary>("/transactions/summary", { params });
  return data;
}

export async function getExpensesByCategory(year?: number, month?: number) {
  const params: Record<string, number> = {};
  if (typeof year === "number") params.year = year;
  if (typeof month === "number") params.month = month;
  const { data } = await client.get<CategoryExpenseSummary[]>(
    "/transactions/expenses/by-category",
    { params },
  );
  return data;
}

export async function getTransactionBreakdown(
  kind: "income" | "expense" | "investment",
  year?: number,
  month?: number,
) {
  const params: Record<string, any> = { kind };
  if (typeof year === "number") params.year = year;
  if (typeof month === "number") params.month = month;
  const { data } = await client.get<Transaction[]>("/transactions/breakdown", { params });
  return data;
}

export async function uploadStatement(accountId: number, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await client.post<Transaction[]>(
    `/uploads/${accountId}/csv`,
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
    },
  );
  return data;
}

export async function uploadPdfStatement(accountId: number, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await client.post<Transaction[]>(
    `/uploads/${accountId}/pdf`,
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
    },
  );
  return data;
}

export async function purgeTransactions() {
  await client.delete("/transactions/dev/purge");
}

export async function purgeAccounts() {
  await client.delete("/accounts/dev/purge");
}

export async function recategorizeTransactions() {
  const { data } = await client.post<{ updated: number; total: number }>(
    "/transactions/dev/re-categorize",
  );
  return data;
}

export async function updateTransactionCategory(
  transactionId: number,
  payload: TransactionCategoryUpdatePayload,
) {
  const { data } = await client.patch<TransactionCategoryUpdateResponse>(
    `/transactions/${transactionId}/category`,
    payload,
  );
  return data;
}

export async function registerUser(payload: { name: string; email: string; password: string }) {
  const { data } = await client.post<User>("/auth/register", payload);
  return data;
}

export async function loginUser(payload: { email: string; password: string }) {
  const form = new FormData();
  form.append("username", payload.email);
  form.append("password", payload.password);
  const { data } = await client.post<TokenResponse>("/auth/login", form, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return data;
}

export async function getCurrentUser() {
  const { data } = await client.get<User>("/auth/me");
  return data;
}
