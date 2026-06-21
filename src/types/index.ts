export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  members?: TeamMember[];
}

export interface TeamMember {
  team_id: string;
  user_id: string;
  role: "owner" | "member";
  joined_at: string;
  user?: User;
}

export interface Payment {
  id: string;
  team_id: string | null;
  user_id: string;
  name: string;
  amount: number;
  currency: string;
  start_date: string;
  day_of_month: number;
  total_installments: number;
  paid_installments: number;
  created_at: string;
  user?: User;
}

export interface PaymentInstallment {
  index: number;
  dueDate: Date;
  amount: number;
  isPaid: boolean;
}

export interface RecurringPayment {
  id: string;
  team_id: string | null;
  user_id: string;
  name: string;
  currency: string;
  day_of_month: number;
  start_month: string;       // 'yyyy-MM-01'
  end_month: string | null;  // 'yyyy-MM-01' | null
  created_at: string;
  entries?: RecurringEntry[];
  user?: User;
}

export interface RecurringEntry {
  id: string;
  recurring_id: string;
  period: string;            // 'yyyy-MM-01'
  amount: number | null;
  is_paid: boolean;
  paid_at: string | null;
  created_at: string;
}

export interface Occurrence {
  kind: "installment" | "recurring";
  sourceId: string;
  name: string;
  currency: string;
  user_id: string;
  team_id: string | null;
  dueDate: Date;
  amount: number | null;
  isPaid: boolean;
  installmentIndex?: number;
  totalInstallments?: number;
  period?: string;
  entryId?: string | null;
}

export type GoldType = "BILEZIK" | "GRAM_ALTIN" | "CEYREK_ALTIN" | "YARIM_ALTIN" | "TAM_ALTIN";
export type FiatCurrency = "USD" | "EUR" | "GBP" | "TRY";
export type Currency = FiatCurrency | GoldType;

export interface Asset {
  id: string;
  user_id: string;
  team_id: string | null;
  bank_name: string;
  currency: Currency;
  // For fiat: face value. For BILEZIK/GRAM_ALTIN: grams. For CEYREK/YARIM/TAM: adet (pieces).
  amount: number;
  created_at: string;
  user?: User;
}

export interface ExchangeRates {
  // USD per 1 unit of each currency/asset type
  USD: number;          // 1
  EUR: number;          // USD per 1 EUR
  GBP: number;          // USD per 1 GBP
  TRY: number;          // USD per 1 TRY
  BILEZIK: number;      // USD per 1 gram (22 ayar bilezik)
  GRAM_ALTIN: number;   // USD per 1 gram
  CEYREK_ALTIN: number; // USD per 1 piece
  YARIM_ALTIN: number;  // USD per 1 piece
  TAM_ALTIN: number;    // USD per 1 piece
  fetchedAt: string;
  goldError?: string | null;
}
