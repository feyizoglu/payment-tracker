import { assetTotalIn, canManageAsset, formatPreferred } from "@ptracker/shared/economy";
import type { Asset, ExchangeRates, FiatCurrency, Team } from "@ptracker/shared/types";
import { useLang } from "@ptracker/shared/i18n";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { AssetRow } from "@/components/asset-row";

// One collapsible card per bank, with the bank's own subtotal in the display currency.
export function BankGroup({
  bankName,
  assets,
  rates,
  preferredCurrency,
  currentUserId,
  teams,
  accountsLabel,
  goldErrorLabel,
  onEdit,
  onAdd,
}: {
  bankName: string;
  assets: Asset[];
  rates: ExchangeRates | null;
  preferredCurrency: FiatCurrency;
  currentUserId: string | undefined;
  teams: Team[];
  accountsLabel: string;
  goldErrorLabel: string;
  onEdit: (asset: Asset) => void;
  onAdd: (bankName: string) => void;
}) {
  const { t } = useLang();
  const [expanded, setExpanded] = useState(true);
  const subtotal = assetTotalIn(assets, preferredCurrency, rates);

  return (
    <View className="overflow-hidden rounded-xl border border-gray-100 bg-white">
      <Pressable className="flex-row items-center gap-3 p-3" onPress={() => setExpanded((prev) => !prev)}>
        <View className="flex-1">
          <Text className="font-semibold text-gray-900">{bankName}</Text>
          <Text className="text-xs text-gray-400">{accountsLabel}</Text>
        </View>

        {subtotal != null ? (
          <Text className="font-semibold text-gray-900">{formatPreferred(subtotal, preferredCurrency, t.numberLocale)}</Text>
        ) : null}

        <Pressable className="px-2" onPress={() => onAdd(bankName)}>
          <Text className="text-lg text-brand">+</Text>
        </Pressable>
        <Text className="text-xs text-gray-400">{expanded ? "▴" : "▾"}</Text>
      </Pressable>

      {expanded
        ? assets.map((asset) => (
            <AssetRow
              key={asset.id}
              asset={asset}
              rates={rates}
              preferredCurrency={preferredCurrency}
              canManage={canManageAsset(asset, currentUserId, teams)}
              goldErrorLabel={goldErrorLabel}
              onEdit={onEdit}
            />
          ))
        : null}
    </View>
  );
}
