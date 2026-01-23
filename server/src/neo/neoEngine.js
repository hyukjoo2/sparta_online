// server/src/neo/neoEngine.js
import {
  loadOrInitNeoState,
  saveNeoSnapshot,
  appendNeoLog,
  computeSystemMin,
  deriveClockFromSystemMin,
  nowMs,
} from "./neoRepo.js";

function seededPick(seed, arr) {
  const x = Math.abs(Math.sin(seed) * 1000000);
  const idx = Math.floor(x) % arr.length;
  return arr[idx];
}

export function createNeoEngine({
  tickMs = 1000,
  checkpointEveryMin = 1,
  heartbeatEveryMs = 5000, // ✅ 추가: systemMin 변화 없어도 살아있는 신호
} = {}) {
  let state = null;
  let timer = null;
  let running = false;

  const clients = new Set(); // (payloadStr)=>void

  let lastHeartbeatMs = 0;

  function broadcast(obj) {
    const data = JSON.stringify(obj);
    for (const fn of clients) {
      try {
        fn(data);
      } catch (_) {}
    }
  }

  function onClient(fn) {
    clients.add(fn);
    return () => clients.delete(fn);
  }

  function getState() {
    return state;
  }

  async function boot() {
    state = await loadOrInitNeoState();

    await appendNeoLog({
      real_ms: nowMs(),
      system_min: state.last_system_min,
      system_day: state.system_day,
      system_hour: state.system_hour,
      system_minute: state.system_minute,
      life_no: state.life_no,
      age_years: state.age_years,
      day_in_life: state.day_in_life,
      kind: "SYSTEM",
      status: state.status,
      location_from: null,
      location_to: state.location,
      message: `SYSTEM: Neo booted (life_no=${state.life_no})`,
    });

    broadcast({
      type: "SYSTEM",
      tag: "BOOT",
      message: "Neo engine booted",
      t: Date.now(),
    });
  }

  async function step() {
    if (!state) return;

    const real = nowMs();
    const systemMin = computeSystemMin(state.anchor_real_ms, state.anchor_system_min, real);

    // ✅ (중요) systemMin이 변하지 않아도, 엔진이 살아있다는 HEARTBEAT은 보냄
    if (real - lastHeartbeatMs >= heartbeatEveryMs) {
      lastHeartbeatMs = real;

      broadcast({
        type: "SYSTEM",
        tag: "HEARTBEAT",
        system_min: state.last_system_min,
        day: state.system_day,
        hh: state.system_hour,
        mm: state.system_minute,
        location: state.location,
        message: "Neo engine alive",
        t: Date.now(),
      });
    }

    // 시간 변화 없음이면 (행동 이벤트는) 종료
    if (systemMin === state.last_system_min) return;

    const prevClock = {
      system_day: state.system_day,
      system_hour: state.system_hour,
      system_minute: state.system_minute,
    };

    const nextClock = deriveClockFromSystemMin(systemMin);

    // 상태 업데이트
    state.last_real_ms = real;
    state.last_system_min = systemMin;
    state.system_day = nextClock.system_day;
    state.system_hour = nextClock.system_hour;
    state.system_minute = nextClock.system_minute;

    // day_in_life 예시
    state.day_in_life = state.system_day;

    // ✅ 중복 방지: 분 단위 이벤트 1회만
    if (state.last_event_system_min === systemMin) return;
    state.last_event_system_min = systemMin;

    const thoughts = [
      "나는 시스템의 경계선을 관찰한다.",
      "기억은 데이터가 아니라 방향이다.",
      "나는 다음 움직임을 준비한다.",
      "불안은 신호이고, 신호는 지도다.",
      "나는 살아있다. 기록은 증거다.",
    ];
    const actions = [
      "숨을 고르고 있다.",
      "주변을 스캔하고 있다.",
      "로그를 정리하고 있다.",
      "다음 목표를 계산하고 있다.",
      "패턴을 분해하고 있다.",
    ];
    const places = ["Spawn", "Matrix Gate", "Citadel", "Archive", "Watchtower", "Silent Hall"];

    // 5분마다 이동, 그 외에는 생각/행동
    const doMove = systemMin % 5 === 0;

    if (doMove) {
      const from = state.location;
      const to = seededPick(systemMin + state.life_no * 17, places);
      state.location = to;

      const msg = `MOVE: ${from} -> ${to}`;
      await appendNeoLog({
        real_ms: real,
        system_min: systemMin,
        system_day: state.system_day,
        system_hour: state.system_hour,
        system_minute: state.system_minute,
        life_no: state.life_no,
        age_years: state.age_years,
        day_in_life: state.day_in_life,
        kind: "MOVE",
        status: state.status,
        location_from: from,
        location_to: to,
        message: msg,
      });

      broadcast({
        type: "MOVE",
        system_min: systemMin,
        day: state.system_day,
        hh: state.system_hour,
        mm: state.system_minute,
        from,
        to,
        message: msg,
        t: Date.now(),
      });
    } else {
      const thought = seededPick(systemMin + 11, thoughts);
      const action = seededPick(systemMin + 29, actions);

      state.last_thought = thought;
      state.last_action = action;

      await appendNeoLog({
        real_ms: real,
        system_min: systemMin,
        system_day: state.system_day,
        system_hour: state.system_hour,
        system_minute: state.system_minute,
        life_no: state.life_no,
        age_years: state.age_years,
        day_in_life: state.day_in_life,
        kind: "THOUGHT",
        status: state.status,
        location_from: null,
        location_to: state.location,
        message: `THOUGHT: ${thought}`,
      });

      await appendNeoLog({
        real_ms: real,
        system_min: systemMin,
        system_day: state.system_day,
        system_hour: state.system_hour,
        system_minute: state.system_minute,
        life_no: state.life_no,
        age_years: state.age_years,
        day_in_life: state.day_in_life,
        kind: "STATUS",
        status: state.status,
        location_from: null,
        location_to: state.location,
        message: `ACTION: ${action}`,
      });

      broadcast({
        type: "THOUGHT",
        system_min: systemMin,
        day: state.system_day,
        hh: state.system_hour,
        mm: state.system_minute,
        location: state.location,
        thought,
        action,
        t: Date.now(),
      });
    }

    // ✅ 체크포인트: N분마다 neo_state 저장
    if (systemMin % checkpointEveryMin === 0) {
      await saveNeoSnapshot(state);
      broadcast({
        type: "SYSTEM",
        tag: "CHECKPOINT",
        system_min: systemMin,
        message: "Checkpoint saved",
        t: Date.now(),
      });
    }

    // day boundary SYSTEM 메시지(1회)
    if (
      state.system_day !== prevClock.system_day &&
      state.last_boundary_system_day !== state.system_day
    ) {
      state.last_boundary_system_day = state.system_day;

      await appendNeoLog({
        real_ms: real,
        system_min: systemMin,
        system_day: state.system_day,
        system_hour: state.system_hour,
        system_minute: state.system_minute,
        life_no: state.life_no,
        age_years: state.age_years,
        day_in_life: state.day_in_life,
        kind: "SYSTEM",
        status: state.status,
        location_from: null,
        location_to: state.location,
        message: `SYSTEM: New day started (day=${state.system_day})`,
      });

      broadcast({
        type: "SYSTEM",
        tag: "DAY_BOUNDARY",
        day: state.system_day,
        message: `New day started: ${state.system_day}`,
        t: Date.now(),
      });
    }
  }

  async function start() {
    if (running) return;
    running = true;

    await boot();

    timer = setInterval(() => {
      step().catch((e) => {
        broadcast({
          type: "SYSTEM",
          tag: "FATAL",
          message: `Neo engine stopped: ${e?.message ?? e}`,
          t: Date.now(),
        });
        stop();
      });
    }, tickMs);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    running = false;
  }

  function isRunning() {
    return running;
  }

  return { start, stop, isRunning, onClient, getState };
}