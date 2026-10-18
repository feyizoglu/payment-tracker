import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import type { EventDetail, Team } from "@ptracker/shared/types";
import { useLang } from "@ptracker/shared/i18n";
import { canRemoveParticipant, participantLabel } from "@ptracker/shared/split";
import { PrimaryButton } from "@/components/ui/primary-button";
import { SelectField, type SelectOption } from "@/components/ui/select-field";
import { TextField } from "@/components/ui/text-field";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

type AddBody = { user_id: string } | { email: string } | { display_name: string };

export function Participants({
  event,
  editable,
  onChanged,
}: {
  event: EventDetail;
  editable: boolean;
  onChanged: () => void;
}) {
  const { t } = useLang();
  const { api, user } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [mate, setMate] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    let cancelled = false;
    api
      .get<Team[]>("/api/teams")
      .then((list) => {
        if (!cancelled) setTeams(list ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : tRef.current.loadFailed);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const inEvent = new Set(event.participants.map((p) => p.user_id).filter((id): id is string => id !== null));
  const mates: SelectOption[] = [];
  for (const team of teams) {
    for (const m of team.members ?? []) {
      if (m.user_id === user?.id || inEvent.has(m.user_id) || mates.some((o) => o.value === m.user_id)) continue;
      mates.push({ value: m.user_id, label: m.user?.name ?? m.user?.email ?? "?" });
    }
  }

  async function add(body: AddBody, reset: () => void) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/events/${event.id}/participants`, body);
      reset();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.updateFailed);
      if (e instanceof ApiError && e.status === 409) onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove(pid: string, leaving: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.del(`/api/events/${event.id}/participants/${pid}`);
      // Leaving drops this user's access, so the event can no longer be shown.
      if (leaving) router.back();
      else onChanged();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError(e.message === "Event is closed" ? t.eventIsClosed : t.cannotRemoveParticipant);
        onChanged();
      } else setError(e instanceof Error ? e.message : t.updateFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="gap-3 rounded-xl border border-gray-100 bg-surface p-3">
      <Text className="font-semibold text-gray-900">{t.participants}</Text>
      <View className="flex-row flex-wrap gap-2">
        {event.participants.map((p) => (
          <View key={p.id} className="flex-row items-center gap-1 rounded-full bg-gray-100 py-1 pl-3 pr-2">
            <Text className="text-sm text-gray-900">{participantLabel(p)}</Text>
            {editable && canRemoveParticipant(event, p, user?.id) ? (
              <Pressable disabled={busy} onPress={() => remove(p.id, p.user_id === user?.id)} className={`px-1 ${busy ? "opacity-50" : ""}`}>
                <Text className="text-gray-400">✕</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>

      {editable ? (
        <View className="gap-2">
          <Text className="text-sm font-medium text-gray-700">{t.addParticipant}</Text>
          {mates.length > 0 ? (
            <View className="flex-row items-end gap-2">
              <View className="flex-1">
                <SelectField
                  label={t.fromTeams}
                  value={mate}
                  options={mates}
                  onChange={setMate}
                  placeholder={t.fromTeams}
                />
              </View>
              <PrimaryButton
                label="+"
                onPress={() => add({ user_id: mate }, () => setMate(""))}
                disabled={busy || !mate}
              />
            </View>
          ) : null}
          <View className="flex-row items-end gap-2">
            <View className="flex-1">
              <TextField label={t.addByEmail} value={email} onChangeText={setEmail} />
            </View>
            <PrimaryButton
              label="+"
              onPress={() => add({ email: email.trim() }, () => setEmail(""))}
              disabled={busy || !email.trim()}
            />
          </View>
          <View className="flex-row items-end gap-2">
            <View className="flex-1">
              <TextField label={t.addByName} value={displayName} onChangeText={setDisplayName} />
            </View>
            <PrimaryButton
              label="+"
              onPress={() => add({ display_name: displayName.trim() }, () => setDisplayName(""))}
              disabled={busy || !displayName.trim()}
            />
          </View>
        </View>
      ) : null}

      {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
    </View>
  );
}
