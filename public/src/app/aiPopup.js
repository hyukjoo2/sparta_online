// /src/app/aiPopup.js
import { LLM_ENDPOINT } from "/src/app/constants.js";
import { showBusyIndicator, hideBusyIndicator } from "/src/app/busyIndicator.js";
import { apiGetChatLogRecent, apiSearchChatLog } from "/src/app/api.js";

const MAX_MSG_CHARS = 3950; // FastAPI/Pydantic 4000 제한 대비 여유

// 실행 가능한 툴(화이트리스트)
const TOOL_NAMES = new Set(["OPEN_HISTORY_MODAL", "OPEN_OCO_CALC", "OPEN_CALCULATOR"]);

// ==============================
// 0) 로컬 1차 라우터 (LLM 없이도 최대한 처리)
// - 실패를 없애는 핵심: "UI 열기" 같은 건 룰 기반으로 먼저 처리
// ==============================
const ROUTE_RULES = [
  {
    tool: "OPEN_HISTORY_MODAL",
    // "자산현황", "자산 현황", "자산", "히스토리", "기록", "내역", "로그", "history", "asset" 등
    patterns: [
      /자\s*산\s*현\s*황/i,
      /자\s*산/i,
      /히\s*스\s*토\s*리/i,
      /기\s*록/i,
      /내\s*역/i,
      /로그/i,
      /\bhistory\b/i,
      /\basset\b/i,
      /\bportfolio\b/i,
    ],
  },
  {
    tool: "OPEN_OCO_CALC",
    patterns: [
      /\boco\b/i,
      /익\s*절/i,
      /손\s*절/i,
      /\btp\b/i,
      /\bsl\b/i,
      /스\s*탑/i,
      /트\s*레\s*일/i,
      /목\s*표\s*가/i,
    ],
  },
  {
    tool: "OPEN_CALCULATOR",
    patterns: [
      /계\s*산\s*기/i,
      /계\s*산/i,
      /더\s*하/i,
      /빼\s*기/i,
      /곱\s*하/i,
      /나\s*누/i,
      /퍼\s*센\s*트/i,
      /%/,
    ],
  },
];

function normalizeText(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim();
}

function localRouteTool(q) {
  const text = normalizeText(q).toLowerCase();
  if (!text) return null;

  // 너무 범용인 "자산" 때문에 오탐이 걱정되면, 아래처럼 최소 길이/조건을 줄 수도 있음.
  // 지금은 "안 열리는 것"이 더 문제였으니 공격적으로 잡음.
  for (const rule of ROUTE_RULES) {
    for (const re of rule.patterns) {
      if (re.test(text)) return rule.tool;
    }
  }
  return null;
}

// ==============================
// 1) log rows -> context text
// ==============================
function buildChatLogContext(rows, maxChars = 2600) {
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

// ==============================
// 2) safe trimming for user prompt (analysis mode)
// ==============================
function buildUserPrompt({ context, q }) {
  const head =
    "다음은 chat_log 테이블에서 가져온 로그이다.\n\n" +
    (context || "(로그 없음)") +
    "\n\n위 로그를 기반으로 질문에 답해줘.\n" +
    "규칙:\n" +
    "1) 로그에 없는 내용은 추측하지 말고 '로그에 없음'이라고 말해라.\n" +
    "2) 가능하면 근거가 되는 로그 id(#123 형태)를 함께 언급해라.\n" +
    "3) UI 액션을 열어야 한다면, 아래 JSON만 단독으로 출력해라(설명/문장/코드펜스 금지).\n" +
    '   {"tool":"OPEN_HISTORY_MODAL"} | {"tool":"OPEN_OCO_CALC"} | {"tool":"OPEN_CALCULATOR"}\n\n' +
    "질문: " +
    String(q || "").trim();

  if (head.length <= MAX_MSG_CHARS) return head;

  const qStr = String(q || "").trim();
  const fixed =
    "다음은 chat_log 테이블에서 가져온 로그이다.\n\n" +
    "\n\n위 로그를 기반으로 질문에 답해줘.\n" +
    "규칙:\n" +
    "1) 로그에 없는 내용은 추측하지 말고 '로그에 없음'이라고 말해라.\n" +
    "2) 가능하면 근거가 되는 로그 id(#123 형태)를 함께 언급해라.\n" +
    "3) UI 액션을 열어야 한다면, 아래 JSON만 단독으로 출력해라(설명/문장/코드펜스 금지).\n" +
    '   {"tool":"OPEN_HISTORY_MODAL"} | {"tool":"OPEN_OCO_CALC"} | {"tool":"OPEN_CALCULATOR"}\n\n' +
    "질문: " +
    qStr;

  const budgetForCtx = Math.max(0, MAX_MSG_CHARS - fixed.length - 2);
  const ctx = String(context || "");
  const cut = ctx.length > budgetForCtx ? ctx.slice(ctx.length - budgetForCtx) : ctx;

  return (
    "다음은 chat_log 테이블에서 가져온 로그이다.\n\n" +
    cut +
    "\n\n" +
    fixed.replace(/^다음은 chat_log 테이블에서 가져온 로그이다\.\n\n/, "")
  ).slice(0, MAX_MSG_CHARS);
}

// ==============================
// 3) tool call parsing (강화 버전: JSON/코드펜스/문장섞임/토큰 단독 모두 대응)
// ==============================
function stripCodeFence(s) {
  const raw = String(s || "").trim();
  if (!raw) return "";
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
}

function tryParseToolCall(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const deFenced = stripCodeFence(raw);

  // 1) 전체가 JSON이면 그대로 파싱
  if (deFenced.startsWith("{") && deFenced.endsWith("}")) {
    try {
      const obj = JSON.parse(deFenced);
      const tool = obj?.tool;
      if (typeof tool === "string" && TOOL_NAMES.has(tool)) return { tool };
    } catch (_) {}
  }

  // 2) 텍스트 중간 JSON 블록 파싱
  const m = deFenced.match(/\{[\s\S]*?\}/);
  if (m && m[0]) {
    try {
      const obj = JSON.parse(m[0]);
      const tool = obj?.tool;
      if (typeof tool === "string" && TOOL_NAMES.has(tool)) return { tool };
    } catch (_) {}
  }

  // 3) 토큰 단독
  if (TOOL_NAMES.has(deFenced)) return { tool: deFenced };

  // 4) 문장 속 포함(백업)
  for (const t of TOOL_NAMES) {
    if (deFenced.includes(t)) return { tool: t };
  }

  return null;
}

// ==============================
// 4) LLM intent-only (JSON만) + retry 루프
// - 의도 판별에 "로그" 넣지 않음 (안정성 상승)
// - 실패하면 1~2회 재시도 후 폴백
// ==============================
function buildIntentSystemPrompt() {
  return (
    "너는 UI 의도 판별기다.\n" +
    "반드시 JSON만 출력해라. 다른 문장/설명/코드펜스/마크다운 금지.\n" +
    '가능한 tool: {"tool":"OPEN_HISTORY_MODAL"} | {"tool":"OPEN_OCO_CALC"} | {"tool":"OPEN_CALCULATOR"}\n' +
    "사용자 질문이 화면을 열라는 의도라면 해당 tool을 출력.\n" +
    "해당되지 않으면 반드시 아래처럼 출력:\n" +
    '{"tool":"NONE"}\n'
  );
}

function buildIntentUserPrompt(q) {
  return (
    "사용자 질문을 보고 UI를 열어야 하는지 판단하라.\n" +
    "질문이 '자산/히스토리/기록/내역/로그/history/asset' 관련이면 OPEN_HISTORY_MODAL.\n" +
    "질문이 'OCO/익절/손절/TP/SL' 관련이면 OPEN_OCO_CALC.\n" +
    "질문이 '계산/계산기/%' 관련이면 OPEN_CALCULATOR.\n" +
    "그 외는 NONE.\n\n" +
    "질문: " +
    String(q || "").trim()
  );
}

async function callLLM({ system_prompt, messages }) {
  const res = await fetch(LLM_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system_prompt, messages }),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  const content = String(data?.content ?? "").trim();
  if (!content) throw new Error("빈 응답");
  return content;
}

async function detectIntentToolViaLLM(q, maxRetry = 2) {
  const system_prompt = buildIntentSystemPrompt();

  // 1차
  let content = await callLLM({
    system_prompt,
    messages: [{ role: "user", content: buildIntentUserPrompt(q) }],
  });

  let call = tryParseToolCall(content);
  if (call?.tool && call.tool !== "NONE") return call.tool;

  // retry 루프: "JSON만" 재강조
  for (let i = 0; i < maxRetry; i++) {
    const retryUser =
      "다시 출력해라. 반드시 JSON만. 예: {\"tool\":\"OPEN_HISTORY_MODAL\"} 또는 {\"tool\":\"NONE\"}\n" +
      "질문: " +
      String(q || "").trim();

    content = await callLLM({
      system_prompt,
      messages: [{ role: "user", content: retryUser }],
    });

    call = tryParseToolCall(content);
    if (call?.tool && call.tool !== "NONE") return call.tool;
    // NONE이면 계속 루프 (혹시 다음 retry에서 달라질 수 있음)
  }

  return null;
}

// ==============================
// main export
// ==============================
export function createAiPopup({
  el,
  openModal,
  closeAllMenus2,

  // ✅ 주입 받을 UI 액션들 (main.js에서 연결)
  onOpenHistory,
  onOpenOcoCalc,
  onOpenCalculator,
}) {
  let aiDialog = { turns: [], busy: false };
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

  function runTool(tool) {
    // 메뉴/패널 닫기
    try {
      closeAllMenus2?.();
    } catch {}
    closeAiPanel();

    // 앱쉘 패널 닫기 (있으면)
    try {
      document.getElementById("appShellPanel")?.setAttribute("aria-hidden", "true");
    } catch {}

    if (tool === "OPEN_HISTORY_MODAL") {
      if (typeof onOpenHistory === "function") onOpenHistory();
      return true;
    }
    if (tool === "OPEN_OCO_CALC") {
      if (typeof onOpenOcoCalc === "function") onOpenOcoCalc();
      return true;
    }
    if (tool === "OPEN_CALCULATOR") {
      if (typeof onOpenCalculator === "function") onOpenCalculator();
      return true;
    }
    return false;
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
    input.placeholder = "질문을 입력하세요 (예: '자산현황', '자산현황은 어때', 'OCO 계산 열어줘')";
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
        // ==========================
        // A) 1차 로컬 라우터 (즉시 실행)
        // ==========================
        const localTool = localRouteTool(q);
        if (localTool) {
          const ok = runTool(localTool);
          aiDialog.turns.push({
            role: "ai",
            text: ok ? `[SYSTEM] ${localTool} 실행됨 (local router)` : `[SYSTEM] ${localTool} 실행 실패`,
          });
          drawTurns();
          return;
        }

        // ==========================
        // B) LLM intent-only + retry (툴 판별 전용)
        // ==========================
        let llmTool = null;
        try {
          llmTool = await detectIntentToolViaLLM(q, 2);
        } catch (_) {
          llmTool = null;
        }

        if (llmTool) {
          const ok = runTool(llmTool);
          aiDialog.turns.push({
            role: "ai",
            text: ok ? `[SYSTEM] ${llmTool} 실행됨 (llm intent)` : `[SYSTEM] ${llmTool} 실행 실패`,
          });
          drawTurns();
          return;
        }

        // ==========================
        // C) 일반 분석 모드 (chat_log + 답변/요약) + 툴 JSON도 허용
        // ==========================
        let rows = [];
        try {
          rows = await apiSearchChatLog(q, 200);
        } catch {
          rows = [];
        }
        if (!Array.isArray(rows) || rows.length < 10) {
          rows = await apiGetChatLogRecent(200);
        }

        const context = buildChatLogContext(rows, 2600);

        const ANALYSIS_SYSTEM_PROMPT =
          "너는 chat_log(사용자 채팅 기록)를 분석하는 AI다. 한국어로 짧게 답해라.\n" +
          "중요: 사용자가 UI 화면 열기를 요구하면 아래 JSON만 단독으로 출력한다(설명/문장/코드펜스 금지).\n" +
          '가능한 값: {"tool":"OPEN_HISTORY_MODAL"} | {"tool":"OPEN_OCO_CALC"} | {"tool":"OPEN_CALCULATOR"}\n' +
          "그 외 질문은 일반 답변.\n" +
          "로그에 없는 사실은 추측하지 말고 '로그에 없음'이라고 말하라.\n" +
          "가능하면 로그 id(#123)를 근거로 언급하라.";

        const userContent = buildUserPrompt({ context, q });

        const content = await callLLM({
          system_prompt: ANALYSIS_SYSTEM_PROMPT,
          messages: [{ role: "user", content: userContent }],
        });

        // 응답에 tool call이 섞여도 파서가 잡아 실행
        const call = tryParseToolCall(content);
        if (call?.tool) {
          const ok = runTool(call.tool);
          aiDialog.turns.push({
            role: "ai",
            text: ok ? `[SYSTEM] ${call.tool} 실행됨 (analysis)` : `[SYSTEM] ${call.tool} 실행 실패`,
          });
          drawTurns();
          return;
        }

        // 일반 답변 출력
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
      try {
        closeAllMenus2?.();
      } catch {}
      closeAiPanel();

      if (!aiDialog.turns.length) {
        aiDialog.turns.push({
          role: "ai",
          text:
            "AI 모드: 로컬 라우터 → LLM intent-only → (필요시) chat_log 분석 순으로 동작합니다.\n" +
            "예) '자산현황' / '자산현황은 어때' → 히스토리 모달\n" +
            "예) 'OCO 계산 열어줘' → OCO 모달\n" +
            "예) '계산기 열어줘' → 계산기 모달",
        });
      }

      if (typeof openModal !== "function") {
        console.error("[aiPopup] openModal is not a function");
        alert("모달 UI(openModal) 연결이 없습니다. modal.js 초기화를 확인하세요.");
        return;
      }

      openModal("AI", "chat_log 분석", renderAiChatBody(), { top: true });

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

    if (aiMenuBtn && aiMenuBtn.dataset.bound !== "1") {
      aiMenuBtn.dataset.bound = "1";
      aiMenuBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          closeAllMenus2?.();
        } catch {}
        toggleAiPanel();
      });
    }

    if (aiChatBtn && aiChatBtn.dataset.bound !== "1") {
      aiChatBtn.dataset.bound = "1";
      aiChatBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openAiChatPopup("menu:aiChatBtn");
      });
    }

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

    if (!window.openAI) {
      window.openAI = () => openAiChatPopup("window.openAI()");
    }
  }

  return { ensureAiMenuInserted, bindAiMenuActions, openAiChatPopup };
}