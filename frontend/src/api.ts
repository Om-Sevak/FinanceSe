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
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

const client = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
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

export async function getMonthlySummary(year: number, month: number) {
  const { data } = await client.get<TransactionSummary>("/transactions/summary", {
    params: { year, month },
  });
  return data;
}

export async function getExpensesByCategory(year: number, month: number) {
  const { data } = await client.get<CategoryExpenseSummary[]>(
    "/transactions/expenses/by-category",
    { params: { year, month } },
  );
  return data;
}

export async function getTransactionBreakdown(
  kind: "income" | "expense" | "investment",
  year: number,
  month: number,
) {
  const { data } = await client.get<Transaction[]>("/transactions/breakdown", {
    params: { kind, year, month },
  });
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
