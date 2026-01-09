// /src/app/llmChat.js
import { LLM_ENDPOINT, LLM_MAX_TURNS, USE_OLLAMA_ON_NORMAL_CHAT, OLLAMA_SPEAKER_POOL } from "/src/app/constants.js";
import { showBusyIndicator, hideBusyIndicator } from "/src/app/busyIndicator.js";

function trimLlmHistory(llmMessages) {
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

export function createLlmChat({
  el,
  appendLog,
  chatRotationEnsureRunning,
  saveChatLogAsync,
}) {
  const llmMessages = [{ role: "system", content: "너는 게임 플레이어야. 항상 한국말로 짧게 한줄로 대답해." }];

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
    trimLlmHistory(llmMessages);

    appendLog(`[Sparta군주] ${text}`);

    // 내가 입력한 채팅 원문 저장
    saveChatLogAsync(text);

    if (!USE_OLLAMA_ON_NORMAL_CHAT) {
      chatRotationEnsureRunning();
      return;
    }

    const prevDisabled = !!el.consoleCmd.disabled;
    el.consoleCmd.disabled = true;
    const prevPlaceholder = el.consoleCmd.placeholder;
    el.consoleCmd.placeholder = "Exaone 응답 생성 중...";

    const SYSTEM_PROMPT = "You are a player of a MMORPG. Give your answer shortly in Korean.";

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
      trimLlmHistory(llmMessages);

      appendOllamaReply(content);
    } catch (e) {
      appendLog(`[BOT] 에러: 서버 또는 Ollama 연결을 확인하세요. (${e?.message ?? e})`);
    } finally {
      hideBusyIndicator();

      el.consoleCmd.disabled = prevDisabled;
      el.consoleCmd.placeholder = prevPlaceholder || "";
      try {
        el.consoleCmd.focus();
      } catch {}
      chatRotationEnsureRunning();
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

  return { bindLocalLlmChatInterceptorOnce };
}