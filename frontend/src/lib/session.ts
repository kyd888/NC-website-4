const SESSION_STORAGE_KEY = "nc_session_id";
let memorySessionId: string | null = null;

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

export async function fetchWithSession(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers || {});
  const sessionId = readSessionId();
  if (sessionId) {
    headers.set("x-session-id", sessionId);
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

  return response;
}
