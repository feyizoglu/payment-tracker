import { Payment, PaymentInstallment } from "@/types";
import { addMonths, setDate, isAfter, isBefore, startOfDay } from "date-fns";

export function getInstallments(payment: Payment): PaymentInstallment[] {
  const installments: PaymentInstallment[] = [];
  const installmentAmount = payment.amount / payment.total_installments;

  for (let i = 0; i < payment.total_installments; i++) {
    const base = addMonths(new Date(payment.start_date), i);
    // Clamp day to end of month if needed
    const maxDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    const day = Math.min(payment.day_of_month, maxDay);
    const dueDate = setDate(base, day);

    installments.push({
      index: i,
      dueDate,
      amount: installmentAmount,
      isPaid: i < payment.paid_installments,
    });
  }

  return installments;
}

export function getPaymentsForMonth(
  payments: Payment[],
  year: number,
  month: number // 0-indexed
): { payment: Payment; installment: PaymentInstallment }[] {
  const result: { payment: Payment; installment: PaymentInstallment }[] = [];

  for (const payment of payments) {
    const installments = getInstallments(payment);
    for (const inst of installments) {
      if (
        inst.dueDate.getFullYear() === year &&
        inst.dueDate.getMonth() === month
      ) {
        result.push({ payment, installment: inst });
      }
    }
  }

  result.sort((a, b) => a.installment.dueDate.getDate() - b.installment.dueDate.getDate());
  return result;
}

export function getTotalMonthly(payment: Payment): number {
  return payment.amount / payment.total_installments;
}

export function getRemainingAmount(payment: Payment): number {
  const remaining = payment.total_installments - payment.paid_installments;
  return (payment.amount / payment.total_installments) * remaining;
}
