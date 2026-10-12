import { useLang, type Lang } from "@ptracker/shared/i18n";
import { COLOR_OPTIONS, isTeamOwner, memberDisplayName, myColorFromTeams } from "@ptracker/shared/teams";
import type { Team } from "@ptracker/shared/types";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { PrimaryButton } from "@/components/ui/primary-button";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { TextField } from "@/components/ui/text-field";
import { TabScreen } from "@/components/tab-screen";
import { useAuth } from "@/lib/auth-context";
import {
  createTeamBody,
  invitePath,
  inviteBody,
  validateInviteEmail,
  validateTeamName,
} from "@/lib/settings-form";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-3 rounded-xl border border-gray-100 bg-white p-4">
      <Text className="text-xs font-semibold uppercase text-gray-400">{title}</Text>
      {children}
    </View>
  );
}

export default function Settings() {
  const { t, lang, setLang } = useLang();
  const { api, user, signOut } = useAuth();

  const [teams, setTeams] = useState<Team[]>([]);
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [teamName, setTeamName] = useState("");
  const [creating, setCreating] = useState(false);
  const [inviteTeamId, setInviteTeamId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [color, setColor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await api.get<Team[]>("/api/teams");
      setTeams(list ?? []);
      setColor(myColorFromTeams(list ?? [], user?.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : t.loadFailed);
    } finally {
      setReady(true);
    }
  }, [api, user?.id, t.loadFailed]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function chooseColor(next: string) {
    // Optimistic: the swatch is the only feedback, and a failed write costs nothing
    // beyond the tint reverting on the next load.
    setColor(next);
    try {
      await api.patch("/api/users/me", { color: next });
    } catch (e) {
      setError(e instanceof Error ? e.message : t.updateFailed);
    }
  }

  async function createTeam() {
    const problem = validateTeamName(teamName, {
      teamNameRequired: t.teamNameRequired,
      emailRequired: t.emailRequired,
    });
    if (problem) {
      setError(problem);
      return;
    }

    setCreating(true);
    setError(null);
    try {
      await api.post("/api/teams", createTeamBody(teamName));
      setTeamName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.updateFailed);
    } finally {
      setCreating(false);
    }
  }

  async function invite(teamId: string) {
    const problem = validateInviteEmail(inviteEmail, {
      teamNameRequired: t.teamNameRequired,
      emailRequired: t.emailRequired,
    });
    if (problem) {
      setError(problem);
      return;
    }

    setInviting(true);
    setError(null);
    setNotice(null);
    try {
      await api.post(invitePath(teamId), inviteBody(inviteEmail));
      setInviteEmail("");
      setInviteTeamId(null);
      setNotice(t.memberAdded);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.inviteFailed);
    } finally {
      setInviting(false);
    }
  }

  const ownedTeams = useMemo(
    () => new Set(teams.filter((team) => isTeamOwner(team, user?.id)).map((team) => team.id)),
    [teams, user?.id]
  );

  if (!ready) {
    return (
      <TabScreen className="items-center justify-center bg-white">
        <ActivityIndicator />
      </TabScreen>
    );
  }

  return (
    <TabScreen className="bg-gray-50">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 p-4"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {error ? (
          <View className="rounded-lg bg-red-50 p-3">
            <Text className="text-red-700">{error}</Text>
          </View>
        ) : null}
        {notice ? (
          <View className="rounded-lg bg-green-50 p-3">
            <Text className="text-green-700">{notice}</Text>
          </View>
        ) : null}

        <Section title={t.language}>
          <SegmentedToggle
            value={lang}
            options={[
              { value: "tr", label: "Türkçe" },
              { value: "en", label: "English" },
            ]}
            onChange={(next) => setLang(next as Lang)}
          />
        </Section>

        <Section title={t.myColor}>
          <View className="flex-row flex-wrap gap-2">
            {COLOR_OPTIONS.map((option) => (
              <Pressable
                key={option}
                onPress={() => chooseColor(option)}
                className={`h-8 w-8 rounded-full ${color === option ? "border-2 border-gray-900" : ""}`}
                style={{ backgroundColor: option }}
              />
            ))}
          </View>
          {/* There is no "get me" endpoint: the colour is recovered from team membership,
              so a user in no team sees no selection even after saving one. */}
        </Section>

        <Section title={t.createTeamTitle}>
          <TextField
            label={t.newTeamName}
            value={teamName}
            onChangeText={setTeamName}
            placeholder={t.newTeamName}
          />
          <PrimaryButton label={creating ? t.adding : t.create} onPress={createTeam} busy={creating} />
        </Section>

        <Section title={t.teams}>
          {teams.length === 0 ? (
            <Text className="text-sm text-gray-400">{t.noTeams}</Text>
          ) : (
            teams.map((team, index) => (
              // Separator between teams only. `first:` is a CSS pseudo-class — NativeWind
              // cannot evaluate document position in React Native, so it would be inert.
              <View
                key={team.id}
                className={`gap-2 ${index === 0 ? "" : "border-t border-gray-50 pt-3"}`}>
                <Text className="font-medium text-gray-900">{team.name}</Text>

                {(team.members ?? []).map((member) => (
                  <View key={member.user_id} className="flex-row items-center gap-2">
                    <View
                      className="h-6 w-6 items-center justify-center rounded-full"
                      style={{ backgroundColor: member.user?.color ?? "#9ca3af" }}>
                      <Text className="text-[10px] font-semibold text-white">
                        {memberDisplayName(member.user, member.user_id).charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text className="flex-1 text-sm text-gray-700" numberOfLines={1}>
                      {memberDisplayName(member.user, member.user_id)}
                    </Text>
                    {member.role === "owner" ? (
                      <Text className="rounded-full bg-gray-100 px-2 text-[10px] text-gray-500">{t.owner}</Text>
                    ) : null}
                  </View>
                ))}

                {/* Inviting is owner-only — the API enforces the same rule with a 403. */}
                {ownedTeams.has(team.id) ? (
                  inviteTeamId === team.id ? (
                    <View className="gap-2">
                      <TextField
                        label={t.inviteMember}
                        value={inviteEmail}
                        onChangeText={setInviteEmail}
                        placeholder={t.invitePlaceholder}
                      />
                      <View className="flex-row gap-2">
                        <View className="flex-1">
                          <PrimaryButton
                            label={inviting ? t.inviting : t.invite}
                            onPress={() => invite(team.id)}
                            busy={inviting}
                          />
                        </View>
                        <Pressable className="justify-center px-3" onPress={() => setInviteTeamId(null)}>
                          <Text className="text-sm text-gray-500">{t.cancel}</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <Pressable onPress={() => setInviteTeamId(team.id)}>
                      <Text className="text-sm text-brand">+ {t.inviteMember}</Text>
                    </Pressable>
                  )
                ) : null}
              </View>
            ))
          )}
        </Section>

        <Pressable onPress={signOut} className="rounded-xl border border-gray-100 bg-white p-4">
          <Text className="text-center text-red-600">{t.signOut}</Text>
        </Pressable>
      </ScrollView>
    </TabScreen>
  );
}
