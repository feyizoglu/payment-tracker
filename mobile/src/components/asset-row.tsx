import {
  formatAmount,
  formatPreferred,
  fromUSD,
  hashColor,
  isGoldType,
  toUSD,
} from "@ptracker/shared/economy";
import type { Asset, ExchangeRates, FiatCurrency } from "@ptracker/shared/types";
import { Pressable, Text, View } from "react-native";

export function AssetRow({
  asset,
  rates,
  preferredCurrency,
  canManage,
  goldErrorLabel,
  onEdit,
}: {
  asset: Asset;
  rates: ExchangeRates | null;
  preferredCurrency: FiatCurrency;
  canManage: boolean;
  goldErrorLabel: string;
  onEdit: (asset: Asset) => void;
}) {
  const isGold = isGoldType(asset.currency);
  const goldUnpriced = isGold && !!rates?.goldError;

  // The converted line is redundant when the asset is already in the display currency,
  // and impossible when the gold price is missing.
  const converted =
    rates && !goldUnpriced && asset.currency !== preferredCurrency
      ? formatPreferred(fromUSD(toUSD(asset.amount, asset.currency, rates), preferredCurrency, rates), preferredCurrency)
      : null;

  const ownerName = asset.user?.name || asset.user?.email || "";

  return (
    <View className="flex-row items-center gap-3 border-t border-gray-50 px-3 py-2.5">
      <View
        className="h-7 w-7 items-center justify-center rounded-full"
        style={{ backgroundColor: hashColor(asset.user_id) }}>
        <Text className="text-xs font-semibold text-white">
          {(ownerName || "?").charAt(0).toUpperCase()}
        </Text>
      </View>

      <View className="flex-1">
        <Text className="text-sm text-gray-800" numberOfLines={1}>
          {ownerName}
        </Text>
        <Text className="text-xs text-amber-600">{asset.currency}</Text>
      </View>

      <View className="items-end">
        <Text className="font-semibold text-gray-900">{formatAmount(asset.amount, asset.currency)}</Text>
        {goldUnpriced ? (
          <Text className="text-xs text-amber-600">{goldErrorLabel}</Text>
        ) : converted ? (
          <Text className="text-xs text-gray-400">{converted}</Text>
        ) : null}
      </View>

      {canManage ? (
        <Pressable onPress={() => onEdit(asset)} className="pl-1">
          <Text className="text-gray-300">✎</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
