// /src/app/api.js
import { API_ORIGIN_KEY, API_PROBE_PORTS, API_PATH_PROBE } from "/src/app/constants.js";

function getSavedApiOrigin() {
  const v = (localStorage.getItem(API_ORIGIN_KEY) || "").trim();
  return v || null;
}
function setSavedApiOrigin(origin) {
  try {
    localStorage.setItem(API_ORIGIN_KEY, origin);
  } catch {}
}
function currentOrigin() {
  return window.location.origin;
}

export function apiUrl(path) {
  const saved = getSavedApiOrigin();
  const origin = saved || currentOrigin();
  if (!path.startsWith("/")) path = "/" + path;
  return origin + path;
}

export async function fetchJsonStrict(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(url + " 로드 실패: " + res.status);

  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("application/json")) {
    const txt = await res.text();
    throw new Error(`${url} 가 JSON이 아니라 HTML/텍스트를 반환했습니다.\n` + txt.slice(0, 120));
  }
  return await res.json();
}

async function tryFetchJson(path) {
  const url = apiUrl(path);
  return await fetchJsonStrict(url);
}

export async function detectApiOriginIfNeeded() {
  const saved = getSavedApiOrigin();
  if (saved) return saved;

  try {
    await fetchJsonStrict(currentOrigin() + API_PATH_PROBE);
    setSavedApiOrigin(currentOrigin());
    return currentOrigin();
  } catch {}

  const { protocol, hostname } = window.location;
  for (const port of API_PROBE_PORTS) {
    const origin = `${protocol}//${hostname}:${port}`;
    try {
      await fetchJsonStrict(origin + API_PATH_PROBE);
      setSavedApiOrigin(origin);
      return origin;
    } catch {}
  }
  return null;
}

// ===== DB APIs =====
export async function apiGetAllTablesBundled() {
  try {
    return await tryFetchJson("/api/all");
  } catch (e1) {
    try {
      return await tryFetchJson("/api/bootstrap");
    } catch (e2) {
      return null;
    }
  }
}

export async function apiGetAllTablesSplit() {
  const [ad, hi, bm, bl] = await Promise.all([
    tryFetchJson("/api/adena"),
    tryFetchJson("/api/history"),
    tryFetchJson("/api/bgmusic"),
    tryFetchJson("/api/bglist"),
  ]);

  const adenaVal = Number(ad?.adena ?? 0);
  const historyArr = Array.isArray(hi) ? hi : Array.isArray(hi?.history) ? hi.history : [];
  const bgmusicArr = Array.isArray(bm) ? bm : Array.isArray(bm?.bgmusic) ? bm.bgmusic : [];
  const bglistArr = Array.isArray(bl) ? bl : Array.isArray(bl?.bglist) ? bl.bglist : [];
  return { adena: adenaVal, history: historyArr, bgmusic: bgmusicArr, bglist: bglistArr };
}

export async function apiGetAllTables() {
  const bundled = await apiGetAllTablesBundled();
  if (bundled && typeof bundled === "object") return bundled;

  try {
    return await apiGetAllTablesSplit();
  } catch (splitErr) {
    try {
      return await tryFetchJson("/api/price");
    } catch (priceErr) {
      throw splitErr;
    }
  }
}

export async function apiSaveTodayAmount(amount) {
  const url = apiUrl("/api/history/today");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount }),
  });
  if (!res.ok) throw new Error("오늘 값 저장 실패: " + res.status);
  return await res.json();
}

export async function apiAdenaDelta(delta) {
  const url = apiUrl("/api/adena/delta");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delta }),
  });
  if (!res.ok) throw new Error("adena delta 실패: " + res.status);
  return await res.json();
}

// ===== chat_log APIs =====
export async function apiPostChatLog(message) {
  const url = apiUrl("/api/chat_log");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`chat_log save failed: HTTP ${res.status}\n${txt.slice(0, 200)}`);
  }
}

export async function apiGetChatLogRecent(limit = 200) {
  return await tryFetchJson(`/api/chat_log?limit=${encodeURIComponent(String(limit))}`);
}

export async function apiSearchChatLog(q, limit = 200) {
  const qq = String(q || "").trim();
  if (!qq) return [];
  return await tryFetchJson(
    `/api/chat_log/search?q=${encodeURIComponent(qq)}&limit=${encodeURIComponent(String(limit))}`
  );
}

// public/src/app/api.js

export function getApiOrigin() {
  // 이미 형님 프로젝트에 origin 계산이 있으면 그걸 써도 됩니다.
  // 없으면 아래처럼 고정:
  return "http://localhost:6431";
}

export function connectNeoSSE({ origin, onMessage, onStatus }) {
  const apiOrigin = origin || getApiOrigin();
  const url = `${apiOrigin}/api/neo/stream`;

  let es = null;
  let closed = false;
  let reconnectTimer = null;

  const logStatus = (msg) => {
    try {
      onStatus?.(msg);
    } catch (_) {}
  };

  const connect = () => {
    if (closed) return;
    if (es) {
      try {
        es.close();
      } catch (_) {}
      es = null;
    }

    logStatus(`[SYSTEM] SSE connecting... ${url}`);

    es = new EventSource(url);

    es.onopen = () => {
      logStatus("[SYSTEM] SSE opened");
    };

    es.onmessage = (ev) => {
      // 서버는 data: JSON 형태로 보냄
      try {
        const data = JSON.parse(ev.data);
        onMessage?.(data);
      } catch (e) {
        // JSON 아닐 때도 찍어주기
        onMessage?.({ type: "SYSTEM", message: String(ev.data) });
      }
    };

    es.onerror = () => {
      logStatus("[SYSTEM] SSE error (will reconnect)");
      try {
        es.close();
      } catch (_) {}
      es = null;

      if (!closed && !reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, 1200);
      }
    };
  };

  connect();

  return {
    close() {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      if (es) {
        try {
          es.close();
        } catch (_) {}
      }
      es = null;
      logStatus("[SYSTEM] SSE closed");
    },
  };
}