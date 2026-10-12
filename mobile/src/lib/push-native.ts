import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

import type { PushDeps } from "./push";

const CHANNEL_ID = "default";

// Show reminders that arrive while the app is open, too.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function nativePushDeps(post: PushDeps["post"]): PushDeps {
  return {
    isDevice: Device.isDevice,
    ensureChannel: async () => {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: "Ödeme hatırlatmaları",
        importance: Notifications.AndroidImportance.HIGH,
      });
    },
    getPermission: async () => {
      const p = await Notifications.getPermissionsAsync();
      return { granted: p.granted, canAskAgain: p.canAskAgain };
    },
    requestPermission: async () => {
      const p = await Notifications.requestPermissionsAsync();
      return { granted: p.granted };
    },
    getPushToken: async () => {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
      return data;
    },
    post,
  };
}
