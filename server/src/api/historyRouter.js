// historyRouter.js
import express from "express";
import { pool } from "../db.js";

const router = express.Router();

/**
 * GET /api/history
 * → [{ id, TS, AMOUNT, PNL }]
 */
router.get("/", async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        id,
        TS,
        AMOUNT,
        PNL
      FROM history
      ORDER BY TS ASC
    `);

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
    const { amount } = req.body;
    if (!Number.isFinite(Number(amount))) {
      return res.status(400).json({ error: "amount invalid" });
    }

    const today = new Date().toISOString().slice(0, 10);

    // 이전 값 조회
    const [prevRows] = await pool.query(`SELECT AMOUNT FROM history ORDER BY TS DESC LIMIT 1`);
    const prevAmount = prevRows.length ? Number(prevRows[0].AMOUNT) : null;
    const pnl = prevAmount === null ? 0 : Number(amount) - prevAmount;

    // upsert
    await pool.query(
      `
      INSERT INTO history (TS, AMOUNT, PNL)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        AMOUNT = VALUES(AMOUNT),
        PNL = VALUES(PNL)
      `,
      [today, amount, pnl]
    );

    // 최신 history 다시 읽기 (id 포함)
    const [rows] = await pool.query(`SELECT id, TS, AMOUNT, PNL FROM history ORDER BY TS ASC`);

    res.json({
      history: rows,
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

    // (선택) history 존재 확인: FK가 있으면 없어도 어차피 에러나지만 메시지 깔끔하게
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