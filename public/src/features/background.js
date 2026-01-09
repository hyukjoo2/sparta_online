// /src/features/background.js
// 배경 로테이션/페이드 (screenEnabled 상태와 연동)
// - main.js의 bgList/bgIndex/bgFront/bgTimer/screenEnabled를 "그대로" 쓰되, 제어만 이 모듈로 이동
// - bgToggleBtn 클릭도 여기서 바인딩 (중복 바인딩 방지 위해 main.js에서 제거)

export function createBackgroundFeature(ctx) {
  const {
    el,
    appendLog,
    BG_INTERVAL_MS,
    DEFAULT_BG_LIST,

    getBgList,
    setBgList,

    getBgIndex,
    setBgIndex,

    getBgFront,
    setBgFront,

    getBgTimer,
    setBgTimer,

    getScreenEnabled,
    setScreenEnabled,

    applyChatVisibility,
    render,
  } = ctx;

  function setBgToggleUI() {
    const on = !!getScreenEnabled();
    el.bgToggleBtn.title = `Screen Toggle (${on ? "ON" : "OFF"})`;
    el.bgToggleBtn.style.background = on ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.12)";
  }

  function fadeToBackground(src) {
    const bgFront = getBgFront();
    const frontEl = (bgFront === "A") ? el.bgA : el.bgB;
    const backEl  = (bgFront === "A") ? el.bgB : el.bgA;

    backEl.style.backgroundImage = `url("${src}")`;
    backEl.classList.add("show");
    frontEl.classList.remove("show");

    setBgFront(bgFront === "A" ? "B" : "A");
  }

  function clearBackgroundLayers() {
    el.bgA.classList.remove("show");
    el.bgB.classList.remove("show");
    el.bgA.style.backgroundImage = "";
    el.bgB.style.backgroundImage = "";
  }

  function stopBgRotation() {
    const t = getBgTimer();
    if (t) {
      clearInterval(t);
      setBgTimer(null);
    }
  }

  function startBgRotation(immediate = false) {
    stopBgRotation();
    if (!getScreenEnabled()) return;

    const list = (Array.isArray(getBgList()) && getBgList().length) ? getBgList() : DEFAULT_BG_LIST;
    if (!list.length) {
      appendLog("[SYSTEM] bglist가 비어있습니다. (DEFAULT도 비어있음)");
      return;
    }

    if (immediate) {
      const idx = getBgIndex();
      const src = list[idx % list.length];
      fadeToBackground(src);
    }

    const timer = setInterval(() => {
      if (!getScreenEnabled()) return;

      const list2 = (Array.isArray(getBgList()) && getBgList().length) ? getBgList() : DEFAULT_BG_LIST;
      if (!list2.length) return;

      const nextIdx = (getBgIndex() + 1) % list2.length;
      setBgIndex(nextIdx);
      const src = list2[nextIdx];
      fadeToBackground(src);
    }, BG_INTERVAL_MS);

    setBgTimer(timer);
  }

  function applyScreenState() {
    if (!getScreenEnabled()) {
      stopBgRotation();
      clearBackgroundLayers();
      applyChatVisibility();
      render();
      return;
    }
    startBgRotation(true);
    applyChatVisibility();
    render();
  }

  function bindToggleButtonOnce() {
    // 중복 바인딩 방지: dataset 플래그
    if (el.bgToggleBtn.dataset.bound === "1") return;
    el.bgToggleBtn.dataset.bound = "1";

    el.bgToggleBtn.addEventListener("click", () => {
      setScreenEnabled(!getScreenEnabled());
      setBgToggleUI();
      applyScreenState();
    });
  }

  function applyBgListFromDB(nextBglist) {
    const b = (Array.isArray(nextBglist) && nextBglist.length) ? nextBglist.slice() : null;

    setBgList(b ?? DEFAULT_BG_LIST.slice());

    // index 정규화
    const list = getBgList();
    setBgIndex(list.length ? (getBgIndex() % list.length) : 0);

    if (getScreenEnabled()) {
      clearBackgroundLayers();
      startBgRotation(true);
    }
  }

  return {
    setBgToggleUI,
    fadeToBackground,
    clearBackgroundLayers,
    stopBgRotation,
    startBgRotation,
    applyScreenState,
    bindToggleButtonOnce,
    applyBgListFromDB,
  };
}