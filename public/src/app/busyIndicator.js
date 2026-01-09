// /src/app/busyIndicator.js
let busyIndicatorEl = null;
let busyIndicatorStyleEl = null;
let busyCount = 0;

function ensureStyle() {
  // ✅ 이미 있으면 "갱신" (옛날 pointer-events:auto 같은거 남아있을 수 있음)
  let st = document.getElementById("spartaBusyIndicatorStyle");
  if (!st) {
    st = document.createElement("style");
    st.id = "spartaBusyIndicatorStyle";
    document.head.appendChild(st);
  }

  st.textContent = `
    @keyframes spartaSpin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }

    /* ✅ 전체 화면 덮지 않고, 작은 HUD(토스트)만 */
    #spartaBusyIndicator {
      position: fixed;
      left: 50%;
      bottom: 92px; /* 채팅 입력 박스 위로 살짝 */
      transform: translateX(-50%);
      z-index: 4000000;

      display: none;
      align-items: center;
      justify-content: center;

      /* 🔥 절대 화면/입력 막지 않기 */
      pointer-events: none;
    }

    #spartaBusyIndicator .box{
      pointer-events: none; /* 박스도 클릭 통과 */
      display:flex;
      align-items:center;
      gap:10px;
      padding:10px 12px;
      border-radius:14px;
      border: 1px solid rgba(255,255,255,.18);
      background: rgba(10,12,18,.80);
      box-shadow: 0 10px 30px rgba(0,0,0,.45);
      color: rgba(255,255,255,.92);
      font-size: 13px;
      max-width: min(520px, calc(100vw - 40px));
      backdrop-filter: blur(2px);
      -webkit-backdrop-filter: blur(2px);
    }

    #spartaBusyIndicator .spinner{
      width:16px;
      height:16px;
      border-radius:999px;
      border: 2px solid rgba(255,255,255,.25);
      border-top-color: rgba(255,255,255,.95);
      animation: spartaSpin .9s linear infinite;
      flex: 0 0 auto;
    }

    #spartaBusyIndicator .msg{
      line-height: 1.25;
      word-break: break-word;
      white-space: pre-wrap;
    }
  `;

  busyIndicatorStyleEl = st;
}

function ensureDom() {
  // ✅ 이미 있으면 재사용
  let ov = document.getElementById("spartaBusyIndicator");
  if (!ov) {
    ov = document.createElement("div");
    ov.id = "spartaBusyIndicator";
    document.body.appendChild(ov);
  }

  // ✅ 내용도 항상 보정(예전 DOM 구조 남아있을 수 있음)
  ov.innerHTML = `
    <div class="box" role="status" aria-live="polite" aria-busy="true">
      <div class="spinner" aria-hidden="true"></div>
      <div class="msg" id="spartaBusyIndicatorMsg">처리 중...</div>
    </div>
  `;

  busyIndicatorEl = ov;
}

export function ensureBusyIndicator() {
  ensureStyle();
  ensureDom();
  return busyIndicatorEl;
}

export function showBusyIndicator(message = "AI 응답 생성 중...") {
  ensureBusyIndicator();
  busyCount = Math.max(0, busyCount) + 1;

  const msgEl = document.getElementById("spartaBusyIndicatorMsg");
  if (msgEl) msgEl.textContent = String(message || "처리 중...");

  busyIndicatorEl.style.display = "flex";
}

export function hideBusyIndicator() {
  busyCount = Math.max(0, busyCount - 1);
  if (busyCount > 0) return;
  if (busyIndicatorEl) busyIndicatorEl.style.display = "none";
}

/**
 * (선택) 상태만 바꾸고 싶을 때
 */
export function setBusyIndicatorMessage(message = "AI 응답 생성 중...") {
  ensureBusyIndicator();
  const msgEl = document.getElementById("spartaBusyIndicatorMsg");
  if (msgEl) msgEl.textContent = String(message || "처리 중...");
}