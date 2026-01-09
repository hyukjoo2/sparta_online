// /src/app/matrixTool.js
export function createMatrixTool({
  el,
  background,
  render,
  appendLog,

  closeAllMenus2,
  openHistory,
  openAiChatPopup,

  createGameWorldFeature,
  openModal,

  getScreenEnabled,
  setScreenEnabled,

  bindBankDepositEventOnce,
}) {
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

  // 메인 UI 숨김/복구
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

  // gameWorld 이벤트 처리
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
      setScreenEnabled(!!matrixPrevScreenEnabled);
      matrixPrevScreenEnabled = null;

      background.setBgToggleUI();
      background.applyScreenState();
    }

    setConsoleVisible(true);

    matrixWorld = null;
    render();
  }

  function openMatrixWorld(getEntries) {
    closeAllMenus2();
    if (matrixWorldOpen) return;
    matrixWorldOpen = true;

    hideMainUIExceptMatrix();
    bindMatrixTriggerEventsOnce();
    bindBankDepositEventOnce();

    matrixPrevScreenEnabled = getScreenEnabled();
    setScreenEnabled(true);
    background.setBgToggleUI();
    background.applyScreenState();

    setConsoleVisible(false);
    ensureMatrixOverlayCreated();

    matrixWorld = createGameWorldFeature({
      el,
      openModal,
      closeAllMenus2,
      getScreenEnabled: () => getScreenEnabled(),
      getEntries,
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

  function bindMatrixToolAction(getEntries) {
    ensureMatrixToolInserted();

    const btn = document.getElementById("matrixBtn");
    if (!btn) return;
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";

    btn.addEventListener("click", () => {
      openMatrixWorld(getEntries);
    });
  }

  return { bindMatrixToolAction, teardownMatrixWorld };
}