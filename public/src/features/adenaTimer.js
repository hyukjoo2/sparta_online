// /src/features/adenaTimer.js
// 치트 방지 아데나 타이머
// - main.js의 awardHourlyAdena / tickAdenaCountdown 로직을 안전하게 모듈화
// - fileLinked=false면 지급 안 함
// - sessionStorage 기반 next_award_at 유지 (새로고침/리로드에도 유지)

export function createAdenaTimerFeature(ctx) {
  const {
    el,
    isFileLinked,     // () => boolean
    awardHourlyAdena, // (missedHours:number) => Promise<void>
    pad2,
  } = ctx;

  const ADENA_HOURLY_MS = 60 * 60 * 1000;
  const ADENA_NEXT_AWARD_AT_KEY = "sparta_adena_next_award_at_ms";

  let adenaAccrualTimer = null;

  function setNextAwardAt(ms) {
    try { sessionStorage.setItem(ADENA_NEXT_AWARD_AT_KEY, String(ms)); } catch {}
  }

  function getNextAwardAt() {
    const v = Number(sessionStorage.getItem(ADENA_NEXT_AWARD_AT_KEY));
    return (Number.isFinite(v) && v > 0) ? v : null;
  }

  function ensureNextAwardAtInitialized() {
    const now = Date.now();
    let t = getNextAwardAt();
    if (t == null) {
      t = now + ADENA_HOURLY_MS;
      setNextAwardAt(t);
    }
    return t;
  }

  function formatCountdownMMSS(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return `${pad2(mm)}:${pad2(ss)}`;
  }

  function tickAdenaCountdown() {
    const now = Date.now();
    const t = ensureNextAwardAtInitialized();
    const diff = Math.max(0, t - now);
    el.adenaTimer.textContent = formatCountdownMMSS(diff);
  }

  function stop() {
    if (adenaAccrualTimer) {
      clearInterval(adenaAccrualTimer);
      adenaAccrualTimer = null;
    }
  }

  function start() {
    stop();
    ensureNextAwardAtInitialized();
    tickAdenaCountdown();

    adenaAccrualTimer = setInterval(async () => {
      const now = Date.now();
      const t0 = ensureNextAwardAtInitialized();

      if (now >= t0) {
        const missed = Math.floor((now - t0) / ADENA_HOURLY_MS) + 1;
        const next = t0 + (missed * ADENA_HOURLY_MS);
        setNextAwardAt(next);

        if (isFileLinked()) {
          try {
            await awardHourlyAdena(missed);
          } catch {
            // awardHourlyAdena 내부에서 로깅 처리
          }
        }
      }

      tickAdenaCountdown();
    }, 250);
  }

  return {
    start,
    stop,
    tickAdenaCountdown,
    ensureNextAwardAtInitialized,
  };
}