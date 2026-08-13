import { describe, it, expect } from "vitest";
import type { Asset } from "@ptracker/shared/types";
import {
  emptyAssetForm,
  assetEditState,
  validateAssetForm,
  validateAssetEdit,
  assetFormToBody,
  assetEditToBody,
  amountUnitHint,
} from "@/lib/asset-form";

const messages = { fillRequired: "fill-required", amountPositive: "amount-positive" };

const valid = emptyAssetForm({ bankName: "Garanti", amount: "1500" });

const asset: Asset = {
  id: "a1",
  user_id: "u1",
  team_id: null,
  bank_name: "Akbank",
  currency: "GRAM_ALTIN",
  amount: 12.5,
  created_at: "",
};

describe("validateAssetForm", () => {
  it("accepts a complete form", () => {
    expect(validateAssetForm(valid, messages)).toBeNull();
  });

  it("requires a bank name", () => {
    expect(validateAssetForm({ ...valid, bankName: "  " }, messages)).toBe("fill-required");
  });

  it("requires a positive amount", () => {
    expect(validateAssetForm({ ...valid, amount: "0" }, messages)).toBe("amount-positive");
    expect(validateAssetForm({ ...valid, amount: "-3" }, messages)).toBe("amount-positive");
    expect(validateAssetForm({ ...valid, amount: "" }, messages)).toBe("amount-positive");
    expect(validateAssetForm({ ...valid, amount: "abc" }, messages)).toBe("amount-positive");
  });

  it("accepts a fractional gold amount", () => {
    expect(validateAssetForm({ ...valid, currency: "GRAM_ALTIN", amount: "0.5" }, messages)).toBeNull();
  });
});

describe("assetFormToBody", () => {
  it("sends a personal asset with a null team", () => {
    expect(assetFormToBody(valid)).toEqual({
      bank_name: "Garanti",
      currency: "USD",
      amount: 1500,
      team_id: null,
      target_user_id: undefined,
    });
  });

  it("trims the bank name and coerces the amount", () => {
    const body = assetFormToBody({ ...valid, bankName: "  Akbank  ", amount: "12.5" });
    expect(body.bank_name).toBe("Akbank");
    expect(body.amount).toBe(12.5);
  });

  it("drops target_user_id without a team", () => {
    const body = assetFormToBody({ ...valid, teamId: "", targetUserId: "u2" });
    expect(body.team_id).toBeNull();
    expect(body.target_user_id).toBeUndefined();
  });

  it("keeps target_user_id alongside a team", () => {
    const body = assetFormToBody({ ...valid, teamId: "t1", targetUserId: "u2" });
    expect(body.team_id).toBe("t1");
    expect(body.target_user_id).toBe("u2");
  });

  it("carries the gold type through as the currency", () => {
    expect(assetFormToBody({ ...valid, currency: "CEYREK_ALTIN", amount: "3" }).currency).toBe("CEYREK_ALTIN");
  });
});

describe("edit", () => {
  it("seeds from the asset", () => {
    expect(assetEditState(asset)).toEqual({ bankName: "Akbank", amount: "12.5" });
  });

  it("validates the same way as create", () => {
    expect(validateAssetEdit({ bankName: "Akbank", amount: "1" }, messages)).toBeNull();
    expect(validateAssetEdit({ bankName: "", amount: "1" }, messages)).toBe("fill-required");
    expect(validateAssetEdit({ bankName: "Akbank", amount: "0" }, messages)).toBe("amount-positive");
  });

  it("never sends currency or team — re-denominating would rewrite the value", () => {
    const body = assetEditToBody({ bankName: "Akbank", amount: "20" });
    expect(body).toEqual({ bank_name: "Akbank", amount: 20 });
    expect(body).not.toHaveProperty("currency");
    expect(body).not.toHaveProperty("team_id");
  });
});

describe("amountUnitHint", () => {
  it("says grams for weighed gold and pieces for coins", () => {
    expect(amountUnitHint("BILEZIK", "gr", "adet")).toBe("gr");
    expect(amountUnitHint("GRAM_ALTIN", "gr", "adet")).toBe("gr");
    expect(amountUnitHint("CEYREK_ALTIN", "gr", "adet")).toBe("adet");
    expect(amountUnitHint("TAM_ALTIN", "gr", "adet")).toBe("adet");
  });

  it("stays silent for fiat, where the symbol already says it", () => {
    expect(amountUnitHint("USD", "gr", "adet")).toBeUndefined();
    expect(amountUnitHint("TRY", "gr", "adet")).toBeUndefined();
  });
});
