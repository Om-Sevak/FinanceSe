export interface Account {
  id: number;
  name: string;
  type: string;
  institution: string;
  currency: string;
  latest_balance?: number | null;
  plaid_account_id?: string | null;
}

export interface AccountCreate {
  name: string;
  type: string;
  institution: string;
  currency: string;
  latest_balance?: number | null;
}

export interface Transaction {
  id: number;
  account_id: number;
  date: string;
  description_raw: string;
  description_clean?: string | null;
  amount: number;
  currency: string;
  category?: string | null;
  subcategory?: string | null;
  created_at: string;
  account?: Account;
}

export interface TransactionSummary {
  total_income: number;
  total_expenses: number;
  total_invested: number;
  net_flow: number;
  savings_rate: number;
  net_worth: number;
}

export interface CategoryExpenseSummary {
  category: string;
  total_amount: number;
}

export interface ListTransactionsParams {
  account_id?: number;
  year?: number;
  month?: number;
}

export interface TransactionCategoryUpdatePayload {
  category: string;
}

export interface CategorizationTrainResponse {
  trained: boolean;
  samples: number;
  labels: string[];
  accuracy?: number;
  macro_f1?: number;
  heldout_samples: number;
  saved_to?: string;
}

export interface TransactionCategoryUpdateResponse {
  transaction: Transaction;
  training?: CategorizationTrainResponse;
}

export interface User {
  id: number;
  email: string;
  name: string;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface PlaidItem {
  id: number;
  institution_name: string;
  created_at: string;
}

export interface LinkTokenResponse {
  link_token: string;
}

export interface PlaidSyncResponse {
  added: number;
  modified: number;
  removed: number;
}
