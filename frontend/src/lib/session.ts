const SESSION_STORAGE_KEY = "nc_session_id";
// The signed-in token is kept apart from the cart session id on purpose: they
// are different things on the backend, and sharing one slot made logging in
// overwrite the cart's session.
const AUTH_STORAGE_KEY = "nc_auth_token";
let memorySessionId: string | null = null;
let memoryAuthToken: string | null = null;

function readSessionId(): string | null {
  if (typeof window === "undefined") return memorySessionId;
  try {
    const stored = window.localStorage.getItem(SESSION_STORAGE_KEY);
    return stored ?? memorySessionId;
  } catch {
    return memorySessionId;
  }
}

function writeSessionId(id: string | null) {
  memorySessionId = id;
  if (typeof window === "undefined") return;
  try {
    if (id) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, id);
    } else {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // ignore storage failures; memory fallback already updated
  }
}

function readAuthToken(): string | null {
  if (typeof window === "undefined") return memoryAuthToken;
  try {
    return window.localStorage.getItem(AUTH_STORAGE_KEY) ?? memoryAuthToken;
  } catch {
    return memoryAuthToken;
  }
}

export function writeAuthToken(token: string | null) {
  memoryAuthToken = token;
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(AUTH_STORAGE_KEY, token);
    else window.localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // ignore storage failures; memory fallback already updated
  }
}

export async function fetchWithSession(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers || {});
  const sessionId = readSessionId();
  if (sessionId) {
    headers.set("x-session-id", sessionId);
  }
  // Safari blocks the cross-site auth cookie, so the token rides in a header.
  const authToken = readAuthToken();
  if (authToken) {
    headers.set("x-auth-token", authToken);
  }

  const response = await fetch(input, {
    ...init,
    headers,
    credentials: init.credentials ?? "include",
  });

  const newSession = response.headers.get("x-session-id");
  if (newSession) {
    writeSessionId(newSession);
  }
  const newAuth = response.headers.get("x-auth-token");
  if (newAuth) {
    writeAuthToken(newAuth);
  }

  return response;
}
