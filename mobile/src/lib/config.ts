// Public (EXPO_PUBLIC_*) values only — these are bundled into the app and are
// NOT secrets. The app JWT and any real secrets never live here.

// Read at call time (not module load) so tests can vary the environment.
export function getApiUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) {
    throw new Error(
      "EXPO_PUBLIC_API_URL is not set — copy mobile/.env.example to mobile/.env"
    );
  }
  return url.replace(/\/+$/, "");
}

export function getGoogleClientId(): string {
  const id = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
  if (!id) {
    throw new Error("EXPO_PUBLIC_GOOGLE_CLIENT_ID is not set");
  }
  return id;
}
