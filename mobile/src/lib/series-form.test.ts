import { describe, it, expect } from "vitest";
import type { Payment, RecurringPayment } from "@ptracker/shared/types";
import {
  installmentSeriesState,
  recurringSeriesState,
  validateInstallmentSeries,
  validateRecurringSeries,
  installmentSeriesToBody,
  recurringSeriesToBody,
} from "@/lib/series-form";

const messages = {
  fillRequired: "fill-required",
  amountPositive: "amount-positive",
  installmentsRange: "installments-range",
  installmentsBelowPaid: "installments-below-paid",
  dayRange: "day-range",
};

const payment: Payment = {
  id: "p1",
  team_id: null,
  user_id: "u1",
  name: "Laptop",
  amount: 1200,
  currency: "USD",
  start_date: "2026-01-10",
  day_of_month: 10,
  total_installments: 12,
  paid_installments: 3,
  created_at: "",
};

const recurring: RecurringPayment = {
  id: "r1",
  team_id: null,
  user_id: "u1",
  name: "Rent",
  currency: "TRY",
  day_of_month: 5,
  start_month: "2026-01-01",
  end_month: "2026-12-01",
  created_at: "",
};

describe("initial state", () => {
  it("reads an installment payment", () => {
    expect(installmentSeriesState(payment)).toEqual({
      name: "Laptop",
      amount: "1200",
      currency: "USD",
      totalInstallments: "12",
    });
  });

  it("trims the stored end_month down to the picker's 'yyyy-MM'", () => {
    expect(recurringSeriesState(recurring).endMonth).toBe("2026-12");
    expect(recurringSeriesState({ ...recurring, end_month: null }).endMonth).toBe("");
  });
});

describe("validateInstallmentSeries", () => {
  const state = installmentSeriesState(payment);

  it("accepts unchanged values", () => {
    expect(validateInstallmentSeries(state, payment.paid_installments, messages)).toBeNull();
  });

  it("requires a name and a positive amount", () => {
    expect(validateInstallmentSeries({ ...state, name: " " }, 3, messages)).toBe("fill-required");
    expect(validateInstallmentSeries({ ...state, amount: "0" }, 3, messages)).toBe("amount-positive");
    expect(validateInstallmentSeries({ ...state, amount: "" }, 3, messages)).toBe("amount-positive");
  });

  it("bounds the installment count", () => {
    expect(validateInstallmentSeries({ ...state, totalInstallments: "0" }, 0, messages)).toBe(
      "installments-range"
    );
    expect(validateInstallmentSeries({ ...state, totalInstallments: "121" }, 0, messages)).toBe(
      "installments-range"
    );
  });

  it("refuses to shrink the series below the paid installments", () => {
    expect(validateInstallmentSeries({ ...state, totalInstallments: "2" }, 3, messages)).toBe(
      "installments-below-paid"
    );
    expect(validateInstallmentSeries({ ...state, totalInstallments: "3" }, 3, messages)).toBeNull();
  });
});

describe("validateRecurringSeries", () => {
  const state = recurringSeriesState(recurring);

  it("accepts unchanged values", () => {
    expect(validateRecurringSeries(state, messages)).toBeNull();
  });

  it("bounds the day of month", () => {
    expect(validateRecurringSeries({ ...state, dayOfMonth: "0" }, messages)).toBe("day-range");
    expect(validateRecurringSeries({ ...state, dayOfMonth: "32" }, messages)).toBe("day-range");
    expect(validateRecurringSeries({ ...state, dayOfMonth: "" }, messages)).toBe("day-range");
    expect(validateRecurringSeries({ ...state, dayOfMonth: "31" }, messages)).toBeNull();
  });
});

describe("request bodies", () => {
  it("sends numbers, not the raw strings", () => {
    expect(installmentSeriesToBody({ name: " Laptop ", amount: "999.5", currency: "EUR", totalInstallments: "6" })).toEqual({
      name: "Laptop",
      amount: 999.5,
      currency: "EUR",
      total_installments: 6,
    });
  });

  it("clears the end month with null so the server unsets it", () => {
    expect(recurringSeriesToBody({ name: "Rent", dayOfMonth: "5", currency: "TRY", endMonth: "" }).end_month).toBeNull();
    expect(recurringSeriesToBody({ name: "Rent", dayOfMonth: "5", currency: "TRY", endMonth: "2027-03" }).end_month).toBe(
      "2027-03"
    );
  });
});
