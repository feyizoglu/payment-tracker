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
