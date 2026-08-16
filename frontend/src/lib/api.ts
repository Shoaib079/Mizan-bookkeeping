// Local default: same-origin `/backend-api` (Next rewrite → uvicorn). Direct
// `http://127.0.0.1:8000` often fails in browsers (CORS / local-network blocks).
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "/backend-api";

function assertApiBase(): void {
  const pointsAtLocalApi =
    API_BASE === "http://localhost:8000" ||
    API_BASE === "http://127.0.0.1:8000" ||
    API_BASE === "/backend-api";
  if (
    pointsAtLocalApi &&
    typeof window !== "undefined" &&
    process.env.NODE_ENV === "production"
  ) {
    throw new Error(
      "NEXT_PUBLIC_API_URL must be set for production builds — the app is pointing at a local API",
    );
  }
}

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

function hasContentType(headers: RequestInit["headers"]): boolean {
  if (!headers) return false;
  if (headers instanceof Headers) return headers.has("Content-Type");
  if (Array.isArray(headers)) {
    return headers.some(([name]) => name.toLowerCase() === "content-type");
  }
  return Object.keys(headers).some(
    (name) => name.toLowerCase() === "content-type",
  );
}

/**
 * `Content-Type: application/json` for a JSON body, unless the caller set one.
 *
 * Thirty-odd call sites were passing this header by hand and one was not.
 * `fetch` with a string body defaults to `text/plain`, FastAPI refuses to read
 * the body as JSON, and the reply is a 422 that names a field the caller did
 * send. That is how `POST /ledger/entries/actions` had been failing in
 * production since the day it shipped — every Edit and Void button on the
 * partner page missing, for a week, with nothing on screen saying so.
 *
 * Neither test layer could see it: the frontend mocks `apiFetch`, and the
 * backend's TestClient uses `json=`, which sets the header itself. The seam
 * between them was the one place nothing looked.
 *
 * Set here rather than in each caller so the next one cannot forget. A
 * `FormData` body is left alone on purpose — the browser has to set that
 * header itself, because only it knows the multipart boundary.
 */
function resolveContentType(init?: ApiFetchInit): Record<string, string> {
  if (!init?.body || typeof init.body !== "string") return {};
  if (hasContentType(init.headers)) return {};
  return { "Content-Type": "application/json" };
}

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

async function parseErrorBody(
  response: Response,
): Promise<{ message: string; detail?: unknown }> {
  try {
    const body = await response.json();
    if (typeof body.detail === "string") {
      return { message: body.detail, detail: body.detail };
    }
    if (body.detail?.message) {
      return {
        message: String(body.detail.message),
        detail: body.detail,
      };
    }
    return {
      message: JSON.stringify(body.detail ?? body),
      detail: body.detail,
    };
  } catch {
    return { message: response.statusText };
  }
}

export async function apiFetch<T>(
  path: string,
  init?: ApiFetchInit,
): Promise<T> {
  assertApiBase();
  const { idempotencyKey: _key, ...fetchInit } = init ?? {};
  void _key;
  const maxAttempts = authHeaderProvider ? AUTH_401_MAX_ATTEMPTS : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const authHeaders = authHeaderProvider ? await authHeaderProvider() : {};
    let response: Response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        ...fetchInit,
        headers: {
          ...authHeaders,
          ...resolveContentType(init),
          ...resolveIdempotencyKey(init),
          ...(fetchInit.headers ?? {}),
        },
      });
    } catch (err) {
      const hint =
        err instanceof Error ? err.message : "Request failed before a response";
      throw new ApiError(
        `Could not reach the API (${API_BASE}). ${hint}. Check NEXT_PUBLIC_API_URL, API CORS_ORIGINS for this site, and the browser Network tab for the POST.`,
        0,
      );
    }

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

    const { message, detail } = await parseErrorBody(response);
    throw new ApiError(message, response.status, detail);
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
  assertApiBase();
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

    const { message, detail } = await parseErrorBody(response);
    throw new ApiError(message, response.status, detail);
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

/** A path the backend handed us, made absolute for `apiFetch`.
 *
 * `void_path` and its kin arrive as entity-relative strings — the routing
 * table owns them, so the client must not rebuild them from ids it happens to
 * hold. Three call sites wrote this same template inline, which meant three
 * literals that `test_client_paths_resolve.py` cannot resolve (the last
 * segment only exists at runtime) and therefore three exemptions to keep in
 * step. One helper, one exemption.
 */
export function entityPath(entityId: string, backendPath: string): string {
  return `/entities/${entityId}/${backendPath}`;
}

export { API_BASE };
