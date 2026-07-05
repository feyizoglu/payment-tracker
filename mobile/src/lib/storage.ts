import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "app_jwt";

// Thin wrapper around expo-secure-store so the rest of the app never imports
// the native module directly (keeps auth logic mockable/testable).
export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
