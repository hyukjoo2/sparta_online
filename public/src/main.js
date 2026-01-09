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

import {
  DEFAULT_BG_LIST,
  DEFAULT_BGMUSIC,
  CHATLOG_INTERVAL_MS,
  BG_INTERVAL_MS,
  MAX_LEVEL,
  MAX_CURRENT_INDICATOR,
} from "/src/app/constants.js";

import { getDomRefs } from "/src/app/dom.js";
import { round2, fmt2, fmt2Plain, pad2, clamp, normalizeTS, todayTS, setFileStatus, appendLog } from "/src/app/utils.js";
import { ensureBusyIndicator } from "/src/app/busyIndicator.js";
import { detectApiOriginIfNeeded } from "/src/app/api.js";
import { createChatRotation } from "/src/app/chatRotation.js";
import { createLlmChat } from "/src/app/llmChat.js";
import { createAiPopup } from "/src/app/aiPopup.js";
import { createHistoryTool } from "/src/app/historyTool.js";
import { createMatrixTool } from "/src/app/matrixTool.js";
import { createDbFlow } from "/src/app/dbFlow.js";

(() => {
  const el = getDomRefs(document);

  // ===== state (한 곳에서만) =====
  let state = {
    bgList: DEFAULT_BG_LIST.slice(),
    bgmusic: DEFAULT_BGMUSIC.slice(),

    adena: 0,
    entries: [],
    pendingValue: null,
    fileLinked: false,

    screenEnabled: false,
    chatOverride: null,
    orbsOverride: null,

    // background state
    bgTimer: null,
    bgIndex: 0,
    bgFront: "A",

    // audio state
    trackIndex: 0,
    isPlaying: false,
  };

  function getState() {
    return state;
  }
  function setState(updater) {
    state = typeof updater === "function" ? updater(state) : { ...state, ...updater };
  }

  // ===== chatlog rotation (System) =====
  let CHATLOG = [];
  async function loadChatLog() {
    const res = await fetch("/data/chatlog.json", { cache: "no-store" });
    if (!res.ok) throw new Error("chatlog.json 로드 실패: " + res.status);
    return await res.json();
  }
  const chatRotation = createChatRotation({
    appendLog: (s) => appendLog(el, s),
    intervalMs: CHATLOG_INTERVAL_MS,
  });
  async function initChat() {
    CHATLOG = await loadChatLog();
    chatRotation.setLog(CHATLOG);
    if (chatRotation.getEnabled()) chatRotation.start();
  }

  // ===== UI modules =====
  const modalUI = createModalUI({ el });
  modalUI.bindOnce();
  const { openModal } = modalUI;

  const menuUI = createMenuUI({ root: document });
  menuUI.bindOnce();
  const { closeAllMenus2 } = menuUI;

  function lastSavedAmount() {
    const { entries } = getState();
    return entries.length ? entries[entries.length - 1].AMOUNT : null;
  }

  function getPrevAndCurrForDisplay() {
    const { entries, pendingValue } = getState();
    const last = entries.length - 1;
    const lastAmt = last >= 0 ? entries[last].AMOUNT : null;
    const prevAmt = last >= 1 ? entries[last - 1].AMOUNT : null;

    if (pendingValue !== null) return { prev: lastAmt, curr: pendingValue, isPending: true };
    if (entries.length >= 2) return { prev: prevAmt, curr: lastAmt, isPending: false };
    if (entries.length === 1) return { prev: null, curr: lastAmt, isPending: false };
    return { prev: null, curr: null, isPending: false };
  }

  const renderUI = createRenderUI({
    el,
    fmt2,
    fmt2Plain,
    clamp,
    normalizeTS,
    todayTS,
    MAX_LEVEL,
    MAX_CURRENT_INDICATOR,

    getAdena: () => getState().adena,
    getEntries: () => getState().entries,
    getScreenEnabled: () => getState().screenEnabled,
    getOrbsOverride: () => getState().orbsOverride,

    getPrevAndCurrForDisplay,
    lastSavedAmount,
  });

  const { render, evaluateQuotaTicker, syncQuotaTickerPosition } = renderUI;

  // ===== Features =====
  const { openHistory } = createHistoryModal({
    openModal,
    normalizeTS,
    fmt2,
    fmt2Plain,
    getEntries: () => getState().entries,
    isFileLinked: () => getState().fileLinked,
  });

  const { openOcoQuickCalc } = createOcoCalcModal({ openModal, getPrevAndCurrForDisplay });
  const { openCalculator } = createCalculatorModal({ openModal, getPrevAndCurrForDisplay });

  function applyChatVisibility() {
    // 현재는 항상 true (기존 동일)
    el.consoleLog.style.display = "block";
  }

  const background = createBackgroundFeature({
    el,
    appendLog: (s) => appendLog(el, s),
    BG_INTERVAL_MS,
    DEFAULT_BG_LIST,

    getBgList: () => getState().bgList,
    setBgList: (v) => setState((s) => ({ ...s, bgList: v })),

    getBgIndex: () => getState().bgIndex,
    setBgIndex: (v) => setState((s) => ({ ...s, bgIndex: v })),

    getBgFront: () => getState().bgFront,
    setBgFront: (v) => setState((s) => ({ ...s, bgFront: v })),

    getBgTimer: () => getState().bgTimer,
    setBgTimer: (v) => setState((s) => ({ ...s, bgTimer: v })),

    getScreenEnabled: () => getState().screenEnabled,
    setScreenEnabled: (v) => setState((s) => ({ ...s, screenEnabled: v })),

    applyChatVisibility,
    render,
  });

  const audio = createAudioFeature({
    el,
    DEFAULT_BGMUSIC,
    appendLog: (s) => appendLog(el, s),

    getBgmusic: () => getState().bgmusic,
    setBgmusic: (v) => setState((s) => ({ ...s, bgmusic: v })),

    getTrackIndex: () => getState().trackIndex,
    setTrackIndex: (v) => setState((s) => ({ ...s, trackIndex: v })),

    getIsPlaying: () => getState().isPlaying,
    setIsPlaying: (v) => setState((s) => ({ ...s, isPlaying: v })),
  });

  const sessionTimer = createSessionTimerFeature({ onTick: null });

  // ===== DB Flow (reload/save/adena/bank) =====
  const adenaTimerFeature = createAdenaTimerFeature({
    el,
    isFileLinked: () => getState().fileLinked,
    awardHourlyAdena: async (deltaHours) => db.awardHourlyAdena(deltaHours),
    pad2,
  });

  const db = createDbFlow({
    el,
    render,
    evaluateQuotaTicker,
    appendLog: (s) => appendLog(el, s),

    audio,
    background,
    adenaTimerFeature,

    getState,
    setState,
  });

  // ===== chat_log save async (내 입력만) =====
  function shouldSaveChatLog(text) {
    const s = String(text || "").trim();
    if (!s) return false;
    if (s.startsWith("/")) return false;
    return true;
  }
  async function postChatLog(message) {
    // api.js의 apiPostChatLog를 직접 import해도 되지만
    // 여기서는 llmChat 모듈에 주입하는 용도로만 유지
    const { apiPostChatLog } = await import("/src/app/api.js");
    return apiPostChatLog(message);
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

  // ===== AI Popup =====
  const ai = createAiPopup({ el, openModal, closeAllMenus2 });

  // ===== Commands =====
  const commands = createCommandsFeature({
    el,
    appendLog: (s) => appendLog(el, s),
    fmt2,
    fmt2Plain,
    normalizeTS,
    todayTS,

    getChatOverride: () => getState().chatOverride,
    setChatOverride: (v) => setState((s) => ({ ...s, chatOverride: v })),

    getOrbsOverride: () => getState().orbsOverride,
    setOrbsOverride: (v) => setState((s) => ({ ...s, orbsOverride: v })),

    getScreenEnabled: () => getState().screenEnabled,
    setScreenEnabled: (v) => setState((s) => ({ ...s, screenEnabled: v })),

    applyChatVisibility,
    render,

    background,
    audio,

    openHistory,
    openOcoQuickCalc,
    openCalculator,

    doReloadAction: db.doReloadAction,
    closeAllMenus2,

    getPrevAndCurrForDisplay,
    lastSavedAmount,

    setChatRotationEnabled: (on) => chatRotation.setEnabled(on),
  });

  // ===== LLM chat interceptor =====
  const llmChat = createLlmChat({
    el,
    appendLog: (s) => appendLog(el, s),
    chatRotationEnsureRunning: () => chatRotation.ensureRunning(),
    saveChatLogAsync,
  });

  // ===== History Tool menu =====
  const historyTool = createHistoryTool({ closeAllMenus2, openHistory });

  // ===== Matrix Tool =====
  const matrixTool = createMatrixTool({
    el,
    background,
    render,
    appendLog: (s) => appendLog(el, s),

    closeAllMenus2,
    openHistory,
    openAiChatPopup: () => ai.openAiChatPopup(),

    createGameWorldFeature,
    openModal,

    getScreenEnabled: () => getState().screenEnabled,
    setScreenEnabled: (v) => setState((s) => ({ ...s, screenEnabled: v })),

    bindBankDepositEventOnce: () => db.bindBankDepositEventOnce(),
  });

  // ===== Menu bindings =====
  function bindMenuActions() {
    el.openBtn.addEventListener("click", async () => {
      closeAllMenus2();
      await db.reloadFromDB(true);
    });
    el.saveOpenedBtn.addEventListener("click", async () => {
      closeAllMenus2();
      await db.saveTodayToDB();
    });

    el.mobileSaveBtn.addEventListener("click", async () => {
      closeAllMenus2();
      await db.saveTodayToDB();
    });
    el.downloadBtn.addEventListener("click", async () => {
      closeAllMenus2();
      await db.saveTodayToDB();
    });

    el.historyBtn.addEventListener("click", () => {
      closeAllMenus2();
      openHistory();
    });
    el.reloadBtn.addEventListener("click", async () => {
      closeAllMenus2();
      await db.doReloadAction();
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

  // ===== 입력 → pendingValue → render =====
  function applyPriceFromInput() {
    const raw = (el.priceInput.value || "").trim();
    if (!raw) return;
    const v = Number(raw);
    if (!Number.isFinite(v)) {
      alert("유효한 숫자를 입력해주세요.");
      return;
    }
    setState((s) => ({ ...s, pendingValue: v }));
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

  // ===== Countdown =====
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

  // ===== Boot =====
  bindMenuActions();

  ai.ensureAiMenuInserted();
  ai.bindAiMenuActions();

  matrixTool.bindMatrixToolAction(() => getState().entries);
  historyTool.bindHistoryToolAction();

  // Matrix 안 들어가도 은행 이벤트 들어올 수 있으니, 여기서도 1회 바인딩
  db.bindBankDepositEventOnce();

  // 인디케이터 DOM 미리 준비
  ensureBusyIndicator();

  audio.initAudio();
  background.bindToggleButtonOnce();
  commands.bindConsoleInputOnce();

  llmChat.bindLocalLlmChatInterceptorOnce();

  sessionTimer.start();
  applyChatVisibility();

  setState((s) => ({ ...s, screenEnabled: false }));
  background.setBgToggleUI();
  background.applyScreenState();

  setState((s) => ({ ...s, fileLinked: false }));
  setFileStatus(el, "DB: (미연결)");

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
      appendLog(el, "[SYSTEM] API Origin 자동탐지 실패: 프론트와 API 포트가 다를 수 있습니다.");
      setFileStatus(el, "DB: (미연결) • API/DB 상태 확인 필요 (DEFAULT 모드로 동작 중)");
      return;
    }
    appendLog(el, `[SYSTEM] API Origin = ${origin}`);

    db.reloadFromDB(true).catch((e) => {
      appendLog(el, "[SYSTEM] DB 초기 로드 실패: " + (e?.message ?? e));
      setFileStatus(el, "DB: (미연결) • API/DB 상태 확인 필요 (DEFAULT 모드로 동작 중)");
    });
  })();
})();