// public/src/app/neoClient.js
export function createNeoClient({ appendLog }) {
  let es = null;
  let lastMsgAt = 0;
  let watchdog = null;

  function log(s) {
    try {
      appendLog?.(s);
    } catch (_) {}
  }

  function pad2(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "??";
    return String(n).padStart(2, "0");
  }

  // system_day(1부터 시작)를 "태어난 뒤 경과 년"으로 해석
  // 1일차=0년차, 2일차=1년차 ... (원하시면 기준 바꿔드릴게요)
  function deriveAgeYYMM({ day, hh, age_years }) {
    // year
    let y = Number.isFinite(Number(age_years)) ? Number(age_years) : null;
    if (y == null) {
      const d = Number(day);
      y = Number.isFinite(d) ? Math.max(0, d - 1) : 0;
    }

    // month: 하루 24시간을 12개월로 매핑 => 2시간 = 1개월
    const h = Number(hh);
    const m = Number.isFinite(h) ? Math.max(0, Math.min(23, h)) : 0;
    const mm = Math.floor(m / 2); // 0..11
    return { y, mm };
  }

  function normalizeMessage(msg) {
    const s = String(msg ?? "").trim();
    return s.replace(/\s+/g, " ");
  }

  function formatLine(obj) {
    const type = String(obj?.type || "").toUpperCase();
    const kind = String(obj?.kind || obj?.type || "NEO").toUpperCase();

    const lifeNo = Number(obj?.life_no ?? obj?.lifeNo);
    const lifeTag = Number.isFinite(lifeNo) && lifeNo > 0 ? `${lifeNo}번째 Neo` : "Neo";

    const day = obj?.day ?? obj?.system_day;
    const hh = obj?.hh ?? obj?.system_hour;
    const mm = obj?.mm ?? obj?.system_minute;

    const { y, mm: ageM } = deriveAgeYYMM({ day, hh, age_years: obj?.age_years });

    const timeStr = `${pad2(hh)}:${pad2(mm)}`;
    const ageStr = `${y}-${ageM}`; // 예: 3-12 (12는 0~11이라면 3-11이 최대. 원하면 1~12로 바꿔드림)

    // message 우선
    const message = normalizeMessage(obj?.message);

    // THOUGHT/STATUS/MOVE는 그대로 출력
    if (type === "MOVE") {
      return `[${lifeTag}] ${ageStr} ${timeStr} / MOVE: ${message.replace(/^MOVE:\s*/i, "")}`.trim();
    }
    if (type === "THOUGHT") {
      // 서버가 thought/action을 따로 주는 경우도 지원
      const thought = normalizeMessage(obj?.thought);
      const action = normalizeMessage(obj?.action);

      if (thought || action) {
        // 요청하신 포맷은 THOUGHT 한 줄이지만, action도 같이 보고 싶으면 두 줄로
        const out1 = `[${lifeTag}] ${ageStr} ${timeStr} / THOUGHT: ${thought || message.replace(/^THOUGHT:\s*/i, "")}`.trim();
        if (!action) return out1;
        const out2 = `[${lifeTag}] ${ageStr} ${timeStr} / ACTION: ${action}`.trim();
        return out1 + "\n" + out2;
      }

      return `[${lifeTag}] ${ageStr} ${timeStr} / THOUGHT: ${message.replace(/^THOUGHT:\s*/i, "")}`.trim();
    }
    if (type === "STATUS") {
      // 예: ACTION 로그(kind=STATUS, message="ACTION: ...") 같은 것
      // 그냥 STATUS로 찍되 메시지 prefix 유지
      return `[${lifeTag}] ${ageStr} ${timeStr} / ${message || "STATUS"}`.trim();
    }

    // SYSTEM은 너무 시끄러우면 필터링
    if (type === "SYSTEM") {
      const tag = normalizeMessage(obj?.tag);
      const msg = normalizeMessage(obj?.message);
      const out = `[SYSTEM] ${tag} ${msg}`.trim();

      // ✅ 원하신대로 HEARTBEAT / PING 같은 건 안 찍기
      if (tag === "HEARTBEAT" || tag === "PING" || tag === "CHECKPOINT") return null;
      return out;
    }

    // fallback
    return `[${kind}] ${normalizeMessage(obj)}`;
  }

  function start() {
    if (es) return;

    const url = "/api/neo/stream";
    log(`[NEO] SSE connecting... ${url}`);

    es = new EventSource(url);
    lastMsgAt = Date.now();

    // 아무 것도 안 오는지 체크하는 워치독 (필요하면 끄셔도 됨)
    watchdog = setInterval(() => {
      const gap = Date.now() - lastMsgAt;
      if (gap > 15000) {
        log(`[NEO] (watchdog) no SSE message for ${Math.floor(gap / 1000)}s...`);
      }
    }, 5000);

    es.onopen = () => {
      lastMsgAt = Date.now();
      // 원하면 OPEN 로그도 숨길 수 있음
      // log("[SYSTEM] SSE_OPENED Neo stream opened");
    };

    es.onmessage = (ev) => {
      lastMsgAt = Date.now();

      try {
        const obj = JSON.parse(ev.data);
        const line = formatLine(obj);
        if (line) log(line);
      } catch (_) {
        // JSON 아닌 경우 그대로
        log(`[NEO] ${String(ev.data ?? "").trim()}`);
      }
    };

    es.onerror = () => {
      const rs = es?.readyState;
      const state =
        rs === 0 ? "CONNECTING" : rs === 1 ? "OPEN" : rs === 2 ? "CLOSED" : `?(${rs})`;
      log(`[SYSTEM] ❌ Neo SSE error (EventSource) readyState=${state}`);
    };
  }

  function stop() {
    if (watchdog) clearInterval(watchdog);
    watchdog = null;

    if (!es) return;
    try {
      es.close();
    } catch (_) {}
    es = null;
    log("[SYSTEM] SSE_CLOSED Neo stream closed");
  }

  return { start, stop };
}