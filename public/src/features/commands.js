// /src/features/commands.js
// /명령어 파서
// 변경사항 (형님 요청):
// 1) 채팅창(결과 텍스트 박스)은 항상 보임
// 2) /채팅 끔  => CHATLOG(자동 출력/로테이션)만 "정지"
// 3) /채팅 켬  => CHATLOG(자동 출력/로테이션)만 "시작"
// ✅ 핵심: main.js의 ensureChatRotationRunning이 재시작시키지 못하게
//         main.js에 chatRotationEnabled 플래그 + setChatRotationEnabled(on) 추가 후
//         여기서는 setChatRotationEnabled만 호출한다.

export function createCommandsFeature(ctx) {
  const {
    el,
    appendLog,
    fmt2,
    fmt2Plain,
    normalizeTS,
    todayTS,

    // state accessors
    getChatOverride,
    setChatOverride,
    getOrbsOverride,
    setOrbsOverride,
    getScreenEnabled,
    setScreenEnabled,

    // functions
    applyChatVisibility,
    render,

    background, // { setBgToggleUI, applyScreenState }
    audio, // { cmdMusicOn, cmdMusicOff }

    openHistory,
    openOcoQuickCalc,
    openCalculator,

    doReloadAction,
    closeAllMenus2,

    getPrevAndCurrForDisplay,
    lastSavedAmount,

    // ✅ NEW: chat rotation toggle (main.js에서 주입)
    setChatRotationEnabled,
  } = ctx;

  function fmtNowKorean() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const MM = String(d.getMonth() + 1).padStart(2, "0");
    const DD = String(d.getDate()).padStart(2, "0");
    const HH = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${yyyy}년 ${MM}월 ${DD}일 ${HH}시 ${mm}분 ${ss}초 입니다.`;
  }

  function currentExpValue() {
    const { curr } = getPrevAndCurrForDisplay();
    if (curr !== null && Number.isFinite(Number(curr))) return Number(curr);
    const last = lastSavedAmount();
    if (last !== null && Number.isFinite(Number(last))) return Number(last);
    return null;
  }

  function handleCommand(raw) {
    const normalized = (raw || "").replace(/\s+/g, " ").trim();
    if (!normalized.startsWith("/")) return;

    if (normalized === "/시간") {
      appendLog(fmtNowKorean());
      return;
    }

    if (normalized === "/경험치") {
      const v = currentExpValue();
      appendLog(v === null ? "경험치: -(값 없음)" : `경험치: USDT ${fmt2(v)}`);
      return;
    }

    // ✅ 채팅창은 항상 보이게 고정 (혹시 외부에서 건드려도 되돌림)
    if (normalized === "/채팅 끔") {
      try {
        setChatOverride(true);
        applyChatVisibility();
      } catch {}

      if (typeof setChatRotationEnabled === "function") {
        setChatRotationEnabled(false);
      }

      appendLog("채팅 로그 OFF: CHATLOG 자동 출력(로테이션)을 정지했습니다.");
      return;
    }

    if (normalized === "/채팅 켬") {
      try {
        setChatOverride(true);
        applyChatVisibility();
      } catch {}

      if (typeof setChatRotationEnabled === "function") {
        setChatRotationEnabled(true);
      }

      appendLog("채팅 로그 ON: CHATLOG 자동 출력(로테이션)을 시작했습니다.");
      return;
    }

    if (normalized === "/누구") {
      const n = Math.floor(Math.random() * 49901) + 100;
      appendLog(`현재 접속자: ${n.toLocaleString("ko-KR")} 명`);
      return;
    }

    if (normalized === "/오브 끔") {
      setOrbsOverride(false);
      render();
      appendLog("오브 OFF: 좌/우 오브를 숨겼습니다.");
      return;
    }
    if (normalized === "/오브 켬") {
      setOrbsOverride(true);
      render();
      appendLog("오브 ON: 좌/우 오브를 표시합니다.");
      return;
    }

    if (normalized === "/화면 끔") {
      setScreenEnabled(false);
      background.setBgToggleUI();
      background.applyScreenState();
      appendLog("화면 OFF: 배경을 숨겼습니다.");
      return;
    }

    if (normalized === "/화면 켬") {
      setScreenEnabled(true);
      background.setBgToggleUI();
      background.applyScreenState();
      appendLog("화면 ON: 배경을 표시합니다.");
      return;
    }

    if (normalized === "/음악 끔") {
      audio.cmdMusicOff();
      appendLog("음악 OFF: 정지했습니다.");
      return;
    }
    if (normalized === "/음악 켬") {
      audio.cmdMusicOn().then(() => appendLog("음악 ON: 재생합니다."));
      return;
    }

    if (normalized === "/리로드") {
      closeAllMenus2();
      doReloadAction().catch((e) => appendLog("리로드 실패: " + (e?.message ?? e)));
      return;
    }

    // ✅ 단축 명령어
    if (normalized === "/그래프") {
      closeAllMenus2();
      openHistory();
      return;
    }
    if (normalized === "/oco") {
      closeAllMenus2();
      openOcoQuickCalc();
      return;
    }
    if (normalized === "/계산기") {
      closeAllMenus2();
      openCalculator();
      return;
    }

    appendLog(`알 수 없는 명령어: ${normalized}`);
  }

  function bindConsoleInputOnce() {
    if (el.consoleCmd.dataset.bound === "1") return;
    el.consoleCmd.dataset.bound = "1";

    let submittingConsole = false;

    el.consoleCmd.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (submittingConsole) return;
      submittingConsole = true;

      setTimeout(() => {
        const v = (el.consoleCmd.value || "").trim();
        el.consoleCmd.value = "";
        submittingConsole = false;
        if (!v) return;

        if (v.startsWith("/")) {
          handleCommand(v);
          return;
        }

        appendLog(`[NEO] ${v}`);
      }, 0);
    });
  }

  return {
    handleCommand,
    bindConsoleInputOnce,
  };
}