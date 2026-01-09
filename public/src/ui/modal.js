// /src/ui/modal.js
export function createModalUI({ el }) {
  let bound = false;

  // 열기 전 상태 저장(복구용)
  const prev = {
    consoleLogDisplay: "",
    consoleCmdDisplay: "",
    consoleLogZ: "",
    consoleCmdZ: "",
    backdropBg: "",
    rootBg: "",
    rootBorder: "",
    rootShadow: "",
    rootRadius: "",
    rootPadding: "",
    rootInset: "",
    rootWidth: "",
    rootHeight: "",
    rootMaxWidth: "",
    rootMaxHeight: "",
    rootPosition: "",
    rootZ: "",
    backdropZ: "",
    backdropPosition: "",
    backdropInset: "",
  };

  let lastOpts = {
    top: false,
    onlyCloseByX: false,
    noDim: false,
    fullscreen: false,
    hideConsole: false,
  };

  function applyTop(top) {
    if (!top) return;

    // ✅ 어떤 HUD/채팅/Matrix overlay보다 위로
    prev.backdropZ = el.modalBackdrop.style.zIndex;
    prev.backdropPosition = el.modalBackdrop.style.position;
    prev.backdropInset = el.modalBackdrop.style.inset;

    prev.rootZ = el.modalRoot.style.zIndex;

    // ✅ Matrix overlay(2,000,000)보다 더 크게
    el.modalBackdrop.style.zIndex = "3000000";
    el.modalBackdrop.style.position = "fixed";
    el.modalBackdrop.style.inset = "0";

    el.modalRoot.style.zIndex = "3000001";
  }

  function applyNoDim(noDim) {
    prev.backdropBg = el.modalBackdrop.style.background;
    el.modalBackdrop.style.background = noDim ? "transparent" : prev.backdropBg || "";
  }

  function applyHideConsole(hide) {
    if (!el.consoleLog || !el.consoleCmd) return;

    prev.consoleLogDisplay = el.consoleLog.style.display;
    prev.consoleCmdDisplay = el.consoleCmd.style.display;
    prev.consoleLogZ = el.consoleLog.style.zIndex;
    prev.consoleCmdZ = el.consoleCmd.style.zIndex;

    if (hide) {
      el.consoleLog.style.display = "none";
      el.consoleCmd.style.display = "none";
    }
  }

  function applyFullscreen(fullscreen) {
    if (!fullscreen) return;

    prev.rootBg = el.modalRoot.style.background;
    prev.rootBorder = el.modalRoot.style.border;
    prev.rootShadow = el.modalRoot.style.boxShadow;
    prev.rootRadius = el.modalRoot.style.borderRadius;
    prev.rootPadding = el.modalRoot.style.padding;

    prev.rootInset = el.modalRoot.style.inset;
    prev.rootWidth = el.modalRoot.style.width;
    prev.rootHeight = el.modalRoot.style.height;
    prev.rootMaxWidth = el.modalRoot.style.maxWidth;
    prev.rootMaxHeight = el.modalRoot.style.maxHeight;
    prev.rootPosition = el.modalRoot.style.position;

    el.modalRoot.style.position = "fixed";
    el.modalRoot.style.inset = "0";
    el.modalRoot.style.width = "100vw";
    el.modalRoot.style.height = "100vh";
    el.modalRoot.style.maxWidth = "100vw";
    el.modalRoot.style.maxHeight = "100vh";

    el.modalRoot.style.background = "transparent";
    el.modalRoot.style.border = "none";
    el.modalRoot.style.boxShadow = "none";
    el.modalRoot.style.borderRadius = "0";
    el.modalRoot.style.padding = "0";

    if (el.modalTitle) el.modalTitle.style.display = "none";
    if (el.modalHint) el.modalHint.style.display = "none";

    // X 버튼은 남기되, 화면 우상단 고정
    if (el.modalClose) {
      el.modalClose.style.position = "fixed";
      el.modalClose.style.top = "12px";
      el.modalClose.style.right = "12px";
      el.modalClose.style.zIndex = "3000002";
    }
  }

  function restoreStyles() {
    if (el.consoleLog) {
      el.consoleLog.style.display = prev.consoleLogDisplay || "";
      el.consoleLog.style.zIndex = prev.consoleLogZ || "";
    }
    if (el.consoleCmd) {
      el.consoleCmd.style.display = prev.consoleCmdDisplay || "";
      el.consoleCmd.style.zIndex = prev.consoleCmdZ || "";
    }

    el.modalBackdrop.style.background = prev.backdropBg || "";
    el.modalBackdrop.style.zIndex = prev.backdropZ || "";
    el.modalBackdrop.style.position = prev.backdropPosition || "";
    el.modalBackdrop.style.inset = prev.backdropInset || "";

    el.modalRoot.style.zIndex = prev.rootZ || "";
    el.modalRoot.style.background = prev.rootBg || "";
    el.modalRoot.style.border = prev.rootBorder || "";
    el.modalRoot.style.boxShadow = prev.rootShadow || "";
    el.modalRoot.style.borderRadius = prev.rootRadius || "";
    el.modalRoot.style.padding = prev.rootPadding || "";

    el.modalRoot.style.inset = prev.rootInset || "";
    el.modalRoot.style.width = prev.rootWidth || "";
    el.modalRoot.style.height = prev.rootHeight || "";
    el.modalRoot.style.maxWidth = prev.rootMaxWidth || "";
    el.modalRoot.style.maxHeight = prev.rootMaxHeight || "";
    el.modalRoot.style.position = prev.rootPosition || "";

    if (el.modalTitle) el.modalTitle.style.display = "";
    if (el.modalHint) el.modalHint.style.display = "";

    if (el.modalClose) {
      el.modalClose.style.position = "";
      el.modalClose.style.top = "";
      el.modalClose.style.right = "";
      el.modalClose.style.zIndex = "";
    }
  }

  function openModal(title, hint, bodyNodeOrHtml, opts = {}) {
    lastOpts = {
      top: !!opts.top,
      onlyCloseByX: !!opts.onlyCloseByX,
      noDim: !!opts.noDim,
      fullscreen: !!opts.fullscreen,
      hideConsole: !!opts.hideConsole,
    };

    el.modalTitle.textContent = title || "";
    el.modalHint.textContent = hint || "";
    el.modalBody.innerHTML = "";

    if (typeof bodyNodeOrHtml === "string") el.modalBody.innerHTML = bodyNodeOrHtml;
    else if (bodyNodeOrHtml instanceof Node) el.modalBody.appendChild(bodyNodeOrHtml);

    el.modalBackdrop.classList.add("show");
    el.modalBackdrop.setAttribute("aria-hidden", "false");

    applyTop(lastOpts.top);
    applyNoDim(lastOpts.noDim);
    applyHideConsole(lastOpts.hideConsole);
    applyFullscreen(lastOpts.fullscreen);
  }

  function closeModal() {
    el.modalBackdrop.classList.remove("show");
    el.modalBackdrop.setAttribute("aria-hidden", "true");
    el.modalBody.innerHTML = "";

    restoreStyles();
    lastOpts = { top: false, onlyCloseByX: false, noDim: false, fullscreen: false, hideConsole: false };
  }

  function bindOnce() {
    if (bound) return;
    bound = true;

    el.modalClose.addEventListener("click", closeModal);

    el.modalBackdrop.addEventListener("click", (e) => {
      if (lastOpts.onlyCloseByX) return;
      if (e.target === el.modalBackdrop) closeModal();
    });

    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Escape") return;
        if (lastOpts.onlyCloseByX) return;
        closeModal();
      },
      true
    );
  }

  return { openModal, closeModal, bindOnce };
}