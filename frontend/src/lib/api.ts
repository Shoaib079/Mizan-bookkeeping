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

export function setAuthHeaderProvider(provider: AuthHeaderProvider | null) {
  authHeaderProvider = provider;
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
  init?: RequestInit,
): Promise<T> {
  const authHeaders = authHeaderProvider ? await authHeaderProvider() : {};
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...authHeaders,
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function documentUrl(entityId: string, intakeId: string): string {
  return `${API_BASE}/entities/${entityId}/expense-receipts/${intakeId}/document`;
}

export { API_BASE };
