import { useLang } from '@ptracker/shared/i18n';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const { t } = useLang();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{t.tabPayments}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="event" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="economy">
        <NativeTabs.Trigger.Label>{t.economy}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="account_balance_wallet" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="reports">
        <NativeTabs.Trigger.Label>{t.tabReports}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="bar_chart" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>{t.tabSettings}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
