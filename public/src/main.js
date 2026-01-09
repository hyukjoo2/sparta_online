// main.js
// /src/main.js
import { createHistoryModal } from "/src/features/history.js";
import { createOcoCalcModal } from "/src/features/ocoCalc.js";
import { createCalculatorModal } from "/src/features/calculator.js";

import { createBackgroundFeature } from "/src/features/background.js";
import { createAudioFeature } from "/src/features/audio.js";
import { createAdenaTimerFeature } from "/src/features/adenaTimer.js";
import { createSessionTimerFeature } from "/src/features/sessionTimer.js";
import { createCommandsFeature } from "/src/features/commands.js";

import { createGameWorldFeature } from "/src/features/gameWorld.js";

import { createRenderUI } from "/src/ui/render.js";
import { createModalUI } from "/src/ui/modal.js";
import { createMenuUI } from "/src/ui/menu.js";

(() => {
  // ===== Defaults (fallback) =====
  const DEFAULT_BG_LIST = [
    "./bglist/background_ep01_01.png",
    "./bglist/background_ep01_02.bmp",
    "./bglist/background_ep01_03.gif",
    "./bglist/background_ep01_04.png",
    "./bglist/background_ep01_05.jpg",
    "./bglist/background_ep01_06.jpg",
    "./bglist/background_ep01_07.png",
    "./bglist/background_ep01_08.png",
    "./bglist/background_ep01_10.png",
  ];

  const DEFAULT_BGMUSIC = [
    "./bgmusic/01_Recluse.mp3",
    "./bgmusic/02_The_Blood_Pledge.mp3",
    "./bgmusic/03_Against_Odds.mp3",
    "./bgmusic/04_A_New_Hope.mp3",
    "./bgmusic/05_Under_Siege.mp3",
    "./bgmusic/08_Man_of_Honor.mp3",
    "./bgmusic/11_Your_Wish.mp3",
    "./bgmusic/12_Eternally.mp3",
    "./bgmusic/13_Vagabonds.mp3",
    "./bgmusic/14_Moonlight.mp3",
    "./bgmusic/15_If.mp3",
    "./bgmusic/17_Town_All_Our_Wants.mp3",
    "./bgmusic/19_Desperate_Moment.mp3",
  ];

  // ✅ System Chat rotation
  let CHATLOG = [];

  async function loadChatLog() {
    const res = await fetch("/data/chatlog.json", { cache: "no-store" });
    if (!res.ok) throw new Error("chatlog.json 로드 실패: " + res.status);
    return await res.json();
  }

  async function initChat() {
    CHATLOG = await loadChatLog();
    if (chatRotationEnabled) startChatRotation();
  }

  const CHATLOG_INTERVAL_MS = 3000;
  const BG_INTERVAL_MS = 20000;

  const el = {
    topForm: document.getElementById("topForm"),
    priceInput: document.getElementById("priceInput"),
    fileStatus: document.getElementById("fileStatus"),
    priceBadge: document.getElementById("priceBadge"),

    pnlText: document.getElementById("pnlText"),
    adenaTimer: document.getElementById("adenaTimer"),

    leftOrb: document.getElementById("leftOrb"),
    rightOrb: document.getElementById("rightOrb"),

    leftFill: document.getElementById("leftFill"),
    leftLabel: document.getElementById("leftLabel"),
    rightFill: document.getElementById("rightFill"),
    rightLabel: document.getElementById("rightLabel"),

    openBtn: document.getElementById("openBtn"),
    saveOpenedBtn: document.getElementById("saveOpenedBtn"),
    mobileSaveBtn: document.getElementById("mobileSaveBtn"),
    downloadBtn: document.getElementById("downloadBtn"),

    historyBtn: document.getElementById("historyBtn"),
    reloadBtn: document.getElementById("reloadBtn"),
    ocoBtn: document.getElementById("ocoBtn"),
    calcBtn: document.getElementById("calcBtn"),

    bgm: document.getElementById("bgm"),
    bgToggleBtn: document.getElementById("bgToggleBtn"),
    playBtn: document.getElementById("playBtn"),
    muteBtn: document.getElementById("muteBtn"),
    volSlider: document.getElementById("volSlider"),
    playIcon: document.getElementById("playIcon"),
    pauseIcon: document.getElementById("pauseIcon"),
    volOnIcon: document.getElementById("volOnIcon"),
    volOffIcon: document.getElementById("volOffIcon"),

    modalBackdrop: document.getElementById("modalBackdrop"),
    modalRoot: document.getElementById("modalRoot"),
    modalTitle: document.getElementById("modalTitle"),
    modalHint: document.getElementById("modalHint"),
    modalBody: document.getElementById("modalBody"),
    modalClose: document.getElementById("modalClose"),

    countdownLabel: document.getElementById("countdownLabel"),
    countdownText: document.getElementById("countdownText"),

    bgA: document.getElementById("bgA"),
    bgB: document.getElementById("bgB"),

    bottomFill: document.getElementById("bottomFill"),
    bottomValue: document.getElementById("bottomValue"),

    consoleLog: document.getElementById("consoleLog"),
    consoleCmd: document.getElementById("consoleCmd"),

    quotaTicker: document.getElementById("quotaTicker"),
  };

  // =====================================================================
  // ✅ 소수점 2자리 유틸
  // =====================================================================
  function round2(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    return Math.round(x * 100) / 100;
  }
  function fmt2(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "-";
    return x.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmt2Plain(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "-";
    return x.toFixed(2);
  }

  // ===== Core data =====
  const MAX_LEVEL = 50;
  const MAX_CURRENT_INDICATOR = 50000;

  let bgList = DEFAULT_BG_LIST.slice();
  let bgmusic = DEFAULT_BGMUSIC.slice();

  let adena = 0;
  let entries = [];
  let pendingValue = null;
  let fileLinked = false;

  let screenEnabled = false;
  let chatOverride = null;
  let orbsOverride = null;

  // background state
  let bgTimer = null;
  let bgIndex = 0;
  let bgFront = "A";

  // audio state
  let trackIndex = 0;
  let isPlaying = false;

  // chat state
  let chatLogIndex = 0;
  let chatTimer = null;

  // ✅ CHATLOG 자동 출력 ON/OFF 플래그 (기본 ON)
  let chatRotationEnabled = true;

  // =====================================================================
  // ✅ 공용 유틸
  // =====================================================================
  function pad2(n) {
    return String(n).padStart(2, "0");
  }
  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }
  function setFileStatus(text) {
    el.fileStatus.textContent = text;
  }
  function appendLog(line) {
    el.consoleLog.value += (el.consoleLog.value ? "\n" : "") + line;
    el.consoleLog.scrollTop = el.consoleLog.scrollHeight;
  }

  // =====================================================================
  // ✅ (NEW) 전역 로딩 인디케이터 (AI 응답 대기용)
  // =====================================================================
  let busyIndicatorEl = null;
  let busyIndicatorStyleEl = null;
  let busyCount = 0; // 동시에 여러 작업이 떠도 안전하게

  function ensureBusyIndicator() {
    if (!busyIndicatorStyleEl) {
      const st = document.createElement("style");
      st.id = "spartaBusyIndicatorStyle";
      st.textContent = `
        @keyframes spartaSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        #spartaBusyIndicator {
          position: fixed;
          inset: 0;
          z-index: 4000000;
          display: none;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,.45);
          backdrop-filter: blur(2px);
          -webkit-backdrop-filter: blur(2px);
          pointer-events: auto;
        }
        #spartaBusyIndicator .box{
          display:flex;
          align-items:center;
          gap:12px;
          padding:14px 16px;
          border-radius:14px;
          border: 1px solid rgba(255,255,255,.18);
          background: rgba(10,12,18,.72);
          box-shadow: 0 10px 30px rgba(0,0,0,.45);
          color: rgba(255,255,255,.92);
          font-size: 14px;
          max-width: min(520px, calc(100vw - 40px));
        }
        #spartaBusyIndicator .spinner{
          width:18px;
          height:18px;
          border-radius:999px;
          border: 2px solid rgba(255,255,255,.25);
          border-top-color: rgba(255,255,255,.95);
          animation: spartaSpin .9s linear infinite;
          flex: 0 0 auto;
        }
        #spartaBusyIndicator .msg{
          line-height: 1.3;
          word-break: break-word;
          white-space: pre-wrap;
        }
      `;
      document.head.appendChild(st);
      busyIndicatorStyleEl = st;
    }

    if (!busyIndicatorEl) {
      const ov = document.createElement("div");
      ov.id = "spartaBusyIndicator";
      ov.innerHTML = `
        <div class="box" role="status" aria-live="polite" aria-busy="true">
          <div class="spinner" aria-hidden="true"></div>
          <div class="msg" id="spartaBusyIndicatorMsg">처리 중...</div>
        </div>
      `;
      document.body.appendChild(ov);
      busyIndicatorEl = ov;
    }

    return busyIndicatorEl;
  }

  function showBusyIndicator(message = "AI 응답 생성 중...") {
    ensureBusyIndicator();
    busyCount = Math.max(0, busyCount) + 1;

    const msgEl = document.getElementById("spartaBusyIndicatorMsg");
    if (msgEl) msgEl.textContent = String(message || "처리 중...");

    busyIndicatorEl.style.display = "flex";
  }

  function hideBusyIndicator() {
    busyCount = Math.max(0, busyCount - 1);
    if (busyCount > 0) return;

    if (busyIndicatorEl) busyIndicatorEl.style.display = "none";
  }

  // =====================================================================
  // ✅ 날짜 포맷/비교 표준화: YYYY-MM-DD
  // =====================================================================
  function toYYYYMMDDFromDate(d) {
    if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return null;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function normalizeTS(v) {
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

  function todayTS() {
    return toYYYYMMDDFromDate(new Date());
  }

  // =====================================================================
  // ✅ API BASE 자동 탐지/고정
  // =====================================================================
  const API_ORIGIN_KEY = "sparta_api_origin";
  const API_PROBE_PORTS = [8000, 3000, 5000, 8080, 8787, 5173, 5500];
  const API_PATH_PROBE = "/api/adena";

  function getSavedApiOrigin() {
    const v = (localStorage.getItem(API_ORIGIN_KEY) || "").trim();
    return v || null;
  }
  function setSavedApiOrigin(origin) {
    try {
      localStorage.setItem(API_ORIGIN_KEY, origin);
    } catch {}
  }
  function currentOrigin() {
    return window.location.origin;
  }
  function apiUrl(path) {
    const saved = getSavedApiOrigin();
    const origin = saved || currentOrigin();
    if (!path.startsWith("/")) path = "/" + path;
    return origin + path;
  }

  async function fetchJsonStrict(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(url + " 로드 실패: " + res.status);

    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("application/json")) {
      const txt = await res.text();
      throw new Error(`${url} 가 JSON이 아니라 HTML/텍스트를 반환했습니다.\n` + txt.slice(0, 120));
    }
    return await res.json();
  }

  async function detectApiOriginIfNeeded() {
    const saved = getSavedApiOrigin();
    if (saved) return saved;

    try {
      await fetchJsonStrict(currentOrigin() + API_PATH_PROBE);
      setSavedApiOrigin(currentOrigin());
      return currentOrigin();
    } catch {}

    const { protocol, hostname } = window.location;
    for (const port of API_PROBE_PORTS) {
      const origin = `${protocol}//${hostname}:${port}`;
      try {
        await fetchJsonStrict(origin + API_PATH_PROBE);
        setSavedApiOrigin(origin);
        return origin;
      } catch {}
    }
    return null;
  }

  // =====================================================================
  // ✅ DB API
  // =====================================================================
  async function tryFetchJson(path) {
    const url = apiUrl(path);
    return await fetchJsonStrict(url);
  }

  async function apiGetAllTablesBundled() {
    try {
      return await tryFetchJson("/api/all");
    } catch (e1) {
      try {
        return await tryFetchJson("/api/bootstrap");
      } catch (e2) {
        return null;
      }
    }
  }

  async function apiGetAllTablesSplit() {
    const [ad, hi, bm, bl] = await Promise.all([
      tryFetchJson("/api/adena"),
      tryFetchJson("/api/history"),
      tryFetchJson("/api/bgmusic"),
      tryFetchJson("/api/bglist"),
    ]);

    const adenaVal = Number(ad?.adena ?? 0);
    const historyArr = Array.isArray(hi) ? hi : Array.isArray(hi?.history) ? hi.history : [];
    const bgmusicArr = Array.isArray(bm) ? bm : Array.isArray(bm?.bgmusic) ? bm.bgmusic : [];
    const bglistArr = Array.isArray(bl) ? bl : Array.isArray(bl?.bglist) ? bl.bglist : [];
    return { adena: adenaVal, history: historyArr, bgmusic: bgmusicArr, bglist: bglistArr };
  }

  async function apiGetAllTables() {
    const bundled = await apiGetAllTablesBundled();
    if (bundled && typeof bundled === "object") return bundled;

    try {
      return await apiGetAllTablesSplit();
    } catch (splitErr) {
      try {
        return await tryFetchJson("/api/price");
      } catch (priceErr) {
        throw splitErr;
      }
    }
  }

  async function apiSaveTodayAmount(amount) {
    const url = apiUrl("/api/history/today");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    });
    if (!res.ok) throw new Error("오늘 값 저장 실패: " + res.status);
    return await res.json();
  }

  async function apiAdenaDelta(delta) {
    const url = apiUrl("/api/adena/delta");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delta }),
    });
    if (!res.ok) throw new Error("adena delta 실패: " + res.status);
    return await res.json();
  }

  // =====================================================================
  // ✅ (NEW) chat_log 저장 (내가 입력한 채팅만)
  // =====================================================================
  function shouldSaveChatLog(text) {
    const s = String(text || "").trim();
    if (!s) return false;
    if (s.startsWith("/")) return false;
    return true;
  }

  async function postChatLog(message) {
    const url = apiUrl("/api/chat_log");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`chat_log save failed: HTTP ${res.status}\n${txt.slice(0, 200)}`);
    }
  }

  function saveChatLogAsync(userText) {
    const msg = String(userText || "").trim();
    if (!shouldSaveChatLog(msg)) return;

    (async () => {
      try {
        await postChatLog(msg);
      } catch (e) {
        console.warn("[chat_log] save failed:", e?.message ?? e);
      }
    })();
  }

  // =====================================================================
  // ✅ Chat rotation
  // =====================================================================
  function startChatRotation() {
    if (!chatRotationEnabled) return;

    stopChatRotation();
    if (!Array.isArray(CHATLOG) || !CHATLOG.length) return;

    appendLog(CHATLOG[chatLogIndex]);
    chatLogIndex = (chatLogIndex + 1) % CHATLOG.length;

    chatTimer = setInterval(() => {
      appendLog(CHATLOG[chatLogIndex]);
      chatLogIndex = (chatLogIndex + 1) % CHATLOG.length;
    }, CHATLOG_INTERVAL_MS);
  }

  function stopChatRotation() {
    if (chatTimer) {
      clearInterval(chatTimer);
      chatTimer = null;
    }
  }

  function setChatRotationEnabled(on) {
    chatRotationEnabled = !!on;
    if (chatRotationEnabled) startChatRotation();
    else stopChatRotation();
  }

  function ensureChatRotationRunning() {
    if (!chatRotationEnabled) return;
    if (!chatTimer && Array.isArray(CHATLOG) && CHATLOG.length) {
      startChatRotation();
    }
  }

  function getChatVisible() {
    return true;
  }
  function applyChatVisibility() {
    const on = getChatVisible();
    el.consoleLog.style.display = on ? "block" : "none";
  }

  function lastSavedAmount() {
    return entries.length ? entries[entries.length - 1].AMOUNT : null;
  }

  function getPrevAndCurrForDisplay() {
    const last = entries.length - 1;
    const lastAmt = last >= 0 ? entries[last].AMOUNT : null;
    const prevAmt = last >= 1 ? entries[last - 1].AMOUNT : null;

    if (pendingValue !== null) return { prev: lastAmt, curr: pendingValue, isPending: true };
    if (entries.length >= 2) return { prev: prevAmt, curr: lastAmt, isPending: false };
    if (entries.length === 1) return { prev: null, curr: lastAmt, isPending: false };
    return { prev: null, curr: null, isPending: false };
  }

  // =====================================================================
  // ✅ Random reply + Ollama mixin
  // =====================================================================
  const LLM_ENDPOINT = "http://127.0.0.1:8000/chat"; // app.py가 8000에서 뜬다는 전제
  const LLM_MAX_TURNS = 20;

  const USE_OLLAMA_ON_NORMAL_CHAT = true;

  const OLLAMA_SPEAKER_POOL = [
    "헤헤곰인형",
    "사탕쥴게가자",
    "생각창고",
    "얼마즐",
    "천마대혈겁풍",
    "자면족밥된다",
    "암바시술소",
    "척추절단에바",
    "미스릴수저",
    "엘릭서마시고싶다",
    "도펠광어",
    "헨젤과그랫데",
    "네크로멘시",
    "두딸모두오크",
    "조카신발색깔",
  ];

  const llmMessages = [{ role: "system", content: "너는 게임 플레이어야. 항상 한국말로 짧게 한줄로 대답해." }];

  function trimLlmHistory() {
    const keep = 1 + LLM_MAX_TURNS * 2;
    if (llmMessages.length > keep) llmMessages.splice(1, llmMessages.length - keep);
  }

  function isNormalChat(text) {
    const s = String(text || "").trim();
    if (!s) return false;
    if (s.startsWith("/")) return false;
    return true;
  }

  function pickRandomSpeaker() {
    if (!Array.isArray(OLLAMA_SPEAKER_POOL) || !OLLAMA_SPEAKER_POOL.length) return "중계차";
    const idx = Math.floor(Math.random() * OLLAMA_SPEAKER_POOL.length);
    return OLLAMA_SPEAKER_POOL[idx];
  }

  function hasLeadingTag(text) {
    return /^\[[^\]]+\]\s*/.test(String(text || "").trim());
  }

  function appendOllamaReply(content) {
    const text = String(content ?? "").trim();
    if (!text) return;

    if (hasLeadingTag(text)) {
      appendLog(text);
      return;
    }
    const speaker = pickRandomSpeaker();
    appendLog(`[${speaker}] ${text}`);
  }

  async function llmChatSend(text) {
    llmMessages.push({ role: "user", content: text });
    trimLlmHistory();

    appendLog(`[Sparta군주] ${text}`);

    // ✅ "내가 입력한 채팅 원문"만 DB 저장
    saveChatLogAsync(text);

    if (!USE_OLLAMA_ON_NORMAL_CHAT) {
      ensureChatRotationRunning();
      return;
    }

    const prevDisabled = !!el.consoleCmd.disabled;
    el.consoleCmd.disabled = true;
    const prevPlaceholder = el.consoleCmd.placeholder;
    el.consoleCmd.placeholder = "Exaone 응답 생성 중...";

    const SYSTEM_PROMPT = "You are a player of a MMORPG. Give your answer shortly in Korean.";

    // ✅ (NEW) 화면 인디케이터 ON
    showBusyIndicator("AI 응답 생성 중...");

    try {
      const res = await fetch(LLM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: llmMessages,
          system_prompt: SYSTEM_PROMPT,
        }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);

      const data = await res.json();
      const content = String(data?.content ?? "").trim();
      if (!content) throw new Error("빈 응답");

      llmMessages.push({ role: "assistant", content });
      trimLlmHistory();

      appendOllamaReply(content);
    } catch (e) {
      appendLog(`[BOT] 에러: 서버 또는 Ollama 연결을 확인하세요. (${e?.message ?? e})`);
    } finally {
      // ✅ (NEW) 화면 인디케이터 OFF
      hideBusyIndicator();

      el.consoleCmd.disabled = prevDisabled;
      el.consoleCmd.placeholder = prevPlaceholder || "";
      try {
        el.consoleCmd.focus();
      } catch {}
      ensureChatRotationRunning();
    }
  }

  function bindLocalLlmChatInterceptorOnce() {
    if (!el.consoleCmd) return;
    if (el.consoleCmd.dataset.llmBound === "1") return;
    el.consoleCmd.dataset.llmBound = "1";

    el.consoleCmd.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Enter" || e.shiftKey) return;

        const text = String(el.consoleCmd.value || "").trim();
        if (!isNormalChat(text)) return;

        e.preventDefault();
        e.stopPropagation();

        el.consoleCmd.value = "";
        llmChatSend(text);
      },
      true
    );
  }

  // =====================================================================
  // ✅ UI modules: Modal / Menu / Render
  // =====================================================================
  const modalUI = createModalUI({ el });
  modalUI.bindOnce();
  const { openModal } = modalUI;

  const menuUI = createMenuUI({ root: document });
  menuUI.bindOnce();
  const { closeAllMenus2 } = menuUI;

  const renderUI = createRenderUI({
    el,
    fmt2,
    fmt2Plain,
    clamp,
    normalizeTS,
    todayTS,
    MAX_LEVEL,
    MAX_CURRENT_INDICATOR,

    getAdena: () => adena,
    getEntries: () => entries,
    getScreenEnabled: () => screenEnabled,
    getOrbsOverride: () => orbsOverride,

    getPrevAndCurrForDisplay,
    lastSavedAmount,
  });

  const { render, evaluateQuotaTicker, syncQuotaTickerPosition } = renderUI;

  // =====================================================================
  // ✅ (NEW) AI POPUP (chat_log 분석 전용)
  // =====================================================================
  function ensureAiMenuInserted() {
    const menubar = document.querySelector(".menubar");
    if (!menubar) return;

    if (menubar.querySelector('[data-menu="ai"]')) return;

    const toolsMenu = menubar.querySelector('[data-menu="tools"]');
    if (!toolsMenu) return;

    const aiMenu = document.createElement("div");
    aiMenu.className = "menu";
    aiMenu.setAttribute("data-menu", "ai");
    aiMenu.innerHTML = `
      <button class="menu-btn" type="button" id="aiMenuBtn">Ai ▾</button>
      <div class="menu-panel" role="menu">
        <button class="menu-item" type="button" id="aiChatBtn">AI 분석 (chat_log)</button>
      </div>
    `;

    if (toolsMenu.nextSibling) menubar.insertBefore(aiMenu, toolsMenu.nextSibling);
    else menubar.appendChild(aiMenu);
  }

  async function apiGetChatLogRecent(limit = 200) {
    return await tryFetchJson(`/api/chat_log?limit=${encodeURIComponent(String(limit))}`);
  }
  async function apiSearchChatLog(q, limit = 200) {
    const qq = String(q || "").trim();
    if (!qq) return [];
    return await tryFetchJson(
      `/api/chat_log/search?q=${encodeURIComponent(qq)}&limit=${encodeURIComponent(String(limit))}`
    );
  }

  function buildChatLogContext(rows, maxChars = 12000) {
    const list = (Array.isArray(rows) ? rows : [])
      .map((r) => {
        const id = r?.id != null ? `#${r.id}` : "#?";
        const tsRaw = r?.created_at ? String(r.created_at) : "";
        const ts = tsRaw ? tsRaw.replace("T", " ").slice(0, 19) : "";
        const msg = String(r?.message ?? "").replace(/\s+/g, " ").trim();
        if (!msg) return "";
        return `- (${id}) ${ts} :: ${msg}`;
      })
      .filter(Boolean);

    const joined = list.join("\n");
    return joined.length > maxChars ? joined.slice(joined.length - maxChars) : joined;
  }

  function elevateModalToFront() {
    // ✅ Matrix overlay보다 위로
    if (el.modalBackdrop) {
      el.modalBackdrop.style.zIndex = "3000000";
      el.modalBackdrop.style.position = "fixed";
      el.modalBackdrop.style.inset = "0";
    }
    if (el.modalRoot) {
      el.modalRoot.style.zIndex = "3000001";
      el.modalRoot.style.maxWidth = "860px";
      el.modalRoot.style.width = "min(860px, calc(100vw - 24px))";
      el.modalRoot.style.maxHeight = "calc(100vh - 24px)";
    }
    if (el.modalClose) {
      el.modalClose.style.zIndex = "3000002";
    }
  }

  let aiDialog = { turns: [], busy: false };

  function renderAiChatBody() {
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = "10px";
    wrap.style.height = "min(72vh, 720px)";

    const chatArea = document.createElement("div");
    chatArea.id = "aiChatArea";
    chatArea.style.flex = "1";
    chatArea.style.overflow = "auto";
    chatArea.style.padding = "10px";
    chatArea.style.border = "1px solid rgba(255,255,255,.12)";
    chatArea.style.borderRadius = "12px";
    chatArea.style.background = "rgba(0,0,0,.20)";

    const inputRow = document.createElement("div");
    inputRow.style.display = "flex";
    inputRow.style.gap = "8px";

    const input = document.createElement("input");
    input.id = "aiChatInput";
    input.type = "text";
    input.placeholder = "chat_log 기반으로 분석할 질문을 입력하세요 (Enter)";
    input.autocomplete = "off";
    input.style.flex = "1";
    input.style.padding = "12px 12px";
    input.style.borderRadius = "12px";
    input.style.border = "1px solid rgba(255,255,255,.18)";
    input.style.background = "rgba(255,255,255,.08)";
    input.style.color = "rgba(255,255,255,.92)";
    input.style.outline = "none";

    const sendBtn = document.createElement("button");
    sendBtn.id = "aiChatSendBtn";
    sendBtn.type = "button";
    sendBtn.textContent = "전송";
    sendBtn.style.padding = "10px 14px";
    sendBtn.style.borderRadius = "12px";
    sendBtn.style.border = "1px solid rgba(255,255,255,.18)";
    sendBtn.style.background = "rgba(255,255,255,.12)";
    sendBtn.style.color = "rgba(255,255,255,.92)";
    sendBtn.style.cursor = "pointer";

    inputRow.appendChild(input);
    inputRow.appendChild(sendBtn);

    wrap.appendChild(chatArea);
    wrap.appendChild(inputRow);

    function drawTurns() {
      chatArea.innerHTML = "";
      for (const t of aiDialog.turns) {
        const box = document.createElement("div");
        box.style.padding = "10px 12px";
        box.style.borderRadius = "12px";
        box.style.marginBottom = "8px";
        box.style.whiteSpace = "pre-wrap";
        box.style.wordBreak = "break-word";

        if (t.role === "user") {
          box.style.background = "#ffffff";
          box.style.color = "#000000";
          box.style.border = "1px solid rgba(0,0,0,.08)";
        } else {
          box.style.background = "#e9e9e9";
          box.style.color = "#000000";
          box.style.border = "1px solid rgba(0,0,0,.06)";
        }

        box.textContent = t.text;
        chatArea.appendChild(box);
      }
      chatArea.scrollTop = chatArea.scrollHeight;
    }

    async function doAsk() {
      if (aiDialog.busy) return;

      const q = String(input.value || "").trim();
      if (!q) return;

      input.value = "";
      aiDialog.turns.push({ role: "user", text: q });
      drawTurns();

      aiDialog.busy = true;
      sendBtn.disabled = true;
      sendBtn.style.opacity = "0.6";
      sendBtn.textContent = "분석 중...";

      // ✅ (NEW) 화면 인디케이터 ON
      showBusyIndicator("AI 분석 중...");

      try {
        let rows = [];
        try {
          rows = await apiSearchChatLog(q, 200);
        } catch {
          rows = [];
        }
        if (!Array.isArray(rows) || rows.length < 10) {
          rows = await apiGetChatLogRecent(200);
        }

        const context = buildChatLogContext(rows);

        const SYSTEM_PROMPT =
          "너는 DB 테이블 chat_log(사용자 채팅 원문 기록)를 분석하는 AI 분석가다.\n" +
          "주어진 로그를 근거로 패턴/주제/요약/인사이트/할 일 리스트를 만들어라.\n" +
          "가능하면 근거가 되는 로그 id(#123 형태)를 함께 언급해라.\n" +
          "로그에 없는 내용은 추측하지 말고 '로그에 없음'이라고 말해라.\n" +
          "답변은 한국어로 간결하지만 핵심은 빠짐없이.";

        const messages = [
          {
            role: "user",
            content:
              "다음은 chat_log 테이블에서 가져온 로그이다.\n\n" +
              context +
              "\n\n위 로그를 기반으로 질문에 답해줘.\n질문: " +
              q,
          },
        ];

        const res = await fetch(LLM_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ system_prompt: SYSTEM_PROMPT, messages }),
        });

        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        const content = String(data?.content ?? "").trim();
        if (!content) throw new Error("빈 응답");

        aiDialog.turns.push({ role: "ai", text: content });
        drawTurns();
      } catch (e) {
        aiDialog.turns.push({
          role: "ai",
          text: `에러: 서버 또는 LLM 연결을 확인하세요. (${e?.message ?? e})`,
        });
        drawTurns();
      } finally {
        // ✅ (NEW) 화면 인디케이터 OFF
        hideBusyIndicator();

        aiDialog.busy = false;
        sendBtn.disabled = false;
        sendBtn.style.opacity = "1";
        sendBtn.textContent = "전송";
        try {
          input.focus();
        } catch {}
      }
    }

    sendBtn.addEventListener("click", doAsk);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        doAsk();
      }
    });

    drawTurns();
    setTimeout(() => {
      try {
        input.focus();
      } catch {}
    }, 0);

    return wrap;
  }

  function openAiChatPopup() {
    elevateModalToFront();

    if (!aiDialog.turns.length) {
      aiDialog.turns.push({
        role: "ai",
        text:
          "chat_log 테이블 기반 분석 모드입니다.\n" +
          "예) '최근 감정/시장 관련 얘기만 요약해줘', '반복 패턴 찾아줘', '이번 주 키워드 TOP 5' 등",
      });
    }

    openModal("AI", "chat_log 분석", renderAiChatBody(), { top: true });
    elevateModalToFront();
  }

  function bindAiMenuActions() {
    ensureAiMenuInserted();

    const aiChatBtn = document.getElementById("aiChatBtn");
    if (!aiChatBtn) return;

    if (aiChatBtn.dataset.bound === "1") return;
    aiChatBtn.dataset.bound = "1";

    aiChatBtn.addEventListener("click", () => {
      closeAllMenus2();
      openAiChatPopup();
    });
  }

  // =====================================================================
  // ✅ Features (History / OCO / Calculator)
  // =====================================================================
  const { openHistory } = createHistoryModal({
    openModal,
    normalizeTS,
    fmt2,
    fmt2Plain,
    getEntries: () => entries,
    isFileLinked: () => fileLinked,
  });

  const { openOcoQuickCalc } = createOcoCalcModal({ openModal, getPrevAndCurrForDisplay });
  const { openCalculator } = createCalculatorModal({ openModal, getPrevAndCurrForDisplay });

  // =====================================================================
  // ✅ (REQ#3) Tools 메뉴에 History 포인트 추가
  // =====================================================================
  function ensureHistoryToolInserted() {
    const toolsMenu = document.querySelector('[data-menu="tools"]');
    if (!toolsMenu) return;

    const panel = toolsMenu.querySelector(".menu-panel");
    if (!panel) return;

    if (panel.querySelector("#historyBtn2")) return;

    const btn = document.createElement("button");
    btn.className = "menu-item";
    btn.type = "button";
    btn.id = "historyBtn2";
    btn.textContent = "History";
    panel.appendChild(btn);
  }

  function bindHistoryToolAction() {
    ensureHistoryToolInserted();

    const btn = document.getElementById("historyBtn2");
    if (!btn) return;
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";

    btn.addEventListener("click", () => {
      closeAllMenus2();
      openHistory();
    });
  }

  // =====================================================================
  // ✅ Background / Audio / AdenaTimer / SessionTimer / Commands
  // =====================================================================
  const background = createBackgroundFeature({
    el,
    appendLog,
    BG_INTERVAL_MS,
    DEFAULT_BG_LIST,

    getBgList: () => bgList,
    setBgList: (v) => (bgList = v),

    getBgIndex: () => bgIndex,
    setBgIndex: (v) => (bgIndex = v),

    getBgFront: () => bgFront,
    setBgFront: (v) => (bgFront = v),

    getBgTimer: () => bgTimer,
    setBgTimer: (v) => (bgTimer = v),

    getScreenEnabled: () => screenEnabled,
    setScreenEnabled: (v) => (screenEnabled = v),

    applyChatVisibility,
    render,
  });

  const audio = createAudioFeature({
    el,
    DEFAULT_BGMUSIC,
    appendLog,

    getBgmusic: () => bgmusic,
    setBgmusic: (v) => (bgmusic = v),

    getTrackIndex: () => trackIndex,
    setTrackIndex: (v) => (trackIndex = v),

    getIsPlaying: () => isPlaying,
    setIsPlaying: (v) => (isPlaying = v),
  });

  const sessionTimer = createSessionTimerFeature({ onTick: null });

  // Adena hourly awarding
  let adenaWriting = Promise.resolve();

  // ✅ (NEW) 은행 입금(💰→DB adena) pending 누적 (DB 연결 전일 때)
  let pendingBankDeposit = 0;

  async function applyAdenaDeltaQueued(delta, reason = "SYSTEM") {
    const d = Number(delta);
    if (!Number.isFinite(d) || d <= 0) return;

    // DB 미연결이면 임시 누적 + 로컬 반영만 (연결되면 flush)
    if (!fileLinked) {
      pendingBankDeposit = round2(pendingBankDeposit + d);
      adena = Number(adena || 0) + d; // 화면상도 바로 반영
      render();
      appendLog(`[${reason}] DB 미연결: 아데나 +${fmt2(d)} (임시 누적). pending=${fmt2(pendingBankDeposit)}`);
      setFileStatus(`DB: (미연결) • pending adena=${fmt2(pendingBankDeposit)}`);
      return;
    }

    adenaWriting = adenaWriting
      .then(async () => {
        const out = await apiAdenaDelta(d);
        adena = Number(out.adena || 0);
        render();
        appendLog(`[${reason}] 아데나 +${fmt2(d)} (DB 저장 완료). 현재 아데나: ${fmt2(adena)}`);
        setFileStatus(`DB: adena 업데이트(+${fmt2(d)})`);
      })
      .catch((e) => {
        appendLog(`[${reason}] 아데나 업데이트 실패: ` + (e?.message ?? e));
      });

    return adenaWriting;
  }

  // ✅ (NEW) gameWorld.js에서 dispatch한 "adena:deposit" 이벤트 처리
  const bankDepositEventState = { bound: false };
  function bindBankDepositEventOnce() {
    if (bankDepositEventState.bound) return;
    bankDepositEventState.bound = true;

    window.addEventListener("adena:deposit", (e) => {
      const amt = Number(e?.detail?.amount);
      if (!Number.isFinite(amt) || amt <= 0) return;
      applyAdenaDeltaQueued(amt, "BANK");
    });

    // (fallback) gameWorld.js fallback 함수 호출용
    window.updateAdena = (delta) => applyAdenaDeltaQueued(delta, "BANK");
    window.addAdena = (delta) => applyAdenaDeltaQueued(delta, "BANK");
  }

  async function awardHourlyAdena(deltaHours) {
    if (!fileLinked) return;

    const delta = Number(deltaHours);
    if (!Number.isFinite(delta) || delta <= 0) return;

    // 기존 로직 유지 (직렬화/DB 반영)
    adenaWriting = adenaWriting
      .then(async () => {
        const out = await apiAdenaDelta(delta);
        adena = Number(out.adena || 0);
        render();
        appendLog(`[SYSTEM] 1시간 경과 → 아데나 +${fmt2(delta)} (DB 저장 완료). 현재 아데나: ${fmt2(adena)}`);
        setFileStatus(`DB: adena 업데이트(+${fmt2(delta)}/hr)`);
      })
      .catch((e) => {
        appendLog("[SYSTEM] 아데나 자동지급 실패: " + (e?.message ?? e));
      });

    return adenaWriting;
  }

  const adenaTimerFeature = createAdenaTimerFeature({
    el,
    isFileLinked: () => fileLinked,
    awardHourlyAdena,
    pad2,
  });

  const commands = createCommandsFeature({
    el,
    appendLog,
    fmt2,
    fmt2Plain,
    normalizeTS,
    todayTS,

    getChatOverride: () => chatOverride,
    setChatOverride: (v) => (chatOverride = v),

    getOrbsOverride: () => orbsOverride,
    setOrbsOverride: (v) => (orbsOverride = v),

    getScreenEnabled: () => screenEnabled,
    setScreenEnabled: (v) => (screenEnabled = v),

    applyChatVisibility,
    render,

    background,
    audio,

    openHistory,
    openOcoQuickCalc,
    openCalculator,

    doReloadAction,
    closeAllMenus2,

    getPrevAndCurrForDisplay,
    lastSavedAmount,

    setChatRotationEnabled,
  });

  // =====================================================================
  // ✅ applyMediaConfigFromDB
  // =====================================================================
  async function applyMediaConfigFromDB(nextBgmusic, nextBglist) {
    await audio.applyBgmusicFromDB(nextBgmusic);
    background.applyBgListFromDB(nextBglist);
  }

  // =====================================================================
  // ✅ reloadFromDB
  // =====================================================================
  async function reloadFromDB(isOpenFlow = false) {
    setFileStatus("DB: (전체 테이블 로딩 중...)");

    const all = await apiGetAllTables();

    adena = Number(all?.adena || 0);
    entries = Array.isArray(all?.history) ? all.history.slice() : [];
    pendingValue = null;
    el.priceInput.value = "";

    await applyMediaConfigFromDB(all?.bgmusic, all?.bglist);

    fileLinked = true;
    adenaTimerFeature.start();

    // ✅ (NEW) DB 연결 성공 후, 은행 입금 pending flush
    if (pendingBankDeposit > 0) {
      const flush = pendingBankDeposit;
      pendingBankDeposit = 0;

      // flush는 직렬화 큐로 안전하게 처리
      await applyAdenaDeltaQueued(flush, "BANK(PENDING)");
    }

    setFileStatus(`DB: 연결됨 (${isOpenFlow ? "Initial" : "Reload"})`);
    if (screenEnabled) background.applyScreenState();
    else render();

    evaluateQuotaTicker();
  }

  async function doReloadAction() {
    await reloadFromDB(false);
    appendLog("리로드: DB ALL TABLES Reload 완료.");
  }

  // =====================================================================
  // ✅ Countdown
  // =====================================================================
  function tickCountdown() {
    const target = new Date("2026-06-30T00:00:00+09:00").getTime();
    const now = Date.now();
    let diff = target - now;

    if (diff <= 0) {
      el.countdownText.textContent = "0일 00:00:00";
      return;
    }

    const sec = Math.floor(diff / 1000);
    const days = Math.floor(sec / 86400);
    const rem1 = sec % 86400;
    const hh = Math.floor(rem1 / 3600);
    const rem2 = rem1 % 3600;
    const mm = Math.floor(rem2 / 60);
    const ss = rem2 % 60;

    el.countdownText.textContent = `${days}일 ${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
  }

  // =====================================================================
  // ✅ 수익 10% 아데나 지급
  // =====================================================================
  function getPrevDayAmountFrom(historyArr, tsToday) {
    const rows = (Array.isArray(historyArr) ? historyArr : [])
      .filter((r) => r && r.TS != null && r.AMOUNT != null)
      .map((r) => ({ ts: normalizeTS(r.TS), amt: Number(r.AMOUNT) }))
      .filter((x) => x.ts && Number.isFinite(x.amt))
      .sort((a, b) => String(a.ts).localeCompare(String(b.ts)));

    for (let i = rows.length - 1; i >= 0; i--) {
      if (String(rows[i].ts) < String(tsToday)) return rows[i].amt;
    }
    return null;
  }

  function calcProfitBonusFromPrev(prevAmt, savedAmount) {
    const prev = Number(prevAmt);
    const curr = Number(savedAmount);
    if (!Number.isFinite(curr) || !Number.isFinite(prev)) return { profit: 0, bonus: 0, prev };
    const profit = Math.max(0, curr - prev);
    const bonus = round2(profit * 0.1);
    return { profit, bonus, prev };
  }

  async function saveTodayToDB() {
    if (pendingValue === null) {
      alert("저장할 값이 없습니다. (가격 입력 후 Enter로 UI 반영 후 저장)");
      return;
    }

    const valueToSave = Number(pendingValue);
    const tsToday = todayTS();

    const prevEntriesSnapshot = entries.slice();
    const prevDayAmount = getPrevDayAmountFrom(prevEntriesSnapshot, tsToday);

    setFileStatus(`DB: 저장 중... • TS=${tsToday}`);

    try {
      const out = await apiSaveTodayAmount(valueToSave);

      entries = Array.isArray(out.history) ? out.history.slice() : entries;
      pendingValue = null;
      el.priceInput.value = "";

      adena = Number(out.adena || adena || 0);

      let bonusToApply = 0;

      if (Number.isFinite(Number(out.bonus)) && Number(out.bonus) > 0) {
        bonusToApply = round2(Number(out.bonus));
      } else {
        const { profit, bonus, prev } = calcProfitBonusFromPrev(prevDayAmount, valueToSave);
        bonusToApply = Math.max(0, round2(bonus || 0));

        if (!Number.isFinite(Number(prev))) {
          appendLog("[SYSTEM] 수익 보너스 계산 불가: 전일(이전일) 데이터가 없습니다.");
        } else {
          appendLog(
            `[SYSTEM] 전일=${fmt2Plain(prev)} → 오늘=${fmt2Plain(valueToSave)} / 이익=${fmt2Plain(profit)} / 보너스=${fmt2Plain(
              bonusToApply
            )}`
          );
        }
      }

      if (bonusToApply > 0) {
        const deltaOut = await apiAdenaDelta(bonusToApply);
        adena = Number(deltaOut.adena || adena || 0);
        appendLog(`[SYSTEM] 수익 보너스 아데나 +${fmt2(bonusToApply)} (이익의 10%).`);
      } else {
        appendLog(`[SYSTEM] 수익 보너스 없음 (이익이 없거나 계산 불가).`);
      }

      fileLinked = true;
      adenaTimerFeature.start();

      setFileStatus(`DB: 저장 OK(오늘 overwrite) • adena=${fmt2(adena)} • len=${entries.length}`);
      render();
      evaluateQuotaTicker();
    } catch (e) {
      alert("DB 저장 실패: " + (e?.message ?? e));
      console.error(e);
      pendingValue = valueToSave;
      render();
      setFileStatus("DB: 저장 실패 • API 상태 확인");
    }
  }

  // =====================================================================
  // ✅ Menu bindings
  // =====================================================================
  function bindMenuActions() {
    el.openBtn.addEventListener("click", async () => {
      closeAllMenus2();
      await reloadFromDB(true);
    });
    el.saveOpenedBtn.addEventListener("click", async () => {
      closeAllMenus2();
      await saveTodayToDB();
    });

    el.mobileSaveBtn.addEventListener("click", async () => {
      closeAllMenus2();
      await saveTodayToDB();
    });
    el.downloadBtn.addEventListener("click", async () => {
      closeAllMenus2();
      await saveTodayToDB();
    });

    el.historyBtn.addEventListener("click", () => {
      closeAllMenus2();
      openHistory();
    });
    el.reloadBtn.addEventListener("click", async () => {
      closeAllMenus2();
      await doReloadAction();
    });

    el.ocoBtn.addEventListener("click", () => {
      closeAllMenus2();
      openOcoQuickCalc();
    });
    el.calcBtn.addEventListener("click", () => {
      closeAllMenus2();
      openCalculator();
    });
  }

  // =====================================================================
  // ✅ Matrix Tool (GAME-LIKE)
  // =====================================================================
  let matrixWorld = null;
  let matrixPrevScreenEnabled = null;
  let matrixWorldOpen = false;

  let matrixOverlay = null;

  const consoleVisBackup = { logDisplay: null, cmdDisplay: null };
  function setConsoleVisible(on) {
    const log = el.consoleLog;
    const cmd = el.consoleCmd;
    if (!log || !cmd) return;

    if (on) {
      if (consoleVisBackup.logDisplay !== null) log.style.display = consoleVisBackup.logDisplay;
      if (consoleVisBackup.cmdDisplay !== null) cmd.style.display = consoleVisBackup.cmdDisplay;
      consoleVisBackup.logDisplay = null;
      consoleVisBackup.cmdDisplay = null;
      return;
    }

    if (consoleVisBackup.logDisplay === null) consoleVisBackup.logDisplay = log.style.display || "";
    if (consoleVisBackup.cmdDisplay === null) consoleVisBackup.cmdDisplay = cmd.style.display || "";
    log.style.display = "none";
    cmd.style.display = "none";
  }

  // ✅ Matrix 열릴 때 메인 UI 숨김/복구
  const mainUiBackup = [];
  const bodyOverflowBackup = { value: null };

  function hideMainUIExceptMatrix() {
    mainUiBackup.length = 0;

    if (bodyOverflowBackup.value === null) bodyOverflowBackup.value = document.body.style.overflow || "";
    document.body.style.overflow = "hidden";

    const excludeIds = new Set(["matrixOverlay", "modalBackdrop", "modalRoot", "spartaBusyIndicator"]);

    const kids = Array.from(document.body.children || []);
    for (const n of kids) {
      if (!n || n.nodeType !== 1) continue;
      if (excludeIds.has(n.id)) continue;

      mainUiBackup.push([n, n.style.display, n.style.pointerEvents, n.style.visibility]);
      n.style.display = "none";
    }
  }

  function restoreMainUI() {
    while (mainUiBackup.length) {
      const [n, display, pe, vis] = mainUiBackup.pop();
      if (!n) continue;
      n.style.display = display || "";
      n.style.pointerEvents = pe || "";
      n.style.visibility = vis || "";
    }

    if (bodyOverflowBackup.value !== null) {
      document.body.style.overflow = bodyOverflowBackup.value || "";
      bodyOverflowBackup.value = null;
    }
  }

  function ensureMatrixToolInserted() {
    const toolsMenu = document.querySelector('[data-menu="tools"]');
    if (!toolsMenu) return;

    const panel = toolsMenu.querySelector(".menu-panel");
    if (!panel) return;

    if (panel.querySelector("#matrixBtn")) return;

    const btn = document.createElement("button");
    btn.className = "menu-item";
    btn.type = "button";
    btn.id = "matrixBtn";
    btn.textContent = "Matrix";
    panel.appendChild(btn);
  }

  function ensureMatrixOverlayCreated() {
    if (matrixOverlay) return;

    const ov = document.createElement("div");
    ov.id = "matrixOverlay";
    ov.style.position = "fixed";
    ov.style.inset = "0";
    ov.style.zIndex = "2000000";
    ov.style.pointerEvents = "auto";
    ov.style.background = "rgba(0,0,0,.72)";
    ov.style.display = "block";

    document.body.appendChild(ov);
    matrixOverlay = ov;
  }

  function removeMatrixOverlay() {
    if (!matrixOverlay) return;
    try {
      matrixOverlay.parentNode && matrixOverlay.parentNode.removeChild(matrixOverlay);
    } catch {}
    matrixOverlay = null;
  }

  // ✅ gameWorld에서 이벤트로 History/Exit 호출
  const matrixEventState = { bound: false };
  function onMatrixTriggerEvent(e) {
    if (!matrixWorldOpen) return;

    const action = e?.detail?.action;
    if (action === "history") {
      closeAllMenus2();
      openHistory();
      return;
    }
    if (action === "exit") {
      teardownMatrixWorld();
      return;
    }
    if (action === "ai") {
      closeAllMenus2();
      openAiChatPopup();
      return;
    }
  }

  function bindMatrixTriggerEventsOnce() {
    if (matrixEventState.bound) return;
    matrixEventState.bound = true;
    window.addEventListener("matrix:trigger", onMatrixTriggerEvent);
  }

  function teardownMatrixWorld() {
    if (!matrixWorldOpen) return;
    matrixWorldOpen = false;

    try {
      matrixWorld?.stop?.();
    } catch {}

    try {
      const cv = document.getElementById("matrixGameCanvas");
      if (cv && cv.parentNode) cv.parentNode.removeChild(cv);
    } catch {}

    removeMatrixOverlay();

    restoreMainUI();

    if (matrixPrevScreenEnabled !== null) {
      screenEnabled = !!matrixPrevScreenEnabled;
      matrixPrevScreenEnabled = null;

      background.setBgToggleUI();
      background.applyScreenState();
    }

    setConsoleVisible(true);

    matrixWorld = null;
    render();
  }

  function openMatrixWorld() {
    closeAllMenus2();
    if (matrixWorldOpen) return;
    matrixWorldOpen = true;

    hideMainUIExceptMatrix();
    bindMatrixTriggerEventsOnce();
    bindBankDepositEventOnce();

    matrixPrevScreenEnabled = screenEnabled;
    screenEnabled = true;
    background.setBgToggleUI();
    background.applyScreenState();

    setConsoleVisible(false);
    ensureMatrixOverlayCreated();

    matrixWorld = createGameWorldFeature({
      el,
      openModal,
      closeAllMenus2,
      getScreenEnabled: () => screenEnabled,
      getEntries: () => entries,
      onOpenAiPopup: () => openAiChatPopup(),
    });

    try {
      matrixWorld.init();

      const cv = document.getElementById("matrixGameCanvas");
      if (cv && matrixOverlay && cv.parentNode !== matrixOverlay) {
        cv.style.position = "absolute";
        cv.style.inset = "0";
        cv.style.width = "100%";
        cv.style.height = "100%";
        cv.style.display = "block";
        cv.style.zIndex = "1";
        cv.style.borderRadius = "0";
        cv.style.border = "none";
        cv.style.background = "transparent";
        cv.style.backdropFilter = "none";
        cv.style.webkitBackdropFilter = "none";
        matrixOverlay.insertBefore(cv, matrixOverlay.firstChild);
      }
    } catch (e) {
      appendLog("[SYSTEM] Matrix init 실패: " + (e?.message ?? e));
      teardownMatrixWorld();
    }
  }

  function bindMatrixToolAction() {
    ensureMatrixToolInserted();

    const btn = document.getElementById("matrixBtn");
    if (!btn) return;
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";

    btn.addEventListener("click", () => {
      openMatrixWorld();
    });
  }

  // =====================================================================
  // ✅ 입력 → pendingValue → render
  // =====================================================================
  function applyPriceFromInput() {
    const raw = (el.priceInput.value || "").trim();
    if (!raw) return;
    const v = Number(raw);
    if (!Number.isFinite(v)) {
      alert("유효한 숫자를 입력해주세요.");
      return;
    }
    pendingValue = v;
    render();
    evaluateQuotaTicker();
  }
  el.topForm.addEventListener("submit", (e) => {
    e.preventDefault();
    applyPriceFromInput();
  });
  el.priceInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyPriceFromInput();
    }
  });

  // =====================================================================
  // ✅ Boot (순서 중요)
  // =====================================================================
  bindMenuActions();

  ensureAiMenuInserted();
  bindAiMenuActions();

  bindMatrixToolAction();
  bindHistoryToolAction();

  // ✅ (NEW) Matrix 안 들어가도 은행 이벤트가 들어올 수 있으니, 여기서도 1회 바인딩
  bindBankDepositEventOnce();

  // ✅ (NEW) 인디케이터 DOM 미리 준비(선택 사항이지만 체감 좋아짐)
  ensureBusyIndicator();

  audio.initAudio();
  background.bindToggleButtonOnce();
  commands.bindConsoleInputOnce();

  bindLocalLlmChatInterceptorOnce();

  sessionTimer.start();
  applyChatVisibility();

  screenEnabled = false;
  background.setBgToggleUI();
  background.applyScreenState();

  fileLinked = false;
  setFileStatus("DB: (미연결)");

  adenaTimerFeature.start();

  render();
  tickCountdown();
  setInterval(tickCountdown, 1000);

  window.addEventListener("resize", () => {
    syncQuotaTickerPosition();
  });
  window.addEventListener(
    "scroll",
    () => {
      syncQuotaTickerPosition();
    },
    { passive: true }
  );

  initChat().catch(console.error);

  (async () => {
    const origin = await detectApiOriginIfNeeded();
    if (!origin) {
      appendLog("[SYSTEM] API Origin 자동탐지 실패: 프론트와 API 포트가 다를 수 있습니다.");
      setFileStatus("DB: (미연결) • API/DB 상태 확인 필요 (DEFAULT 모드로 동작 중)");
      return;
    }
    appendLog(`[SYSTEM] API Origin = ${origin}`);

    reloadFromDB(true).catch((e) => {
      appendLog("[SYSTEM] DB 초기 로드 실패: " + (e?.message ?? e));
      setFileStatus("DB: (미연결) • API/DB 상태 확인 필요 (DEFAULT 모드로 동작 중)");
    });
  })();
})();