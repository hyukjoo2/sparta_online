// server/src/neo/neoRouter.js
import express from "express";
import { readNeoLog } from "./neoRepo.js";

export function createNeoRouter({ engine }) {
  const router = express.Router();

  // health
  router.get("/health", (req, res) => {
    res.json({
      ok: true,
      running: engine?.isRunning?.() ?? false,
      t: Date.now(),
    });
  });

  // state snapshot
  router.get("/state", (req, res) => {
    const s = engine.getState?.();
    if (!s) return res.status(503).json({ ok: false, error: "Neo not ready" });
    res.json({ ok: true, state: s });
  });

  // log
  router.get("/log", async (req, res) => {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit ?? 100) || 100));
    const rows = await readNeoLog(limit);
    res.json({ ok: true, rows });
  });

  // SSE stream
  router.get("/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    // (선택) 프록시 버퍼링 방지용
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const sendObj = (obj) => {
      try {
        res.write(`data: ${JSON.stringify(obj)}\n\n`);
      } catch (_) {}
    };

    // ✅ 연결 즉시 SYSTEM 메시지
    sendObj({
      type: "SYSTEM",
      tag: "SSE_CONNECTED",
      message: "SSE connected",
      ts: Date.now(),
    });

    // ✅ (선택) 현재 상태 스냅샷 1회 (n번째 Neo, 시간 등 UI 준비용)
    try {
      const s = engine.getState?.();
      if (s) {
        sendObj({
          type: "SYSTEM",
          tag: "STATE_SNAPSHOT",
          life_no: s.life_no,
          age_years: s.age_years,
          day: s.system_day,
          hh: s.system_hour,
          mm: s.system_minute,
          status: s.status,
          location: s.location,
          ts: Date.now(),
        });
      }
    } catch (_) {}

    // ✅ PING은 "주석 라인"으로 보내면 EventSource.onmessage로 안 들어가서
    //    프론트 채팅창에 안 찍히면서도 연결 유지가 됨
    const pingTimer = setInterval(() => {
      try {
        res.write(`: ping ${Date.now()}\n\n`);
      } catch (_) {}
    }, 15000);

    // 엔진 이벤트 구독
    const unsub = engine.onClient((jsonStr) => {
      try {
        const obj = JSON.parse(jsonStr);

        // 프론트 표시 안정화를 위해 필드 보강
        const s = engine.getState?.() || null;

        const enriched = {
          ...obj,
          // 핵심: n번째 Neo / 나이 / 시스템 시계가 항상 있도록
          life_no: obj.life_no ?? s?.life_no,
          age_years: obj.age_years ?? s?.age_years,
          day: obj.day ?? obj.system_day ?? s?.system_day,
          hh: obj.hh ?? obj.system_hour ?? s?.system_hour,
          mm: obj.mm ?? obj.system_minute ?? s?.system_minute,
          ts: obj.ts ?? obj.t ?? Date.now(),
        };

        sendObj(enriched);
      } catch (_) {
        // JSON 깨짐 대비 (원문을 SYSTEM으로 남김)
        sendObj({
          type: "SYSTEM",
          tag: "BAD_EVENT",
          message: String(jsonStr),
          ts: Date.now(),
        });
      }
    });

    req.on("close", () => {
      try {
        clearInterval(pingTimer);
      } catch (_) {}
      try {
        unsub();
      } catch (_) {}
    });
  });

  return router;
}