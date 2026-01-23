// server/src/app.js
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { pool } from "./db.js";

// ✅ NEO
import { createNeoEngine } from "./neo/neoEngine.js";
import { createNeoRouter } from "./neo/neoRouter.js";

dotenv.config();

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =========================
// Middleware
// =========================
app.use(cors());
app.use(express.json());

// =========================
// Static files
// =========================
const publicDir = path.join(__dirname, "..", "..", "public");
app.use(express.static(publicDir));

// =========================
// Helpers
// =========================
async function tableExists(tableName) {
  const sql = `
    SELECT COUNT(*) AS cnt
    FROM information_schema.tables
    WHERE table_schema = ?
      AND table_name = ?
  `;
  const dbName = process.env.DB_NAME || process.env.MYSQL_DATABASE || process.env.DATABASE || "";
  if (!dbName) {
    console.warn("[DB] DB_NAME is empty. Please set DB_NAME in .env");
    return false;
  }

  const [rows] = await pool.query(sql, [dbName, tableName]);
  return Number(rows?.[0]?.cnt || 0) > 0;
}

async function getTableColumns(tableName) {
  const [rows] = await pool.query(`SHOW COLUMNS FROM \`${tableName}\``);
  return (rows || []).map((r) => r.Field);
}

function pickFirstExistingColumn(columns, candidates) {
  const lowerMap = new Map(columns.map((c) => [String(c).toLowerCase(), c]));
  for (const cand of candidates) {
    const found = lowerMap.get(String(cand).toLowerCase());
    if (found) return found;
  }
  return null;
}

async function readPathListFromDB(tableName) {
  try {
    if (!(await tableExists(tableName))) return [];

    const cols = await getTableColumns(tableName);

    const valueCol = pickFirstExistingColumn(cols, [
      "path",
      "url",
      "src",
      "file",
      "filename",
      "name",
      "value",
      "text",
    ]);

    if (!valueCol) {
      console.warn(`[DB] ${tableName}: usable column not found. columns=`, cols);
      return [];
    }

    const hasId = cols.some((c) => String(c).toLowerCase() === "id");
    const orderBy = hasId ? " ORDER BY `id` ASC" : "";

    const [rows] = await pool.query(`SELECT \`${valueCol}\` AS v FROM \`${tableName}\`${orderBy}`);

    return (rows || [])
      .map((r) => r?.v)
      .filter((v) => typeof v === "string" && v.trim())
      .map((v) => v.trim());
  } catch (e) {
    console.error(`[DB] ${tableName} read failed:`, e?.message || e);
    return [];
  }
}

// ======================================================================
// ✅ KST(Asia/Seoul) 기준 YYYY-MM-DD
// ======================================================================
function todayKstYYYYMMDD(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
function todayTS() {
  return todayKstYYYYMMDD();
}

async function readAdenaFromDB() {
  const forcedTable = (process.env.ADENA_TABLE || "").trim();
  const forcedCol = (process.env.ADENA_COLUMN || "").trim();

  if (forcedTable && forcedCol) {
    if (await tableExists(forcedTable)) {
      const [rows] = await pool.query(
        `SELECT \`${forcedCol}\` AS adena FROM \`${forcedTable}\` LIMIT 1`
      );
      const v = rows?.[0]?.adena;
      return { adena: Number(v ?? 0), source: `${forcedTable}.${forcedCol}` };
    }
    return {
      adena: 0,
      source: "env-specified-but-table-missing",
      warning: `Table not found: ${forcedTable}`,
    };
  }

  const attempts = [
    {
      name: "adena(adena)",
      check: async () => await tableExists("adena"),
      run: async () => {
        const [rows] = await pool.query("SELECT adena AS adena FROM adena LIMIT 1");
        return rows?.[0]?.adena;
      },
    },
    {
      name: "adena(amount)",
      check: async () => await tableExists("adena"),
      run: async () => {
        const [rows] = await pool.query("SELECT amount AS adena FROM adena LIMIT 1");
        return rows?.[0]?.adena;
      },
    },
    {
      name: "user_state(adena)",
      check: async () => await tableExists("user_state"),
      run: async () => {
        const [rows] = await pool.query("SELECT adena AS adena FROM user_state LIMIT 1");
        return rows?.[0]?.adena;
      },
    },
    {
      name: "settings(key/value)",
      check: async () => await tableExists("settings"),
      run: async () => {
        const [rows] = await pool.query(
          "SELECT value AS adena FROM settings WHERE `key`='adena' LIMIT 1"
        );
        return rows?.[0]?.adena;
      },
    },
    {
      name: "config(key/value)",
      check: async () => await tableExists("config"),
      run: async () => {
        const [rows] = await pool.query(
          "SELECT value AS adena FROM config WHERE `key`='adena' LIMIT 1"
        );
        return rows?.[0]?.adena;
      },
    },
    {
      name: "kv(key/value)",
      check: async () => await tableExists("kv"),
      run: async () => {
        const [rows] = await pool.query("SELECT value AS adena FROM kv WHERE `key`='adena' LIMIT 1");
        return rows?.[0]?.adena;
      },
    },
  ];

  for (const a of attempts) {
    try {
      if (!(await a.check())) continue;
      const v = await a.run();
      if (v !== undefined && v !== null && v !== "") {
        return { adena: Number(v), source: a.name };
      }
    } catch {
      // next attempt
    }
  }

  return {
    adena: 0,
    source: "not-found",
    warning:
      "Adena source table/column not found automatically. Set ADENA_TABLE and ADENA_COLUMN in .env for 정확히 연결.",
  };
}

async function applyAdenaDelta(delta) {
  const d = Number(delta);
  if (!Number.isFinite(d)) throw new Error("delta must be a number");

  const forcedTable = (process.env.ADENA_TABLE || "").trim();
  const forcedCol = (process.env.ADENA_COLUMN || "").trim();

  if (forcedTable && forcedCol) {
    if (!(await tableExists(forcedTable))) {
      throw new Error(`ADENA_TABLE not found: ${forcedTable}`);
    }
    await pool.query(
      `UPDATE \`${forcedTable}\` SET \`${forcedCol}\` = COALESCE(\`${forcedCol}\`,0) + ?`,
      [d]
    );
    const [rows] = await pool.query(
      `SELECT \`${forcedCol}\` AS adena FROM \`${forcedTable}\` LIMIT 1`
    );
    return Number(rows?.[0]?.adena ?? 0);
  }

  if (await tableExists("adena")) {
    const cols = await getTableColumns("adena");
    const col = pickFirstExistingColumn(cols, ["amount", "adena", "value"]);
    if (col) {
      await pool.query(`UPDATE \`adena\` SET \`${col}\` = COALESCE(\`${col}\`,0) + ?`, [d]);
      const [rows] = await pool.query(`SELECT \`${col}\` AS adena FROM \`adena\` LIMIT 1`);
      return Number(rows?.[0]?.adena ?? 0);
    }
  }

  throw new Error("Adena write target not found. Set ADENA_TABLE & ADENA_COLUMN in .env.");
}

// ======================================================================
// ✅ HISTORY: TS를 “항상 YYYY-MM-DD 문자열”로 내려주기
// ======================================================================
const SELECT_HISTORY_SQL = `
  SELECT
    id,
    DATE_FORMAT(TS, '%Y-%m-%d') AS TS,
    AMOUNT,
    PNL
  FROM history
  ORDER BY TS ASC
`;

async function readHistoryFromDB() {
  try {
    if (!(await tableExists("history"))) return [];
    const [rows] = await pool.query(SELECT_HISTORY_SQL);
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    console.error("[DB] history read failed:", e?.message || e);
    return [];
  }
}

async function upsertTodayHistory(amount) {
  if (!(await tableExists("history"))) {
    throw new Error("history 테이블이 없습니다. (DB에 history 테이블 생성 필요)");
  }

  const ts = todayTS();
  const amt = Number(amount);
  if (!Number.isFinite(amt)) throw new Error("amount must be a number");

  let prev = null;
  try {
    const [prevRows] = await pool.query(
      "SELECT AMOUNT FROM history WHERE TS <> ? ORDER BY TS DESC LIMIT 1",
      [ts]
    );
    const v = prevRows?.[0]?.AMOUNT;
    prev = v === undefined || v === null ? null : Number(v);
  } catch {
    prev = null;
  }

  const pnl =
    prev === null || !Number.isFinite(prev) || prev === 0 ? 0 : ((amt - prev) / prev) * 100;

  await pool.query("DELETE FROM history WHERE TS = ?", [ts]);
  await pool.query("INSERT INTO history (TS, AMOUNT, PNL) VALUES (?, ?, ?)", [ts, amt, pnl]);

  return { ts, amt, pnl, prev };
}

async function readBgmusicFromDB() {
  return await readPathListFromDB("bgmusic");
}

async function readBglistFromDB() {
  return await readPathListFromDB("bglist");
}

function toId(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

// =========================
// API routes  (⚠️ 반드시 fallback 위!)
// =========================
app.get("/api/health", async (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get("/api/adena", async (req, res, next) => {
  try {
    const out = await readAdenaFromDB();
    res.json({ adena: out.adena, source: out.source, warning: out.warning });
  } catch (e) {
    next(e);
  }
});

app.post("/api/adena/delta", async (req, res, next) => {
  try {
    const delta = Number(req.body?.delta);
    if (!Number.isFinite(delta)) {
      return res.status(400).json({ ok: false, error: "delta must be a number" });
    }
    const adena = await applyAdenaDelta(delta);
    res.json({ adena });
  } catch (e) {
    next(e);
  }
});

app.get("/api/history", async (req, res, next) => {
  try {
    const rows = await readHistoryFromDB();
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

app.post("/api/history/today", async (req, res, next) => {
  try {
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount)) {
      return res.status(400).json({ ok: false, error: "amount must be a number" });
    }

    await upsertTodayHistory(amount);

    const bonus = 0;
    const adenaOut = await readAdenaFromDB();
    const history = await readHistoryFromDB();

    res.json({
      bonus,
      adena: Number(adenaOut.adena || 0),
      history,
    });
  } catch (e) {
    next(e);
  }
});

// ======================================================================
// ✅ COMMENTS API
// ======================================================================
app.get("/api/history/:historyId/comments", async (req, res, next) => {
  try {
    const historyId = toId(req.params.historyId);
    if (!historyId) return res.status(400).json({ ok: false, error: "historyId invalid" });

    if (!(await tableExists("history_comment"))) {
      return res.json([]);
    }

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

app.post("/api/history/:historyId/comments", async (req, res, next) => {
  try {
    const historyId = toId(req.params.historyId);
    if (!historyId) return res.status(400).json({ ok: false, error: "historyId invalid" });

    const body = String(req.body?.body ?? "").trim();
    if (!body) return res.status(400).json({ ok: false, error: "body required" });

    if (!(await tableExists("history_comment"))) {
      return res.status(500).json({
        ok: false,
        error: "history_comment 테이블이 없습니다. DB에 댓글 테이블을 생성하세요.",
      });
    }

    const [hRows] = await pool.query(`SELECT id FROM history WHERE id = ? LIMIT 1`, [historyId]);
    if (!hRows.length) return res.status(404).json({ ok: false, error: "history not found" });

    const [ins] = await pool.query(
      `INSERT INTO history_comment (history_id, body) VALUES (?, ?)`,
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

    res.json(rows?.[0] || null);
  } catch (e) {
    next(e);
  }
});

app.put("/api/history/comments/:commentId", async (req, res, next) => {
  try {
    const commentId = toId(req.params.commentId);
    if (!commentId) return res.status(400).json({ ok: false, error: "commentId invalid" });

    const body = String(req.body?.body ?? "").trim();
    if (!body) return res.status(400).json({ ok: false, error: "body required" });

    if (!(await tableExists("history_comment"))) {
      return res.status(500).json({
        ok: false,
        error: "history_comment 테이블이 없습니다. DB에 댓글 테이블을 생성하세요.",
      });
    }

    const [upd] = await pool.query(`UPDATE history_comment SET body = ? WHERE id = ?`, [
      body,
      commentId,
    ]);

    if (upd.affectedRows === 0) {
      return res.status(404).json({ ok: false, error: "comment not found" });
    }

    const [rows] = await pool.query(
      `
      SELECT id, history_id, body, created_at, updated_at
      FROM history_comment
      WHERE id = ?
      LIMIT 1
      `,
      [commentId]
    );

    res.json(rows?.[0] || null);
  } catch (e) {
    next(e);
  }
});

app.delete("/api/history/comments/:commentId", async (req, res, next) => {
  try {
    const commentId = toId(req.params.commentId);
    if (!commentId) return res.status(400).json({ ok: false, error: "commentId invalid" });

    if (!(await tableExists("history_comment"))) {
      return res.status(500).json({
        ok: false,
        error: "history_comment 테이블이 없습니다. DB에 댓글 테이블을 생성하세요.",
      });
    }

    const [del] = await pool.query(`DELETE FROM history_comment WHERE id = ?`, [commentId]);
    if (del.affectedRows === 0) {
      return res.status(404).json({ ok: false, error: "comment not found" });
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ======================================================================
// ✅ CHAT LOG API
// ======================================================================
app.post("/api/chat_log", async (req, res, next) => {
  try {
    const msg = String(req.body?.message ?? "").trim();
    if (!msg) return res.status(400).json({ ok: false, error: "message required" });

    if (!(await tableExists("chat_log"))) {
      return res.status(500).json({
        ok: false,
        error: "chat_log 테이블이 없습니다. DB에 chat_log 테이블을 생성하세요.",
      });
    }

    await pool.query(`INSERT INTO chat_log (message) VALUES (?)`, [msg]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.get("/api/chat_log", async (req, res, next) => {
  try {
    if (!(await tableExists("chat_log"))) return res.json([]);

    const limit = Math.max(1, Math.min(500, Number(req.query?.limit ?? 200) || 200));
    const [rows] = await pool.query(
      `SELECT id, created_at, message FROM chat_log ORDER BY id DESC LIMIT ?`,
      [limit]
    );
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
});

// ✅ /api/bgmusic
app.get("/api/bgmusic", async (req, res, next) => {
  try {
    const rows = await readBgmusicFromDB();
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// ✅ /api/bglist
app.get("/api/bglist", async (req, res, next) => {
  try {
    const rows = await readBglistFromDB();
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// ✅ /api/all
app.get("/api/all", async (req, res, next) => {
  try {
    const [adenaOut, history, bgmusic, bglist] = await Promise.all([
      readAdenaFromDB(),
      readHistoryFromDB(),
      readBgmusicFromDB(),
      readBglistFromDB(),
    ]);

    res.json({
      adena: adenaOut.adena,
      history,
      bgmusic,
      bglist,
      meta: {
        adenaSource: adenaOut.source,
        adenaWarning: adenaOut.warning || null,
      },
    });
  } catch (e) {
    next(e);
  }
});

// ======================================================================
// ✅ NEO (Router + Engine)
// - /api/neo/health
// - /api/neo/state
// - /api/neo/log?limit=50
// - /api/neo/stream (SSE)
// ======================================================================

// ✅ 엔진은 여기서 "단 한 번" 생성
const neoEngine = createNeoEngine({
  tickMs: Number(5000),
  checkpointEveryMin: Number(process.env.NEO_CHECKPOINT_MIN || 1),
});

// ✅ 라우터 마운트 (⚠️ fallback 위에!)
app.use("/api/neo", createNeoRouter({ engine: neoEngine }));

// =========================
// Error handler (JSON으로 반환)
// =========================
app.use((err, req, res, next) => {
  console.error("[API ERROR]", err);
  res.status(500).json({
    ok: false,
    error: err?.message || String(err),
  });
});

// =========================
// SPA fallback (⚠️ 반드시 맨 마지막)
// - ✅ /api/* 는 절대 index.html로 보내면 안 됨
// =========================
app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ ok: false, error: "API route not found", path: req.path });
  }
  res.sendFile(path.join(publicDir, "index.html"));
});

// =========================
// Server start
// =========================
const PORT = process.env.PORT || 6431;

app.listen(PORT, async () => {
  console.log(`✅ Server running: http://localhost:${PORT}`);

  try {
    await pool.query("SELECT 1");
    console.log("✅ MySQL connected");
  } catch (e) {
    console.error("❌ MySQL connection failed:", e?.message || e);
  }

  // ✅ Neo Engine start (핵심!)
  try {
    await neoEngine.start();
    console.log("✅ Neo engine started");
  } catch (e) {
    console.error("❌ Neo engine start failed:", e?.message || e);
  }
});