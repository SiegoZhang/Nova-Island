import { beforeEach, describe, expect, it, vi } from "vitest";

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
  };
}

async function loadStore(
  storage = createStorage(),
  BroadcastChannel?: typeof globalThis.BroadcastChannel,
) {
  vi.resetModules();
  vi.stubGlobal("window", { localStorage: storage, BroadcastChannel });
  const store = await import("@/services/api/auth-store");
  return { storage, store };
}

describe("auth-store", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("首次访问时清除 localStorage 中的旧 token，且不再恢复到内存", async () => {
    const { storage, store } = await loadStore(
      createStorage({
        "nova.accessToken": "legacy-access",
        "nova.refreshToken": "legacy-refresh",
      }),
    );

    expect(store.getAccessToken()).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith("nova.accessToken");
    expect(storage.removeItem).toHaveBeenCalledWith("nova.refreshToken");

    store.getAccessToken();
    expect(storage.removeItem).toHaveBeenCalledTimes(2);
  });

  it("access token 只写入内存并通知订阅者", async () => {
    const { storage, store } = await loadStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.setAccessToken("access-token");

    expect(store.getAccessToken()).toBe("access-token");
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.clearAccessToken();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("清除 access token 后使内存会话失效并通知订阅者", async () => {
    const { store } = await loadStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.setAccessToken("access-token");
    listener.mockClear();

    store.clearAccessToken();

    expect(store.getAccessToken()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("主动登出通过 BroadcastChannel 通知其他标签页", async () => {
    const postMessage = vi.fn();
    let onMessage: ((event: MessageEvent<{ type: "logout" }>) => void) | undefined;
    class FakeBroadcastChannel {
      postMessage = postMessage;

      addEventListener(
        _type: string,
        listener: (event: MessageEvent<{ type: "logout" }>) => void,
      ) {
        onMessage = listener;
      }
    }
    const { store } = await loadStore(
      createStorage(),
      FakeBroadcastChannel as unknown as typeof globalThis.BroadcastChannel,
    );
    const listener = vi.fn();
    store.subscribe(listener);
    store.setAccessToken("access-token");
    listener.mockClear();

    store.clearSession();

    expect(store.getAccessToken()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({ type: "logout" });

    store.setAccessToken("another-access");
    listener.mockClear();
    onMessage?.({ data: { type: "logout" } } as MessageEvent<{
      type: "logout";
    }>);
    expect(store.getAccessToken()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
