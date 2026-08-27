const ACCESS_KEY = "nova.accessToken";
const REFRESH_KEY = "nova.refreshToken";
const AUTH_CHANNEL = "nova.auth";

type Listener = () => void;
type AuthMessage = { type: "logout" };

let accessToken: string | null = null;
let legacyStorageCleared = false;
let channel: BroadcastChannel | null = null;
const listeners = new Set<Listener>();

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function clearLegacyStorage(): void {
  if (legacyStorageCleared || !isBrowser()) return;
  legacyStorageCleared = true;
  try {
    window.localStorage.removeItem(ACCESS_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
  } catch {
    // localStorage 不可用时忽略；新 token 只保存在当前页面内存。
  }
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

function ensureChannel(): BroadcastChannel | null {
  if (channel || !isBrowser() || !window.BroadcastChannel) return channel;
  channel = new window.BroadcastChannel(AUTH_CHANNEL);
  channel.addEventListener("message", (event: MessageEvent<AuthMessage>) => {
    if (event.data?.type !== "logout") return;
    accessToken = null;
    notify();
  });
  return channel;
}

export function getAccessToken(): string | null {
  clearLegacyStorage();
  ensureChannel();
  return accessToken;
}

export function setAccessToken(token: string): void {
  clearLegacyStorage();
  ensureChannel();
  accessToken = token;
  notify();
}

export function clearAccessToken(): void {
  clearLegacyStorage();
  accessToken = null;
  notify();
}

export function clearSession(): void {
  clearAccessToken();
  ensureChannel()?.postMessage({ type: "logout" } satisfies AuthMessage);
}

/** 订阅当前页面内 access token 变化。返回取消订阅函数。 */
export function subscribe(listener: Listener): () => void {
  ensureChannel();
  listeners.add(listener);
  return () => listeners.delete(listener);
}
