// /src/features/sessionTimer.js
// 접속 시간 타이머 (페이지 내 상태 유지 + sessionStorage 기반으로 재진입에도 동일 세션 유지)
// - "저장/리로드로 사이트 전체 리프레시"가 없다는 전제에서 접속 시간 타이머는 리셋되면 안됨
// - sessionStorage에 최초 접속 시각 저장 → 새로고침을 해도 같은 탭에서는 유지

export function createSessionTimerFeature(ctx) {
  const { onTick } = ctx || {};
  const KEY = "sparta_session_started_at_ms";

  function ensureStartAt() {
    const v = Number(sessionStorage.getItem(KEY));
    if (Number.isFinite(v) && v > 0) return v;
    const now = Date.now();
    try { sessionStorage.setItem(KEY, String(now)); } catch {}
    return now;
  }

  function getUptimeMs() {
    const startAt = ensureStartAt();
    return Math.max(0, Date.now() - startAt);
  }

  function formatUptime(ms) {
    const sec = Math.floor(ms / 1000);
    const hh = Math.floor(sec / 3600);
    const mm = Math.floor((sec % 3600) / 60);
    const ss = sec % 60;
    const pad2 = (n) => String(n).padStart(2, "0");
    return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
  }

  let timer = null;

  function start() {
    ensureStartAt();
    stop();
    timer = setInterval(() => {
      if (typeof onTick === "function") {
        onTick({ uptimeMs: getUptimeMs(), text: formatUptime(getUptimeMs()) });
      }
    }, 500);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return {
    start,
    stop,
    getUptimeMs,
    formatUptime,
  };
}