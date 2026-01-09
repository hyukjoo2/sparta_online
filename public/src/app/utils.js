// /src/app/utils.js

// ===== number helpers =====
export function round2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}
export function fmt2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "-";
  return x.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function fmt2Plain(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "-";
  return x.toFixed(2);
}

// ===== misc =====
export function pad2(n) {
  return String(n).padStart(2, "0");
}
export function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export function setFileStatus(el, text) {
  if (!el?.fileStatus) return;
  el.fileStatus.textContent = text;
}

export function appendLog(el, line) {
  if (!el?.consoleLog) return;
  el.consoleLog.value += (el.consoleLog.value ? "\n" : "") + line;
  el.consoleLog.scrollTop = el.consoleLog.scrollHeight;
}

// ===== date normalize: YYYY-MM-DD =====
export function toYYYYMMDDFromDate(d) {
  if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function normalizeTS(v) {
  if (v == null) return null;

  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = v > 1e12 ? v : v * 1000;
    return toYYYYMMDDFromDate(new Date(ms));
  }

  const s = String(v).trim();
  if (!s) return null;

  const m = s.match(/(\d{4})\s*[-\/\.]\s*(\d{1,2})\s*[-\/\.]\s*(\d{1,2})/);
  if (m) {
    const yyyy = m[1];
    const mm = String(Number(m[2])).padStart(2, "0");
    const dd = String(Number(m[3])).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  const d = new Date(s);
  const out = toYYYYMMDDFromDate(d);
  if (out) return out;

  return null;
}

export function todayTS() {
  return toYYYYMMDDFromDate(new Date());
}