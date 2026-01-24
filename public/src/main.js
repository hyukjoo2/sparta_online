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

import { createNeoClient } from "./app/neoClient.js";

import {
  DEFAULT_BG_LIST,
  DEFAULT_BGMUSIC,
  CHATLOG_INTERVAL_MS,
  BG_INTERVAL_MS,
  MAX_LEVEL,
  MAX_CURRENT_INDICATOR,
} from "/src/app/constants.js";

import { getDomRefs } from "/src/app/dom.js";
import {
  round2,
  fmt2,
  fmt2Plain,
  pad2,
  clamp,
  normalizeTS,
  todayTS,
  setFileStatus,
  appendLog,
} from "/src/app/utils.js";
import { ensureBusyIndicator } from "/src/app/busyIndicator.js";
import { detectApiOriginIfNeeded } from "/src/app/api.js";
import { createChatRotation } from "/src/app/chatRotation.js";
import { createLlmChat } from "/src/app/llmChat.js";
import { createAiPopup } from "/src/app/aiPopup.js";
import { createMatrixTool } from "/src/app/matrixTool.js";
import { createDbFlow } from "/src/app/dbFlow.js";

(() => {
  const el = getDomRefs(document);

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

    bgTimer: null,
    bgIndex: 0,
    bgFront: "A",

    trackIndex: 0,
    isPlaying: false,
  };

  function getState() {
    return state;
  }
  function setState(updater) {
    state = typeof updater === "function" ? updater(state) : { ...state, ...updater };
  }

  // ==========================================================
  // ✅ Ctrl+T : 채팅창 높이 토글
  // ==========================================================
  let __chatHotkeyBound = false;
  let __chatToggled = false;

  let __chatBaseHeightPx = null;
  let __chatStyleBackup = null;

  function _pickChatTargetEl() {
    if (el?.consoleLog) return el.consoleLog;
    const byId = document.getElementById("consoleLog");
    if (byId) return byId;
    return null;
  }

  function _backupInlineStyleOnce(target) {
    if (__chatStyleBackup) return;
    __chatStyleBackup = {
      height: target.style.height || "",
      maxHeight: target.style.maxHeight || "",
      minHeight: target.style.minHeight || "",
      overflow: target.style.overflow || "",
      overflowY: target.style.overflowY || "",
    };
  }

  function _measureBaseHeightPx(target) {
    if (typeof __chatBaseHeightPx === "number" && __chatBaseHeightPx > 0) {
      return __chatBaseHeightPx;
    }

    const cs = window.getComputedStyle(target);
    const h = parseFloat(cs.height);

    if (Number.isFinite(h) && h > 0) {
      __chatBaseHeightPx = h;
      return __chatBaseHeightPx;
    }

    const rectH = target.getBoundingClientRect?.().height;
    __chatBaseHeightPx = Number.isFinite(rectH) && rectH > 0 ? rectH : 220;
    return __chatBaseHeightPx;
  }

  function _applyChatHeight(pxOrNull, syncQuotaTickerPosition) {
    const target = _pickChatTargetEl();
    if (!target) return;

    _backupInlineStyleOnce(target);

    if (pxOrNull == null) {
      target.style.height = __chatStyleBackup.height;
      target.style.maxHeight = __chatStyleBackup.maxHeight;
      target.style.minHeight = __chatStyleBackup.minHeight;
      target.style.overflow = __chatStyleBackup.overflow;
      target.style.overflowY = __chatStyleBackup.overflowY;
    } else {
      target.style.height = `${Math.round(pxOrNull)}px`;
      target.style.maxHeight = "none";
      if (!target.style.overflowY) target.style.overflowY = "auto";
    }

    try {
      syncQuotaTickerPosition?.();
    } catch (_) {}
  }

  function toggleChatDoubleHeight(syncQuotaTickerPosition) {
    const target = _pickChatTargetEl();
    if (!target) return;

    const base = _measureBaseHeightPx(target);

    if (!__chatToggled) {
      __chatToggled = true;
      _applyChatHeight(base * 5, syncQuotaTickerPosition);
    } else {
      __chatToggled = false;
      _applyChatHeight(null, syncQuotaTickerPosition);
    }

    try {
      if (el?.consoleInput && typeof el.consoleInput.focus === "function") {
        el.consoleInput.focus();
      }
    } catch (_) {}
  }

  function bindChatHeightHotkeyOnce(syncQuotaTickerPosition) {
    if (__chatHotkeyBound) return;
    __chatHotkeyBound = true;

    window.addEventListener(
      "keydown",
      (e) => {
        if (!e.ctrlKey || !(e.key?.toLowerCase() === "t" || e.key === "ㅅ")) return;

        e.preventDefault();
        e.stopPropagation();

        toggleChatDoubleHeight(syncQuotaTickerPosition);
      },
      { capture: true }
    );
  }
  // ==========================================================

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

  // ===== AI Popup (✅ function calling UI actions injected) =====
  const ai = createAiPopup({
    el,
    openModal,
    closeAllMenus2,

    onOpenHistory: () => {
      closeAllMenus2();
      document.getElementById("appShellPanel")?.setAttribute("aria-hidden", "true");
      openHistory();
    },
    onOpenOcoCalc: () => {
      closeAllMenus2();
      document.getElementById("appShellPanel")?.setAttribute("aria-hidden", "true");
      openOcoQuickCalc();
    },
    onOpenCalculator: () => {
      closeAllMenus2();
      document.getElementById("appShellPanel")?.setAttribute("aria-hidden", "true");
      openCalculator();
    },
  });

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

  function closeAppShellPanelIfOpen() {
    const panel = document.getElementById("appShellPanel");
    if (!panel) return;
    panel.setAttribute("aria-hidden", "true");
  }

  function bindMenuActions() {
    el.openBtn.addEventListener("click", async () => {
      closeAllMenus2();
      closeAppShellPanelIfOpen();
      await db.reloadFromDB(true);
    });

    el.saveOpenedBtn.addEventListener("click", async () => {
      closeAllMenus2();
      closeAppShellPanelIfOpen();
      await db.saveTodayToDB();
    });

    el.historyBtn.addEventListener("click", () => {
      closeAllMenus2();
      closeAppShellPanelIfOpen();
      openHistory();
    });

    el.reloadBtn.addEventListener("click", async () => {
      closeAllMenus2();
      closeAppShellPanelIfOpen();
      await db.doReloadAction();
    });

    el.ocoBtn.addEventListener("click", () => {
      closeAllMenus2();
      closeAppShellPanelIfOpen();
      openOcoQuickCalc();
    });

    el.calcBtn.addEventListener("click", () => {
      closeAllMenus2();
      closeAppShellPanelIfOpen();
      openCalculator();
    });

    const aiOpenBtn = document.getElementById("aiOpenBtn");
    if (aiOpenBtn && aiOpenBtn.dataset.bound !== "1") {
      aiOpenBtn.dataset.bound = "1";
      aiOpenBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeAllMenus2();
        closeAppShellPanelIfOpen();
        ai.openAiChatPopup("menu:aiOpenBtn");
      });
    }
  }

  // ✅ 핵심: 바인딩 호출
  bindMenuActions();

  ai.ensureAiMenuInserted();
  ai.bindAiMenuActions();

  matrixTool.bindMatrixToolAction(() => getState().entries);

  db.bindBankDepositEventOnce();

  ensureBusyIndicator();

  bindChatHeightHotkeyOnce(syncQuotaTickerPosition);

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

  let neo = null;

  (async () => {
    const origin = await detectApiOriginIfNeeded();
    if (!origin) {
      appendLog(el, "[SYSTEM] API Origin 자동탐지 실패: 프론트와 API 포트가 다를 수 있습니다.");
      setFileStatus(el, "DB: (미연결) • API/DB 상태 확인 필요 (DEFAULT 모드로 동작 중)");
      return;
    }

    appendLog(el, `[SYSTEM] API Origin = ${origin}`);

    try {
      neo = createNeoClient({
        apiOrigin: origin,
        appendLog: (s) => appendLog(el, s),
      });
      neo.start();
    } catch (e) {
      appendLog(el, "[SYSTEM] Neo 부팅 실패: " + (e?.message ?? e));
    }

    db.reloadFromDB(true).catch((e) => {
      appendLog(el, "[SYSTEM] DB 초기 로드 실패: " + (e?.message ?? e));
      setFileStatus(el, "DB: (미연결) • API/DB 상태 확인 필요 (DEFAULT 모드로 동작 중)");
    });
  })();
})();