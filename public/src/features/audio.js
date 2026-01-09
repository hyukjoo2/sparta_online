// /src/features/audio.js
// bgm 플레이어/볼륨/뮤트
// - main.js의 bgmusic/trackIndex/isPlaying을 그대로 쓰되, 제어만 이 모듈로 이동
// - play/pause/loadTrack/UI 갱신 로직을 이 모듈로 이동

export function createAudioFeature(ctx) {
  const {
    el,
    DEFAULT_BGMUSIC,
    appendLog,

    getBgmusic,
    setBgmusic,

    getTrackIndex,
    setTrackIndex,

    getIsPlaying,
    setIsPlaying,
  } = ctx;

  function clamp2(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function setVolumeFromSlider() {
    const v = clamp2(Number(el.volSlider.value), 0, 100) / 100;
    el.bgm.volume = v;
  }

  function setPlayUI() {
    const isPlaying = !!getIsPlaying();
    if (isPlaying) {
      el.playIcon.style.display = "none";
      el.pauseIcon.style.display = "block";
      el.playBtn.title = "Pause";
    } else {
      el.playIcon.style.display = "block";
      el.pauseIcon.style.display = "none";
      el.playBtn.title = "Play";
    }
  }

  function setMuteUI() {
    if (el.bgm.muted) {
      el.volOnIcon.style.display = "none";
      el.volOffIcon.style.display = "block";
      el.muteBtn.title = "Muted";
    } else {
      el.volOnIcon.style.display = "block";
      el.volOffIcon.style.display = "none";
      el.muteBtn.title = "Unmuted";
    }
  }

  function currentList() {
    const list = (Array.isArray(getBgmusic()) && getBgmusic().length) ? getBgmusic() : DEFAULT_BGMUSIC;
    return list;
  }

  function loadTrack(i) {
    const list = currentList();
    if (!list.length) {
      el.bgm.removeAttribute("src");
      try { el.bgm.load(); } catch {}
      return;
    }
    const idx = ((i % list.length) + list.length) % list.length;
    setTrackIndex(idx);
    el.bgm.src = list[idx];
    el.bgm.load();
  }

  async function play() {
    try {
      await el.bgm.play();
      setIsPlaying(true);
      setPlayUI();
    } catch (e) {
      console.warn("[Audio] play blocked", e);
      setIsPlaying(false);
      setPlayUI();
    }
  }

  function pause() {
    el.bgm.pause();
    setIsPlaying(false);
    setPlayUI();
  }

  async function cmdMusicOn() {
    const list = currentList();
    if (!list.length) {
      appendLog("음악 ON 실패: bgmusic가 비어있습니다. (DEFAULT도 비어있음)");
      return;
    }
    if (!el.bgm.src) loadTrack(getTrackIndex());
    await play();
  }

  function cmdMusicOff() {
    pause();
    try { el.bgm.currentTime = 0; } catch {}
  }

  function bindAudioUIOnce() {
    if (el.playBtn.dataset.bound === "1") return;
    el.playBtn.dataset.bound = "1";

    el.playBtn.addEventListener("click", async () => {
      if (!getIsPlaying()) {
        if (!el.bgm.src) loadTrack(getTrackIndex());
        const list = currentList();
        if (!list.length) {
          alert("bgmusic가 비어있습니다. (DEFAULT도 비어있음)");
          return;
        }
        await play();
      } else {
        pause();
      }
    });

    el.muteBtn.addEventListener("click", () => {
      el.bgm.muted = !el.bgm.muted;
      setMuteUI();
    });

    el.volSlider.addEventListener("input", setVolumeFromSlider);

    el.bgm.addEventListener("ended", async () => {
      const list = currentList();
      if (!list.length) return;
      const next = (getTrackIndex() + 1) % list.length;
      loadTrack(next);
      await play();
    });
  }

  function initAudio() {
    setIsPlaying(false);
    el.bgm.muted = false;
    el.volSlider.value = "25";
    setVolumeFromSlider();
    loadTrack(0);
    setPlayUI();
    setMuteUI();
    bindAudioUIOnce();
  }

  async function applyBgmusicFromDB(nextBgmusic) {
    const m =
      (Array.isArray(nextBgmusic) && nextBgmusic.length) ? nextBgmusic.slice()
      : (typeof nextBgmusic === "string" && nextBgmusic.trim()) ? [nextBgmusic.trim()]
      : null;

    setBgmusic(m ?? DEFAULT_BGMUSIC.slice());

    // index 정규화
    const list = currentList();
    setTrackIndex(list.length ? (getTrackIndex() % list.length) : 0);

    const wasPlaying = !!getIsPlaying();
    pause();
    loadTrack(getTrackIndex());
    if (wasPlaying) await play();
  }

  return {
    initAudio,
    play,
    pause,
    loadTrack,
    setPlayUI,
    setMuteUI,
    setVolumeFromSlider,
    cmdMusicOn,
    cmdMusicOff,
    applyBgmusicFromDB,
    bindAudioUIOnce,
  };
}