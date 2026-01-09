// historyRouter.js
import express from "express";
import { pool } from "../db.js";

const router = express.Router();

/**
 * ✅ 핵심 원인 정리
 * - MySQL TIMESTAMP/DATETIME을 mysql2가 JS Date로 주면, JSON 직렬화 시 항상 ISO(UTC, ...Z)로 나갑니다.
 * - KST 자정(2026-01-09 00:00:00)은 ISO로 2026-01-08T15:00:00.000Z 가 됩니다. (정상)
 * - 프론트가 문자열에서 YYYY-MM-DD를 먼저 잘라버리면 “어제”로 보이는 착시가 생깁니다.
 *
 * ✅ 해결
 * - API 응답의 TS를 "JS Date"가 아니라 "문자열(YYYY-MM-DD, KST 기준)"로 내려준다.
 * - 저장은 KST 기준 오늘(YYYY-MM-DD)로 고정해서 upsert한다.
 */

// ======================================================================
// ✅ KST(Asia/Seoul) 기준 YYYY-MM-DD
// ======================================================================
function todayKstYYYYMMDD(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date); // "YYYY-MM-DD"
}

// ======================================================================
// ✅ TS를 항상 KST 기준 YYYY-MM-DD 문자열로 내려주기
// - timezone table 없어도 동작하도록 "INTERVAL 9 HOUR" 방식 사용
// - TS가 DATE여도 DATE_ADD는 문제 없이 동작(시간만 더해짐)
// - 결과는 문자열이므로 JSON에 ...Z로 나가지 않음
// ======================================================================
const SELECT_HISTORY_SQL = `
  SELECT
    id,
    DATE_FORMAT(DATE_ADD(TS, INTERVAL 9 HOUR), '%Y-%m-%d') AS TS,
    AMOUNT,
    PNL
  FROM history
  ORDER BY TS ASC
`;

/**
 * GET /api/history
 * → [{ id, TS(YYYY-MM-DD, KST), AMOUNT, PNL }]
 */
router.get("/", async (req, res, next) => {
  try {
    const [rows] = await pool.query(SELECT_HISTORY_SQL);
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/history/today
 * body: { amount }
 * → 오늘 값 upsert + PNL 계산
 */
router.post("/today", async (req, res, next) => {
  try {
    const amt = Number(req.body?.amount);
    if (!Number.isFinite(amt)) {
      return res.status(400).json({ error: "amount invalid" });
    }

    // ✅ “오늘”을 KST 날짜 문자열로 고정
    const today = todayKstYYYYMMDD();

    // ✅ 라우터 히트 로그 (서버 콘솔에서 확인)
    console.log("[HISTORY] HIT POST /api/history/today");
    console.log("[HISTORY] now(local):", new Date().toString());
    console.log("[HISTORY] now(iso):  ", new Date().toISOString());
    console.log("[HISTORY] today(KST):", today);

    // ✅ 이전 값 조회(가장 최근 1개)
    // - TS가 Date로 오더라도 PNL 계산은 AMOUNT만 필요
    const [prevRows] = await pool.query(`SELECT AMOUNT FROM history ORDER BY TS DESC LIMIT 1`);
    const prevAmount = prevRows.length ? Number(prevRows[0].AMOUNT) : null;
    const pnl = prevAmount === null ? 0 : amt - prevAmount;

    /**
     * ✅ INSERT 시 TS를 "하루 1개"로 고정
     * - TS 컬럼이 DATE면: 'YYYY-MM-DD'만 넣어도 됨
     * - TS 컬럼이 DATETIME/TIMESTAMP면: 'YYYY-MM-DD 00:00:00'으로 고정
     *
     * 여기서는 안전하게 항상 00:00:00 붙여서 넣습니다.
     * (DATE 컬럼이어도 MySQL이 알아서 DATE로 캐스팅)
     */
    const tsForDb = `${today} 00:00:00`;

    await pool.query(
      `
      INSERT INTO history (TS, AMOUNT, PNL)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        AMOUNT = VALUES(AMOUNT),
        PNL = VALUES(PNL)
      `,
      [tsForDb, amt, pnl]
    );

    // 최신 history 다시 읽기 (TS는 KST YYYY-MM-DD 문자열로 내려줌)
    const [rows] = await pool.query(SELECT_HISTORY_SQL);

    res.json({
      history: rows || [],
      bonus: pnl > 0 ? Math.floor(pnl * 0.1) : 0,
    });
  } catch (e) {
    next(e);
  }
});

// ======================================================================
// ✅ COMMENTS API
// - GET    /api/history/:historyId/comments
// - POST   /api/history/:historyId/comments        { body }
// - PUT    /api/history/comments/:commentId        { body }
// - DELETE /api/history/comments/:commentId
// ======================================================================

// 공용: 안전한 정수 파싱
function toId(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

// GET /api/history/:historyId/comments
router.get("/:historyId/comments", async (req, res, next) => {
  try {
    const historyId = toId(req.params.historyId);
    if (!historyId) return res.status(400).json({ error: "historyId invalid" });

    const [rows] = await pool.query(
      `
      SELECT id, history_id, body, created_at, updated_at
      FROM history_comment
      WHERE history_id = ?
      ORDER BY id DESC
      `,
      [historyId]
    );

    res.json(rows || []);
  } catch (e) {
    next(e);
  }
});

// POST /api/history/:historyId/comments  { body }
router.post("/:historyId/comments", async (req, res, next) => {
  try {
    const historyId = toId(req.params.historyId);
    if (!historyId) return res.status(400).json({ error: "historyId invalid" });

    const body = String(req.body?.body ?? "").trim();
    if (!body) return res.status(400).json({ error: "body required" });

    const [hRows] = await pool.query(`SELECT id FROM history WHERE id = ? LIMIT 1`, [historyId]);
    if (!hRows.length) return res.status(404).json({ error: "history not found" });

    const [ins] = await pool.query(
      `
      INSERT INTO history_comment (history_id, body)
      VALUES (?, ?)
      `,
      [historyId, body]
    );

    const commentId = ins.insertId;

    const [rows] = await pool.query(
      `
      SELECT id, history_id, body, created_at, updated_at
      FROM history_comment
      WHERE id = ?
      LIMIT 1
      `,
      [commentId]
    );

    res.json(rows[0] || null);
  } catch (e) {
    next(e);
  }
});

// PUT /api/history/comments/:commentId  { body }
router.put("/comments/:commentId", async (req, res, next) => {
  try {
    const commentId = toId(req.params.commentId);
    if (!commentId) return res.status(400).json({ error: "commentId invalid" });

    const body = String(req.body?.body ?? "").trim();
    if (!body) return res.status(400).json({ error: "body required" });

    const [upd] = await pool.query(
      `
      UPDATE history_comment
      SET body = ?
      WHERE id = ?
      `,
      [body, commentId]
    );

    if (upd.affectedRows === 0) return res.status(404).json({ error: "comment not found" });

    const [rows] = await pool.query(
      `
      SELECT id, history_id, body, created_at, updated_at
      FROM history_comment
      WHERE id = ?
      LIMIT 1
      `,
      [commentId]
    );

    res.json(rows[0] || null);
  } catch (e) {
    next(e);
  }
});

// DELETE /api/history/comments/:commentId
router.delete("/comments/:commentId", async (req, res, next) => {
  try {
    const commentId = toId(req.params.commentId);
    if (!commentId) return res.status(400).json({ error: "commentId invalid" });

    const [del] = await pool.query(`DELETE FROM history_comment WHERE id = ?`, [commentId]);
    if (del.affectedRows === 0) return res.status(404).json({ error: "comment not found" });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;