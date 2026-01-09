// /src/app/chatRotation.js
export function createChatRotation({ appendLog, intervalMs }) {
  let CHATLOG = [];
  let chatLogIndex = 0;
  let chatTimer = null;
  let enabled = true;

  function setLog(list) {
    CHATLOG = Array.isArray(list) ? list.slice() : [];
    chatLogIndex = 0;
  }

  function start() {
    if (!enabled) return;
    stop();
    if (!Array.isArray(CHATLOG) || !CHATLOG.length) return;

    appendLog(CHATLOG[chatLogIndex]);
    chatLogIndex = (chatLogIndex + 1) % CHATLOG.length;

    chatTimer = setInterval(() => {
      appendLog(CHATLOG[chatLogIndex]);
      chatLogIndex = (chatLogIndex + 1) % CHATLOG.length;
    }, intervalMs);
  }

  function stop() {
    if (chatTimer) {
      clearInterval(chatTimer);
      chatTimer = null;
    }
  }

  function setEnabled(on) {
    enabled = !!on;
    if (enabled) start();
    else stop();
  }

  function ensureRunning() {
    if (!enabled) return;
    if (!chatTimer && Array.isArray(CHATLOG) && CHATLOG.length) start();
  }

  return { setLog, start, stop, setEnabled, ensureRunning, getEnabled: () => enabled };
}