const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type AuthHeaderProvider = () => Promise<Record<string, string>>;

let authHeaderProvider: AuthHeaderProvider | null = null;

/** Retries when Clerk token is not yet available on cold load. */
export const AUTH_401_MAX_ATTEMPTS = 3;
export const AUTH_401_RETRY_DELAY_MS = 500;

export function setAuthHeaderProvider(provider: AuthHeaderProvider | null) {
  authHeaderProvider = provider;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function hasIdempotencyKey(headers: RequestInit["headers"]): boolean {
  if (!headers) return false;
  if (headers instanceof Headers) return headers.has("Idempotency-Key");
  if (Array.isArray(headers)) {
    return headers.some(
      ([name]) => name.toLowerCase() === "idempotency-key",
    );
  }
  return Object.keys(headers).some(
    (name) => name.toLowerCase() === "idempotency-key",
  );
}

export type ApiFetchInit = RequestInit & {
  /** Caller-supplied stable key for this submit intent (mutations only). */
  idempotencyKey?: string;
};

function resolveIdempotencyKey(
  init?: ApiFetchInit,
): Record<string, string> {
  const method = (init?.method ?? "GET").toUpperCase();
  if (!MUTATION_METHODS.has(method)) return {};
  if (init?.idempotencyKey) {
    return { "Idempotency-Key": init.idempotencyKey };
  }
  if (hasIdempotencyKey(init?.headers)) return {};
  return {};
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body.detail === "string") return body.detail;
    if (body.detail?.message) return String(body.detail.message);
    return JSON.stringify(body.detail ?? body);
  } catch {
    return response.statusText;
  }
}

export async function apiFetch<T>(
  path: string,
  init?: ApiFetchInit,
): Promise<T> {
  const { idempotencyKey: _key, ...fetchInit } = init ?? {};
  void _key;
  const maxAttempts = authHeaderProvider ? AUTH_401_MAX_ATTEMPTS : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const authHeaders = authHeaderProvider ? await authHeaderProvider() : {};
    const response = await fetch(`${API_BASE}${path}`, {
      ...fetchInit,
      headers: {
        ...authHeaders,
        ...resolveIdempotencyKey(init),
        ...(fetchInit.headers ?? {}),
      },
    });

    if (response.ok) {
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    }

    if (
      response.status === 401 &&
      authHeaderProvider &&
      attempt < maxAttempts
    ) {
      await sleep(AUTH_401_RETRY_DELAY_MS);
      continue;
    }

    throw new ApiError(await parseError(response), response.status);
  }

  throw new Error("apiFetch exhausted retry attempts");
}

export function documentUrl(entityId: string, intakeId: string): string {
  return `${API_BASE}/entities/${entityId}/expense-receipts/${intakeId}/document`;
}

function parseContentDispositionFilename(
  header: string | null,
): string | null {
  if (!header) return null;
  const quoted = header.match(/filename="([^"]+)"/i);
  if (quoted?.[1]) return quoted[1];
  const unquoted = header.match(/filename=([^;\s]+)/i);
  return unquoted?.[1] ?? null;
}

/** Authenticated binary download (Excel/PDF exports). */
export async function apiDownload(
  path: string,
): Promise<{ blob: Blob; filename: string }> {
  const maxAttempts = authHeaderProvider ? AUTH_401_MAX_ATTEMPTS : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const authHeaders = authHeaderProvider ? await authHeaderProvider() : {};
    const response = await fetch(`${API_BASE}${path}`, { headers: authHeaders });

    if (response.ok) {
      const blob = await response.blob();
      const filename =
        parseContentDispositionFilename(
          response.headers.get("Content-Disposition"),
        ) ?? "download";
      return { blob, filename };
    }

    if (
      response.status === 401 &&
      authHeaderProvider &&
      attempt < maxAttempts
    ) {
      await sleep(AUTH_401_RETRY_DELAY_MS);
      continue;
    }

    throw new ApiError(await parseError(response), response.status);
  }

  throw new Error("apiDownload exhausted retry attempts");
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export { API_BASE };
