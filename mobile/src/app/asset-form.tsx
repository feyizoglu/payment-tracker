import { FIAT_CURRENCIES, FIAT_SYMBOLS, GOLD_TYPES } from "@ptracker/shared/economy";
import { useLang } from "@ptracker/shared/i18n";
import type { Currency, Team } from "@ptracker/shared/types";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";

import { FormScreen } from "@/components/ui/form-screen";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { SelectField, type SelectOption } from "@/components/ui/select-field";
import { TextField } from "@/components/ui/text-field";
import { amountUnitHint, assetFormToBody, emptyAssetForm, validateAssetForm, type AssetFormState } from "@/lib/asset-form";
import { useAuth } from "@/lib/auth-context";
import { assignableMembers } from "@/lib/payment-form";

export default function AssetFormScreen() {
  const { t } = useLang();
  const { api, user } = useAuth();
  const params = useLocalSearchParams<{ bankName?: string }>();

  const [form, setForm] = useState<AssetFormState>(() => emptyAssetForm({ bankName: params.bankName ?? "" }));
  const [teams, setTeams] = useState<Team[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Teams are optional context — a failure still leaves a usable personal-asset form.
  useEffect(() => {
    let cancelled = false;
    api
      .get<Team[]>("/api/teams")
      .then((list) => {
        if (!cancelled) setTeams(list ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [api]);

  function set<K extends keyof AssetFormState>(field: K, value: AssetFormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value, ...(field === "teamId" ? { targetUserId: "" } : {}) }));
  }

  const members = useMemo(() => assignableMembers(teams, form.teamId, user?.id), [teams, form.teamId, user?.id]);

  // Gold labels come from the dictionary; fiat is shown as "symbol CODE".
  const goldOptions: SelectOption[] = GOLD_TYPES.map((gold) => ({
    value: gold.value,
    label: t[gold.labelKey as keyof typeof t] as string,
  }));

  async function submit() {
    const problem = validateAssetForm(form, { fillRequired: t.fillRequired, amountPositive: t.amountPositive });
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.post("/api/assets", assetFormToBody(form));
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.loadFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormScreen
      title={t.addAssetTitle}
      submitLabel={busy ? t.addingAsset : t.addAsset}
      cancelLabel={t.cancel}
      onSubmit={submit}
      busy={busy}
      error={error}>
      <TextField
        label={t.bankName}
        value={form.bankName}
        onChangeText={(next) => set("bankName", next)}
        placeholder={t.bankNamePlaceholder}
      />

      <SegmentedToggle
        label={t.currency}
        value={FIAT_CURRENCIES.includes(form.currency as never) ? form.currency : ""}
        options={FIAT_CURRENCIES.map((currency) => ({
          value: currency,
          label: `${FIAT_SYMBOLS[currency]} ${currency}`,
        }))}
        onChange={(next) => set("currency", next as Currency)}
      />

      {/* Gold sits in its own select: nine options would not fit a segmented row, and
          picking either control replaces the other's choice. */}
      <SelectField
        label={t.goldTypeLabel}
        value={GOLD_TYPES.some((gold) => gold.value === form.currency) ? form.currency : ""}
        options={goldOptions}
        onChange={(next) => set("currency", next as Currency)}
      />

      <TextField
        label={amountUnitHint(form.currency, t.goldGrams, "adet") ? t.amountGold : t.amount}
        value={form.amount}
        onChangeText={(next) => set("amount", next)}
        placeholder="0.00"
        numeric
        hint={amountUnitHint(form.currency, t.goldGrams, "adet")}
      />

      {teams.length > 0 ? (
        <SelectField
          label={t.addToTeamAsset}
          value={form.teamId}
          options={[
            { value: "", label: t.personalOption },
            ...teams.map((team) => ({ value: team.id, label: team.name })),
          ]}
          onChange={(next) => set("teamId", next)}
        />
      ) : null}

      {members.length > 0 ? (
        <SelectField
          label={t.addFor}
          value={form.targetUserId}
          options={[{ value: "", label: t.myself }, ...members.map((m) => ({ value: m.userId, label: m.name }))]}
          onChange={(next) => set("targetUserId", next)}
        />
      ) : null}
    </FormScreen>
  );
}
