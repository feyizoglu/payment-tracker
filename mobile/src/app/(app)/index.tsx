import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth-context';
import type { Payment } from '@shared/types';

export default function Payments() {
  const { api, signOut } = useAuth();
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.get<Payment[]>('/api/payments?filter=all');
      setPayments(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi');
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (payments === null && !error) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      {error ? (
        <View className="bg-red-50 p-4">
          <Text className="text-red-700">{error}</Text>
          <Pressable onPress={load} className="mt-2">
            <Text className="text-brand">Tekrar dene</Text>
          </Pressable>
        </View>
      ) : null}
      <FlatList
        data={payments ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerClassName="gap-3 p-4"
        ListEmptyComponent={
          error ? null : <Text className="text-center text-gray-500">Ödeme yok</Text>
        }
        renderItem={({ item }) => (
          <View className="rounded-lg border border-gray-200 p-4">
            <Text className="font-semibold text-black">{item.name}</Text>
            <Text className="text-gray-600">
              {item.amount} {item.currency}
            </Text>
          </View>
        )}
      />
      <Pressable onPress={signOut} className="p-4">
        <Text className="text-center text-gray-500">Çıkış yap</Text>
      </Pressable>
    </View>
  );
}
