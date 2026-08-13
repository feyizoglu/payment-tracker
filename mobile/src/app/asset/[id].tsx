import { formatAmount } from "@ptracker/shared/economy";
import { useLang } from "@ptracker/shared/i18n";
import type { Asset } from "@ptracker/shared/types";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Text } from "react-native";

import { DangerLink } from "@/components/ui/danger-link";
import { FormScreen } from "@/components/ui/form-screen";
import { TextField } from "@/components/ui/text-field";
import { assetEditState, assetEditToBody, validateAssetEdit, type AssetEditState } from "@/lib/asset-form";
import { useAuth } from "@/lib/auth-context";

export default function EditAssetScreen() {
  const { t } = useLang();
  const { api } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [asset, setAsset] = useState<Asset | null>(null);
  const [form, setForm] = useState<AssetEditState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // No GET /api/assets/{id} exists; the list endpoint is the only read surface.
  useEffect(() => {
    let cancelled = false;
    api
      .get<Asset[]>("/api/assets")
      .then((list) => {
        if (cancelled) return;
        const found = (list ?? []).find((candidate) => candidate.id === id) ?? null;
        setAsset(found);
        setForm(found ? assetEditState(found) : null);
        if (!found) setError(t.loadFailed);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t.loadFailed);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, id, t.loadFailed]);

  function set<K extends keyof AssetEditState>(field: K, value: AssetEditState[K]) {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function submit() {
    if (!form || !asset) return;
    const problem = validateAssetEdit(form, { fillRequired: t.fillRequired, amountPositive: t.amountPositive });
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.patch(`/api/assets/${asset.id}`, assetEditToBody(form));
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.loadFailed);
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (!asset) return;
    Alert.alert(t.deleteAsset, t.assetDeleteConfirm, [
      { text: t.cancel, style: "cancel" },
      { text: t.deleteAsset, style: "destructive", onPress: remove },
    ]);
  }

  async function remove() {
    if (!asset) return;
    setBusy(true);
    setError(null);
    try {
      await api.del(`/api/assets/${asset.id}`);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.loadFailed);
      setBusy(false);
    }
  }

  return (
    <FormScreen
      title={t.editAsset}
      submitLabel={busy ? t.saving : t.save}
      cancelLabel={t.cancel}
      onSubmit={submit}
      busy={busy}
      loading={loading}
      error={error}
      footer={asset ? <DangerLink label={t.deleteAsset} onPress={confirmDelete} disabled={busy} /> : null}>
      {form && asset ? (
        <>
          {/* Currency is fixed after creation — changing it would silently redenominate
              the stored amount rather than convert it. */}
          <Text className="text-xs text-gray-400">
            {asset.currency} · {formatAmount(asset.amount, asset.currency)}
          </Text>

          <TextField label={t.bankName} value={form.bankName} onChangeText={(next) => set("bankName", next)} />

          <TextField
            label={t.amount}
            value={form.amount}
            onChangeText={(next) => set("amount", next)}
            numeric
          />
        </>
      ) : null}
    </FormScreen>
  );
}
