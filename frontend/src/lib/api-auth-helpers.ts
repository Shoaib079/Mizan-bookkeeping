export const AUTH_LOADED_POLL_MS = 100;
export const AUTH_LOADED_MAX_WAIT_MS = 8000;
export const AUTH_TOKEN_MAX_ATTEMPTS = 3;
export const AUTH_TOKEN_RETRY_DELAY_MS = 100;

export type ClerkAuthState = {
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  getToken: () => Promise<string | null>;
};

export async function resolveClerkAuthHeaders(
  getState: () => ClerkAuthState,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<Record<string, string>> {
  const deadline = Date.now() + AUTH_LOADED_MAX_WAIT_MS;
  while (!getState().isLoaded) {
    if (Date.now() >= deadline) return {};
    await sleep(AUTH_LOADED_POLL_MS);
  }

  const { isSignedIn, getToken } = getState();
  if (!isSignedIn) return {};

  for (let attempt = 0; attempt < AUTH_TOKEN_MAX_ATTEMPTS; attempt += 1) {
    const token = await getToken();
    if (token) return { Authorization: `Bearer ${token}` };
    if (attempt < AUTH_TOKEN_MAX_ATTEMPTS - 1) {
      await sleep(AUTH_TOKEN_RETRY_DELAY_MS);
    }
  }
  return {};
}
