// server/src/neo/neoRepo.js
import { pool } from "../db.js";

const STATE_ID = 1;

function nowMs() {
  return Date.now();
}

function deriveClockFromSystemMin(systemMin) {
  const day = Math.floor(systemMin / 1440) + 1;
  const mInDay = systemMin % 1440;
  const hour = Math.floor(mInDay / 60);
  const minute = mInDay % 60;
  return { system_day: day, system_hour: hour, system_minute: minute };
}

/**
 * 현실 시간 ↔ 시스템 시간 스케일 설정
 *
 * ✅ 목표: 현실 1시간 = 시스템 1일(1440분)
 * - system 1 minute = 3600000 / 1440 = 2500ms (2.5초)
 *
 * 필요하면 .env로 조절 가능:
 *   NEO_REAL_MS_PER_SYSTEM_DAY=3600000   // 기본 1시간
 *
 * 예전(현실 12시간=시스템 1일)로 하려면:
 *   NEO_REAL_MS_PER_SYSTEM_DAY=43200000  // 12시간
 */
function getRealMsPerSystemDay() {
  const v = Number(process.env.NEO_REAL_MS_PER_SYSTEM_DAY);
  if (Number.isFinite(v) && v > 0) return v;
  return 60 * 60 * 1000; // ✅ default: 1 hour
}

function getRealMsPerSystemMin() {
  // system day = 1440 system minutes
  const dayMs = getRealMsPerSystemDay();
  return Math.max(1, Math.floor(dayMs / 1440));
}

export async function loadOrInitNeoState() {
  const [rows] = await pool.query("SELECT * FROM neo_state WHERE id = ?", [STATE_ID]);
  if (rows.length) return rows[0];

  // 최초 생성 (DB가 필수이므로 여기서 초기 스냅샷을 만든다)
  const anchor_real_ms = nowMs();
  const anchor_system_min = 0;

  const base = {
    id: STATE_ID,
    name: "Neo",

    anchor_real_ms,
    anchor_system_min,

    last_real_ms: anchor_real_ms,
    last_system_min: anchor_system_min,

    system_day: 1,
    system_hour: 0,
    system_minute: 0,

    life_no: 1,
    age_years: 33,
    day_in_life: 1,

    status: "ALIVE",
    location: "Spawn",

    last_thought: null,
    last_action: null,

    last_boundary_system_day: 1,
    last_event_system_min: 0,
  };

  await pool.query(
    `INSERT INTO neo_state (
      id, name,
      anchor_real_ms, anchor_system_min,
      last_real_ms, last_system_min,
      system_day, system_hour, system_minute,
      life_no, age_years, day_in_life,
      status, location,
      last_thought, last_action,
      last_boundary_system_day, last_event_system_min
    ) VALUES (
      :id, :name,
      :anchor_real_ms, :anchor_system_min,
      :last_real_ms, :last_system_min,
      :system_day, :system_hour, :system_minute,
      :life_no, :age_years, :day_in_life,
      :status, :location,
      :last_thought, :last_action,
      :last_boundary_system_day, :last_event_system_min
    )`,
    base
  );

  return base;
}

export async function saveNeoSnapshot(state) {
  await pool.query(
    `UPDATE neo_state SET
      name = :name,

      anchor_real_ms = :anchor_real_ms,
      anchor_system_min = :anchor_system_min,

      last_real_ms = :last_real_ms,
      last_system_min = :last_system_min,

      system_day = :system_day,
      system_hour = :system_hour,
      system_minute = :system_minute,

      life_no = :life_no,
      age_years = :age_years,
      day_in_life = :day_in_life,

      status = :status,
      location = :location,

      last_thought = :last_thought,
      last_action  = :last_action,

      last_boundary_system_day = :last_boundary_system_day,
      last_event_system_min = :last_event_system_min

    WHERE id = :id`,
    state
  );
}

export async function appendNeoLog({
  real_ms,
  system_min,
  system_day,
  system_hour,
  system_minute,
  life_no,
  age_years,
  day_in_life,
  kind,
  status,
  location_from,
  location_to,
  message,
}) {
  await pool.query(
    `INSERT INTO neo_log (
      real_ms, system_min, system_day, system_hour, system_minute,
      life_no, age_years, day_in_life,
      kind, status,
      location_from, location_to,
      message
    ) VALUES (
      :real_ms, :system_min, :system_day, :system_hour, :system_minute,
      :life_no, :age_years, :day_in_life,
      :kind, :status,
      :location_from, :location_to,
      :message
    )`,
    {
      real_ms,
      system_min,
      system_day,
      system_hour,
      system_minute,
      life_no,
      age_years,
      day_in_life,
      kind,
      status,
      location_from: location_from ?? null,
      location_to: location_to ?? null,
      message,
    }
  );
}

export async function readNeoLog(limit = 100) {
  const lim = Math.max(1, Math.min(1000, Number(limit) || 100));
  const [rows] = await pool.query(`SELECT * FROM neo_log ORDER BY id DESC LIMIT ?`, [lim]);
  return rows;
}

/**
 * ✅ 핵심 변경점:
 * - 기존: 현실 "분" 단위로만 systemMin 증가 (60초당 +1)
 * - 변경: 현실 ms를 기준으로 systemMin 증가 (2.5초당 +1)
 *
 * 현실 1시간 = 시스템 1일이면,
 *   realMsPerSystemMin = 2500ms
 */
export function computeSystemMin(anchorRealMs, anchorSystemMin, nowRealMs) {
  const realMsPerSystemMin = getRealMsPerSystemMin();
  const deltaSystemMin = Math.floor((nowRealMs - anchorRealMs) / realMsPerSystemMin);
  return anchorSystemMin + Math.max(0, deltaSystemMin);
}

export { deriveClockFromSystemMin, nowMs };