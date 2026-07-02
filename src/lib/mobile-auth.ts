import { SignJWT, jwtVerify, createRemoteJWKSet, errors } from "jose";

const APP_TOKEN_ISSUER = "payment-tracker-mobile";
const APP_TOKEN_TTL = "30d";
const MIN_SECRET_LENGTH = 32;

// AUTH_SECRET is read at call time, not module load (matters for test setup).
// Enforces a minimum length so misconfiguration fails loudly instead of
// producing brute-forceable tokens.
const secretKey = () => {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error("AUTH_SECRET must be at least 32 characters");
  }
  return new TextEncoder().encode(secret);
};

export interface AppTokenPayload {
  userId: string;
  email: string;
}

// Issues a 30-day HS256 app JWT (issuer "payment-tracker-mobile") signed with AUTH_SECRET.
export async function signAppToken(p: AppTokenPayload): Promise<string> {
  return new SignJWT({ email: p.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(p.userId)
    .setIssuedAt()
    .setIssuer(APP_TOKEN_ISSUER)
    .setExpirationTime(APP_TOKEN_TTL)
    .sign(secretKey());
}

// Verifies an app JWT; returns its payload, or null on any validation failure — never throws.
export async function verifyAppToken(token: string): Promise<AppTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: APP_TOKEN_ISSUER,
      algorithms: ["HS256"],
    });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      return null;
    }
    return { userId: payload.sub, email: payload.email };
  } catch (e) {
    // Routine invalid tokens are expected; anything else (e.g. misconfiguration) is surfaced.
    if (!(e instanceof errors.JOSEError)) {
      console.error("verifyAppToken unexpected error:", e);
    }
    return null;
  }
}

const googleJWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs")
);

export interface GoogleProfile {
  email: string;
  name: string | null;
  picture: string | null;
}

// Accepted client IDs: web (AUTH_GOOGLE_ID) + mobile (GOOGLE_MOBILE_CLIENT_IDS, comma-separated).
const allowedGoogleAudiences = (): string[] =>
  [process.env.AUTH_GOOGLE_ID, ...(process.env.GOOGLE_MOBILE_CLIENT_IDS?.split(",") ?? [])]
    .map((s) => s?.trim())
    .filter((s): s is string => !!s);

// Verifies a Google ID token against Google's JWKS (key injectable for tests);
// returns the profile, or null on any validation failure — never throws.
export async function verifyGoogleIdToken(
  idToken: string,
  getKey: Parameters<typeof jwtVerify>[1] = googleJWKS
): Promise<GoogleProfile | null> {
  try {
    const audience = allowedGoogleAudiences();
    if (audience.length === 0) {
      // Thrown (not returned) so the catch below logs it loudly as a non-JOSEError:
      // an empty allowlist means misconfiguration, not a bad token.
      throw new Error(
        "No Google audiences configured: set AUTH_GOOGLE_ID and/or GOOGLE_MOBILE_CLIENT_IDS"
      );
    }
    const { payload } = await jwtVerify(idToken, getKey, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience,
    });
    if (typeof payload.email !== "string") return null;
    return {
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : null,
      picture: typeof payload.picture === "string" ? payload.picture : null,
    };
  } catch (e) {
    // Routine invalid tokens are expected; anything else (e.g. JWKS/network outage) is surfaced.
    if (!(e instanceof errors.JOSEError)) {
      console.error("verifyGoogleIdToken unexpected error:", e);
    }
    return null;
  }
}
