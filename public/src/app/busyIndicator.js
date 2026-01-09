// /src/app/busyIndicator.js
let busyIndicatorEl = null;
let busyIndicatorStyleEl = null;
let busyCount = 0;

function ensureStyle() {
  if (busyIndicatorStyleEl) return;

  const st = document.createElement("style");
  st.id = "spartaBusyIndicatorStyle";
  st.textContent = `
    @keyframes spartaSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    #spartaBusyIndicator {
      position: fixed;
      inset: 0;
      z-index: 4000000;
      display: none;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,.45);
      backdrop-filter: blur(2px);
      -webkit-backdrop-filter: blur(2px);
      pointer-events: auto;
    }
    #spartaBusyIndicator .box{
      display:flex;
      align-items:center;
      gap:12px;
      padding:14px 16px;
      border-radius:14px;
      border: 1px solid rgba(255,255,255,.18);
      background: rgba(10,12,18,.72);
      box-shadow: 0 10px 30px rgba(0,0,0,.45);
      color: rgba(255,255,255,.92);
      font-size: 14px;
      max-width: min(520px, calc(100vw - 40px));
    }
    #spartaBusyIndicator .spinner{
      width:18px;
      height:18px;
      border-radius:999px;
      border: 2px solid rgba(255,255,255,.25);
      border-top-color: rgba(255,255,255,.95);
      animation: spartaSpin .9s linear infinite;
      flex: 0 0 auto;
    }
    #spartaBusyIndicator .msg{
      line-height: 1.3;
      word-break: break-word;
      white-space: pre-wrap;
    }
  `;
  document.head.appendChild(st);
  busyIndicatorStyleEl = st;
}

function ensureDom() {
  if (busyIndicatorEl) return;

  const ov = document.createElement("div");
  ov.id = "spartaBusyIndicator";
  ov.innerHTML = `
    <div class="box" role="status" aria-live="polite" aria-busy="true">
      <div class="spinner" aria-hidden="true"></div>
      <div class="msg" id="spartaBusyIndicatorMsg">처리 중...</div>
    </div>
  `;
  document.body.appendChild(ov);
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