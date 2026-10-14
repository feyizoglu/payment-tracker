import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function TabScreen({ children, className = "bg-surface" }: { children: ReactNode; className?: string }) {
  const { top } = useSafeAreaInsets();
  return (
    <View className={`flex-1 ${className}`} style={{ paddingTop: top }}>
      {children}
    </View>
  );
}
