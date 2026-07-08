export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  // Called once when the server rejects the token; the app re-runs sign-in.
  onUnauthorized?: () => void | Promise<void>;
  // Injectable for tests; defaults to the global fetch.
  fetchImpl?: typeof fetch;
}

export interface ApiClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  put<T>(path: string, body: unknown): Promise<T>;
  patch<T>(path: string, body: unknown): Promise<T>;
  del<T>(path: string): Promise<T>;
}

// This API returns errors as `{ error: string }` JSON. Extract that message so
// callers surface "Forbidden" to the user, not the raw `{"error":"Forbidden"}`
// blob. Falls back to the raw body (or an HTTP-status label) for non-JSON bodies.
async function errorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.error === "string") return parsed.error;
  } catch {
    // non-JSON body — use the raw text below
  }
  return text || `HTTP ${res.status}`;
}

export function createApiClient(opts: ApiClientOptions): ApiClient {
  const doFetch = opts.fetchImpl ?? fetch;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await opts.getToken();
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");
    if (token) headers.set("authorization", `Bearer ${token}`);

    const res = await doFetch(`${opts.baseUrl}${path}`, { ...init, headers });

    if (res.status === 401) {
      await opts.onUnauthorized?.();
      throw new ApiError(401, "unauthorized");
    }
    if (!res.ok) {
      throw new ApiError(res.status, await errorMessage(res));
    }
    if (res.status === 204) return undefined as T;
    // Assumes every 2xx response from this API has a JSON body (it does today —
    // all routes NextResponse.json(...)); a true empty 200 would throw here.
    return (await res.json()) as T;
  }

  return {
    get<T>(path: string) {
      return request<T>(path);
    },
    post<T>(path: string, body: unknown) {
      return request<T>(path, { method: "POST", body: JSON.stringify(body) });
    },
    put<T>(path: string, body: unknown) {
      return request<T>(path, { method: "PUT", body: JSON.stringify(body) });
    },
    patch<T>(path: string, body: unknown) {
      return request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
    },
    del<T>(path: string) {
      return request<T>(path, { method: "DELETE" });
    },
  };
}
