import { describe, it, expect } from "vitest";
import type { Team } from "@ptracker/shared/types";
import {
  emptyPaymentForm,
  computedTotal,
  computedInstallment,
  validatePaymentForm,
  paymentFormToRequest,
  assignableMembers,
} from "@/lib/payment-form";

const messages = {
  fillRequired: "fill-required",
  amountPositive: "amount-positive",
  installmentsRange: "installments-range",
};

const valid = emptyPaymentForm({
  name: "Laptop",
  totalAmount: "1200",
  startDate: "2026-08-13",
  totalInstallments: "12",
});

describe("computedTotal / computedInstallment", () => {
  it("derives the converse amount in total mode", () => {
    expect(computedTotal(valid)).toBe(1200);
    expect(computedInstallment(valid)).toBe(100);
  });

  it("derives the converse amount in per-installment mode", () => {
    const state = { ...valid, inputMode: "installment" as const, installmentAmount: "150" };
    expect(computedTotal(state)).toBe(1800);
    expect(computedInstallment(state)).toBe(150);
  });

  it("does not divide by zero when the count is blank", () => {
    expect(computedInstallment({ ...valid, totalInstallments: "" })).toBe(0);
  });
});

describe("validatePaymentForm", () => {
  it("accepts a complete installment form", () => {
    expect(validatePaymentForm(valid, messages)).toBeNull();
  });

  it("requires a name and a start date", () => {
    expect(validatePaymentForm({ ...valid, name: "   " }, messages)).toBe("fill-required");
    expect(validatePaymentForm({ ...valid, startDate: "" }, messages)).toBe("fill-required");
  });

  it("bounds the installment count", () => {
    expect(validatePaymentForm({ ...valid, totalInstallments: "0" }, messages)).toBe("installments-range");
    expect(validatePaymentForm({ ...valid, totalInstallments: "121" }, messages)).toBe("installments-range");
    expect(validatePaymentForm({ ...valid, totalInstallments: "120" }, messages)).toBeNull();
  });

  it("requires a positive amount, whichever mode is active", () => {
    expect(validatePaymentForm({ ...valid, totalAmount: "0" }, messages)).toBe("amount-positive");
    expect(validatePaymentForm({ ...valid, totalAmount: "abc" }, messages)).toBe("amount-positive");
    expect(
      validatePaymentForm({ ...valid, inputMode: "installment", installmentAmount: "" }, messages)
    ).toBe("amount-positive");
  });

  it("skips the amount and count rules for a recurring reminder", () => {
    const recurring = emptyPaymentForm({
      entryKind: "recurring",
      name: "Rent",
      startDate: "2026-08-01",
      totalInstallments: "",
    });
    expect(validatePaymentForm(recurring, messages)).toBeNull();
  });
});

describe("paymentFormToRequest", () => {
  it("posts the total for an installment payment", () => {
    expect(paymentFormToRequest(valid)).toEqual({
      url: "/api/payments",
      body: {
        name: "Laptop",
        amount: 1200,
        currency: "TRY",
        start_date: "2026-08-13",
        total_installments: 12,
        team_id: null,
        target_user_id: undefined,
      },
    });
  });

  it("multiplies up when the user typed the per-installment amount", () => {
    const { body } = paymentFormToRequest({
      ...valid,
      inputMode: "installment",
      installmentAmount: "150",
      totalInstallments: "4",
    });
    expect(body.amount).toBe(600);
  });

  it("posts a recurring reminder without amount fields", () => {
    const { url, body } = paymentFormToRequest(
      emptyPaymentForm({
        entryKind: "recurring",
        name: "Rent",
        currency: "USD",
        startDate: "2026-08-05",
        endMonth: "2027-01",
      })
    );
    expect(url).toBe("/api/recurring");
    expect(body).toEqual({
      name: "Rent",
      currency: "USD",
      start_date: "2026-08-05",
      end_month: "2027-01",
      team_id: null,
      target_user_id: undefined,
    });
  });

  it("omits end_month when it was left blank", () => {
    const { body } = paymentFormToRequest(
      emptyPaymentForm({ entryKind: "recurring", name: "Rent", startDate: "2026-08-05" })
    );
    expect(body.end_month).toBeUndefined();
  });

  it("drops target_user_id when no team is selected", () => {
    const { body } = paymentFormToRequest({ ...valid, teamId: "", targetUserId: "u2" });
    expect(body.team_id).toBeNull();
    expect(body.target_user_id).toBeUndefined();
  });

  it("keeps target_user_id alongside a team", () => {
    const { body } = paymentFormToRequest({ ...valid, teamId: "t1", targetUserId: "u2" });
    expect(body.team_id).toBe("t1");
    expect(body.target_user_id).toBe("u2");
  });
});

describe("assignableMembers", () => {
  const teams: Team[] = [
    {
      id: "t1",
      name: "Home",
      created_by: "u1",
      created_at: "",
      members: [
        { team_id: "t1", user_id: "u1", role: "owner", joined_at: "" },
        {
          team_id: "t1",
          user_id: "u2",
          role: "member",
          joined_at: "",
          user: { id: "u2", email: "b@x.com", name: "Bora", avatar_url: null, created_at: "" },
        },
        {
          team_id: "t1",
          user_id: "u3",
          role: "member",
          joined_at: "",
          user: { id: "u3", email: "c@x.com", name: null, avatar_url: null, created_at: "" },
        },
      ],
    },
    {
      id: "t2",
      name: "Work",
      created_by: "u9",
      created_at: "",
      members: [
        { team_id: "t2", user_id: "u9", role: "owner", joined_at: "" },
        { team_id: "t2", user_id: "u1", role: "member", joined_at: "" },
      ],
    },
  ];

  it("lists the other members when the user owns the team", () => {
    expect(assignableMembers(teams, "t1", "u1")).toEqual([
      { userId: "u2", name: "Bora" },
      { userId: "u3", name: "c@x.com" }, // falls back to the email when there is no name
    ]);
  });

  it("returns nothing when the user is only a member", () => {
    expect(assignableMembers(teams, "t2", "u1")).toEqual([]);
  });

  it("returns nothing for the personal (no team) selection", () => {
    expect(assignableMembers(teams, "", "u1")).toEqual([]);
  });
});
