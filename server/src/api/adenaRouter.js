import express from "express";
import { pool } from "../db.js";

const router = express.Router();

// 예시: adena 테이블에서 1행 가져오기 (형님 테이블 구조에 맞게 SQL만 바꾸면 됨)
router.get("/", async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT adena FROM adena LIMIT 1");
    const adena = rows?.[0]?.adena ?? 0;
    res.json({ adena: Number(adena) });
  } catch (e) {
    next(e);
  }
});

export default router;