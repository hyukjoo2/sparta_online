// /src/app/aiPopup.js
import { LLM_ENDPOINT } from "/src/app/constants.js";
import { showBusyIndicator, hideBusyIndicator } from "/src/app/busyIndicator.js";
import { apiGetChatLogRecent, apiSearchChatLog } from "/src/app/api.js";

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

function elevateModalToFront(el) {
  // el.* 이 없을 수 있으니 방어
  try {
    if (el?.modalBackdrop) {
      el.modalBackdrop.style.zIndex = "3000000";
      el.modalBackdrop.style.position = "fixed";
      el.modalBackdrop.style.inset = "0";
    }
    if (el?.modalRoot) {
      el.modalRoot.style.zIndex = "3000001";
      el.modalRoot.style.maxWidth = "860px";
      el.modalRoot.style.width = "min(860px, calc(100vw - 24px))";
      el.modalRoot.style.maxHeight = "calc(100vh - 24px)";
    }
    if (el?.modalClose) {
      el.modalClose.style.zIndex = "3000002";
    }
  } catch (_) {}
}

export function createAiPopup({ el, openModal, closeAllMenus2 }) {
  let aiDialog = { turns: [], busy: false };

  // 내부 상태: menuUI 의존 없이 토글
  let __panelOpen = false;

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
      <button class="menu-btn" type="button" id="aiMenuBtn">AI ▾</button>
      <div class="menu-panel" role="menu" id="aiMenuPanel" style="display:none;">
        <button class="menu-item" type="button" id="aiChatBtn">AI 분석 (chat_log)</button>
      </div>
    `;

    if (toolsMenu.nextSibling) menubar.insertBefore(aiMenu, toolsMenu.nextSibling);
    else menubar.appendChild(aiMenu);
  }

  function toggleAiPanel(forceOpen = null) {
    const panel = document.getElementById("aiMenuPanel");
    if (!panel) return;

    const next = typeof forceOpen === "boolean" ? forceOpen : !__panelOpen;
    __panelOpen = next;
    panel.style.display = next ? "block" : "none";
  }

  function closeAiPanel() {
    toggleAiPanel(false);
  }

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

  function openAiChatPopup(source = "unknown") {
    try {
      // 메뉴 닫기(있으면) + AI 메뉴 패널도 닫기
      try {
        closeAllMenus2?.();
      } catch {}
      closeAiPanel();

      if (!aiDialog.turns.length) {
        aiDialog.turns.push({
          role: "ai",
          text:
            "chat_log 테이블 기반 분석 모드입니다.\n" +
            "예) '최근 감정/시장 관련 얘기만 요약해줘', '반복 패턴 찾아줘', '이번 주 키워드 TOP 5' 등",
        });
      }

      if (typeof openModal !== "function") {
        console.error("[aiPopup] openModal is not a function");
        alert("모달 UI(openModal) 연결이 없습니다. modal.js 초기화를 확인하세요.");
        return;
      }

      // ✅ 모달을 먼저 연 뒤, 그 다음 프론트로 끌어올리기 (DOM 생성 타이밍 보장)
      openModal("AI", "chat_log 분석", renderAiChatBody(), { top: true });

      // 모달 DOM이 붙은 뒤에 z-index 적용 (2번)
      requestAnimationFrame(() => {
        elevateModalToFront(el);
        requestAnimationFrame(() => elevateModalToFront(el));
      });

      console.log(`[aiPopup] opened (${source})`);

      document.getElementById("appShellPanel")?.setAttribute("aria-hidden", "true");
    } catch (e) {
      console.error("[aiPopup] open error:", e);
      alert("AI 팝업 열기 실패: " + (e?.message ?? e));
    }
  }

  function bindAiMenuActions() {
    ensureAiMenuInserted();

    const aiMenuBtn = document.getElementById("aiMenuBtn");
    const aiChatBtn = document.getElementById("aiChatBtn");

    // 1) AI 메뉴 버튼 토글(메뉴UI 없어도 동작)
    if (aiMenuBtn && aiMenuBtn.dataset.bound !== "1") {
      aiMenuBtn.dataset.bound = "1";
      aiMenuBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        // 다른 메뉴 닫기 시도
        try {
          closeAllMenus2?.();
        } catch {}
        toggleAiPanel();
      });
    }

    // 2) AI 분석 버튼 클릭
    if (aiChatBtn && aiChatBtn.dataset.bound !== "1") {
      aiChatBtn.dataset.bound = "1";
      aiChatBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openAiChatPopup("menu:aiChatBtn");
      });
    }

    // 3) 바깥 클릭 시 패널 닫기(단, 패널 내부 클릭은 무시)
    document.addEventListener(
      "click",
      (e) => {
        const t = e.target;
        const panel = document.getElementById("aiMenuPanel");
        const btn = document.getElementById("aiMenuBtn");
        if (!panel || !btn) return;

        const insidePanel = t && panel.contains(t);
        const isBtn = t && (t === btn || btn.contains(t));
        if (insidePanel || isBtn) return;

        closeAiPanel();
      },
      true
    );

    // 4) ✅ Ctrl+I 백업 단축키 (main.js 없어도 열림)
    if (!window.__aiPopupHotkeyBound) {
      window.__aiPopupHotkeyBound = true;
      window.addEventListener(
        "keydown",
        (e) => {
          if (!e.ctrlKey || !(e.key?.toLowerCase() === "i" || e.key === "ㅑ")) return;
          e.preventDefault();
          e.stopPropagation();
          openAiChatPopup("hotkey:Ctrl+I(aiPopup)");
        },
        { capture: true }
      );
    }

    // 5) 개발용 백도어 (콘솔에서 window.openAI()로 열기)
    if (!window.openAI) {
      window.openAI = () => openAiChatPopup("window.openAI()");
    }
  }

  return { ensureAiMenuInserted, bindAiMenuActions, openAiChatPopup };
}