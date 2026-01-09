// history.js
// /src/features/history.js
// History 모달 + 꼭지점 클릭 시 Comment 팝업
// + 코멘트가 있는 꼭지점은 "조금 큰 초록색"으로 표시
// + (FIX) 코멘트 팝업 닫아도 History 모달(라인 차트)은 유지
// + (FIX2) 코멘트 팝업 z-index / pointer-events 강화 (모달 위에 확실히 뜨게)

export function createHistoryModal(ctx) {
  const { openModal, normalizeTS, fmt2, fmt2Plain, getEntries, isFileLinked } = ctx;

  function toNum(v) {
    if (v == null) return NaN;
    if (typeof v === "number") return v;
    const s = String(v).trim().replace(/,/g, "");
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  const COMMENT_API = {
    list: (historyId) => `/api/history/${encodeURIComponent(historyId)}/comments`,
    create: (historyId) => `/api/history/${encodeURIComponent(historyId)}/comments`,
    update: (commentId) => `/api/history/comments/${encodeURIComponent(commentId)}`,
    remove: (commentId) => `/api/history/comments/${encodeURIComponent(commentId)}`,
  };

  async function httpJson(url, options = {}) {
    const res = await fetch(url, {
      cache: "no-store",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${url}\n${txt.slice(0, 200)}`);
    }
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) return await res.json();
    const t = await res.text();
    try {
      return JSON.parse(t);
    } catch {
      return t;
    }
  }

  async function apiListComments(historyId) {
    const out = await httpJson(COMMENT_API.list(historyId), { method: "GET" });
    const arr = Array.isArray(out) ? out : Array.isArray(out?.comments) ? out.comments : [];
    return arr
      .map((c) => ({
        id: c?.id ?? c?.comment_id ?? c?.COMMENT_ID,
        history_id: c?.history_id ?? c?.HISTORY_ID ?? historyId,
        body: c?.body ?? c?.comment ?? c?.CONTENT ?? "",
        created_at: c?.created_at ?? c?.CREATED_AT ?? null,
        updated_at: c?.updated_at ?? c?.UPDATED_AT ?? null,
      }))
      .filter((c) => c.id != null)
      .sort((a, b) => {
        const ta = new Date(a.created_at || a.updated_at || 0).getTime();
        const tb = new Date(b.created_at || b.updated_at || 0).getTime();
        return tb - ta;
      });
  }

  async function apiCreateComment(historyId, body) {
    return await httpJson(COMMENT_API.create(historyId), {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  }

  async function apiUpdateComment(commentId, body) {
    return await httpJson(COMMENT_API.update(commentId), {
      method: "PUT",
      body: JSON.stringify({ body }),
    });
  }

  async function apiDeleteComment(commentId) {
    return await httpJson(COMMENT_API.remove(commentId), { method: "DELETE" });
  }

  function makeCard() {
    const card = document.createElement("div");
    card.style.background = "rgba(0,0,0,.22)";
    card.style.border = "1px solid rgba(255,255,255,.12)";
    card.style.borderRadius = "16px";
    card.style.boxShadow = "0 18px 44px rgba(0,0,0,.45)";
    return card;
  }

  function makeInputBase() {
    const el = document.createElement("textarea");
    el.style.width = "100%";
    el.style.minHeight = "110px";
    el.style.resize = "vertical";
    el.style.padding = "12px 14px";
    el.style.borderRadius = "14px";
    el.style.border = "1px solid rgba(255,255,255,.16)";
    el.style.background = "rgba(10,12,18,.65)";
    el.style.color = "rgba(255,255,255,.92)";
    el.style.outline = "none";
    el.style.fontSize = "14px";
    el.style.fontWeight = "800";
    el.style.boxSizing = "border-box";
    el.style.lineHeight = "1.45";
    return el;
  }

  function makeBtn(label, variant = "primary") {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cursor = "pointer";
    b.style.borderRadius = "12px";
    b.style.padding = "10px 12px";
    b.style.fontWeight = "900";
    b.style.border = "1px solid rgba(255,255,255,.16)";
    b.style.background = "rgba(10,12,18,.55)";
    b.style.color = "rgba(255,255,255,.92)";
    b.style.boxShadow = "0 14px 28px rgba(0,0,0,.35)";
    b.style.transition = "transform .08s ease, opacity .08s ease";
    b.onmousedown = () => (b.style.transform = "scale(0.98)");
    b.onmouseup = () => (b.style.transform = "scale(1)");
    b.onmouseleave = () => (b.style.transform = "scale(1)");

    if (variant === "danger") {
      b.style.border = "1px solid rgba(255,77,79,.35)";
      b.style.background = "rgba(255,77,79,.08)";
      b.style.color = "rgba(255,200,200,.95)";
    } else if (variant === "primary") {
      b.style.border = "1px solid rgba(60,255,122,.28)";
      b.style.background = "rgba(60,255,122,.10)";
      b.style.color = "rgba(200,255,220,.98)";
    }
    return b;
  }

  function fmtTsHuman(v) {
    if (!v) return "";
    const d = new Date(v);
    if (!Number.isFinite(d.getTime())) return String(v);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  }

  // ============================================================
  // Comment Popup (Independent overlay) - z-index harden
  // ============================================================
  function openCommentPopupForPoint(historyRow, onChanged) {
    const historyId = historyRow?.id ?? historyRow?.ID ?? historyRow?.history_id ?? null;
    const ts = normalizeTS(historyRow?.TS) || String(historyRow?.TS ?? "");
    const amt = Number.isFinite(historyRow?.AMOUNT) ? historyRow.AMOUNT : toNum(historyRow?.AMOUNT);

    if (!historyId) {
      alert("history_id(id) 를 찾을 수 없습니다. history row에 id가 포함되어야 합니다.");
      return;
    }

    console.log("[CommentPopup] open", { historyId, ts, amt, historyRow });

    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.left = "0";
    overlay.style.top = "0";
    overlay.style.right = "0";
    overlay.style.bottom = "0";
    overlay.style.background = "rgba(0,0,0,.55)";
    overlay.style.backdropFilter = "blur(4px)";
    overlay.style.zIndex = "2147483647"; // 최대치로 올림
    overlay.style.pointerEvents = "auto";
    overlay.style.display = "flex";
    overlay.style.alignItems = "flex-start";
    overlay.style.justifyContent = "center";
    overlay.style.padding = "16px";
    overlay.style.overflow = "auto";

    const prevActive = document.activeElement;

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };

    const close = () => {
      try {
        document.removeEventListener("keydown", onKeyDown, true);
      } catch {}
      try {
        overlay.remove();
      } catch {}
      if (prevActive && typeof prevActive.focus === "function") {
        try {
          prevActive.focus();
        } catch {}
      }
    };

    document.addEventListener("keydown", onKeyDown, true);

    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) close();
    });

    const panel = document.createElement("div");
    panel.style.width = "min(860px, 96vw)";
    panel.style.marginTop = "18px";
    panel.style.borderRadius = "18px";
    panel.style.border = "1px solid rgba(255,255,255,.14)";
    panel.style.background = "rgba(8,10,14,.78)";
    panel.style.boxShadow = "0 30px 80px rgba(0,0,0,.65)";
    panel.style.overflow = "hidden";
    panel.style.pointerEvents = "auto";

    const root = document.createElement("div");
    root.style.padding = "12px";
    root.style.display = "flex";
    root.style.flexDirection = "column";
    root.style.gap = "12px";

    const head = makeCard();
    head.style.padding = "12px 12px";
    head.style.display = "flex";
    head.style.alignItems = "center";
    head.style.justifyContent = "space-between";
    head.style.gap = "12px";

    const headLeft = document.createElement("div");
    headLeft.style.display = "flex";
    headLeft.style.flexDirection = "column";
    headLeft.style.gap = "4px";

    const headTitle = document.createElement("div");
    headTitle.style.fontWeight = "950";
    headTitle.style.color = "rgba(255,255,255,.92)";
    headTitle.style.fontSize = "16px";
    headTitle.textContent = "코멘트";

    const headSub = document.createElement("div");
    headSub.style.fontWeight = "850";
    headSub.style.color = "rgba(255,255,255,.72)";
    headSub.style.fontSize = "12px";
    headSub.textContent = `${ts} • USDT ${fmt2(amt)} • history_id=${historyId}`;

    headLeft.appendChild(headTitle);
    headLeft.appendChild(headSub);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "✕";
    closeBtn.style.width = "44px";
    closeBtn.style.height = "44px";
    closeBtn.style.borderRadius = "12px";
    closeBtn.style.border = "1px solid rgba(255,255,255,.18)";
    closeBtn.style.background = "rgba(10,12,18,.55)";
    closeBtn.style.color = "rgba(255,255,255,.92)";
    closeBtn.style.fontWeight = "950";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.boxShadow = "0 14px 28px rgba(0,0,0,.35)";
    closeBtn.addEventListener("click", close);

    head.appendChild(headLeft);
    head.appendChild(closeBtn);

    const inputCard = makeCard();
    inputCard.style.padding = "12px";

    const inputLabel = document.createElement("div");
    inputLabel.style.margin = "0 0 8px";
    inputLabel.style.fontWeight = "950";
    inputLabel.style.color = "rgba(255,255,255,.86)";
    inputLabel.textContent = "새 코멘트";

    const input = makeInputBase();
    input.placeholder = "여기에 코멘트를 입력하세요...";

    const saveNewBtn = makeBtn("저장하기", "primary");
    saveNewBtn.style.marginTop = "10px";

    const statusLine = document.createElement("div");
    statusLine.style.marginTop = "8px";
    statusLine.style.fontSize = "12px";
    statusLine.style.fontWeight = "850";
    statusLine.style.color = "rgba(255,255,255,.65)";
    statusLine.textContent = "";

    inputCard.appendChild(inputLabel);
    inputCard.appendChild(input);
    inputCard.appendChild(saveNewBtn);
    inputCard.appendChild(statusLine);

    const listCard = makeCard();
    listCard.style.padding = "12px";

    const listTitle = document.createElement("div");
    listTitle.style.margin = "0 0 8px";
    listTitle.style.fontWeight = "950";
    listTitle.style.color = "rgba(255,255,255,.86)";
    listTitle.textContent = "코멘트 목록 (최신순)";

    const listWrap = document.createElement("div");
    listWrap.style.display = "flex";
    listWrap.style.flexDirection = "column";
    listWrap.style.gap = "10px";

    listCard.appendChild(listTitle);
    listCard.appendChild(listWrap);

    root.appendChild(head);
    root.appendChild(inputCard);
    root.appendChild(listCard);

    panel.appendChild(root);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // 실제로 붙었는지 확인용
    console.log("[CommentPopup] appended overlay:", document.body.contains(overlay));

    setTimeout(() => {
      try {
        input.focus();
      } catch {}
    }, 0);

    function renderComments(comments) {
      listWrap.innerHTML = "";

      if (!comments.length) {
        const empty = document.createElement("div");
        empty.style.padding = "12px";
        empty.style.borderRadius = "14px";
        empty.style.border = "1px dashed rgba(255,255,255,.14)";
        empty.style.background = "rgba(10,12,18,.35)";
        empty.style.color = "rgba(255,255,255,.70)";
        empty.style.fontWeight = "850";
        empty.textContent = "코멘트가 없습니다.";
        listWrap.appendChild(empty);
        return;
      }

      comments.forEach((c) => {
        const item = document.createElement("div");
        item.style.padding = "12px";
        item.style.borderRadius = "14px";
        item.style.border = "1px solid rgba(255,255,255,.12)";
        item.style.background = "rgba(10,12,18,.35)";

        const meta = document.createElement("div");
        meta.style.display = "flex";
        meta.style.alignItems = "center";
        meta.style.justifyContent = "space-between";
        meta.style.gap = "10px";
        meta.style.marginBottom = "8px";

        const metaLeft = document.createElement("div");
        metaLeft.style.fontWeight = "900";
        metaLeft.style.color = "rgba(255,255,255,.70)";
        metaLeft.style.fontSize = "12px";
        metaLeft.textContent = `#${c.id} • ${fmtTsHuman(c.created_at)}`;

        const metaRight = document.createElement("div");
        metaRight.style.fontWeight = "900";
        metaRight.style.color = "rgba(255,255,255,.55)";
        metaRight.style.fontSize = "12px";
        metaRight.textContent = c.updated_at ? `(updated: ${fmtTsHuman(c.updated_at)})` : "";

        meta.appendChild(metaLeft);
        meta.appendChild(metaRight);

        const ta = makeInputBase();
        ta.style.minHeight = "90px";
        ta.value = String(c.body || "");

        const btnRow = document.createElement("div");
        btnRow.style.display = "flex";
        btnRow.style.justifyContent = "flex-end";
        btnRow.style.gap = "8px";
        btnRow.style.marginTop = "10px";

        const delBtn = makeBtn("삭제", "danger");
        const updBtn = makeBtn("저장하기", "primary");

        const rowStatus = document.createElement("div");
        rowStatus.style.marginTop = "8px";
        rowStatus.style.fontSize = "12px";
        rowStatus.style.fontWeight = "850";
        rowStatus.style.color = "rgba(255,255,255,.60)";
        rowStatus.textContent = "";

        delBtn.addEventListener("click", async () => {
          if (!confirm("이 코멘트를 삭제할까요?")) return;
          try {
            delBtn.disabled = true;
            updBtn.disabled = true;
            rowStatus.textContent = "삭제 중...";
            await apiDeleteComment(c.id);
            rowStatus.textContent = "삭제 완료.";
            await refresh();
            if (typeof onChanged === "function") onChanged(historyId);
          } catch (e) {
            console.error(e);
            rowStatus.textContent = "삭제 실패: " + (e?.message ?? e);
            alert("삭제 실패: " + (e?.message ?? e));
          } finally {
            delBtn.disabled = false;
            updBtn.disabled = false;
          }
        });

        updBtn.addEventListener("click", async () => {
          const next = String(ta.value || "").trim();
          if (!next) {
            alert("내용이 비어있습니다.");
            return;
          }
          try {
            delBtn.disabled = true;
            updBtn.disabled = true;
            rowStatus.textContent = "저장 중...";
            await apiUpdateComment(c.id, next);
            rowStatus.textContent = "저장 완료.";
            await refresh();
            if (typeof onChanged === "function") onChanged(historyId);
          } catch (e) {
            console.error(e);
            rowStatus.textContent = "저장 실패: " + (e?.message ?? e);
            alert("저장 실패: " + (e?.message ?? e));
          } finally {
            delBtn.disabled = false;
            updBtn.disabled = false;
          }
        });

        btnRow.appendChild(delBtn);
        btnRow.appendChild(updBtn);

        item.appendChild(meta);
        item.appendChild(ta);
        item.appendChild(btnRow);
        item.appendChild(rowStatus);

        listWrap.appendChild(item);
      });
    }

    async function refresh() {
      statusLine.textContent = "불러오는 중...";
      try {
        const comments = await apiListComments(historyId);
        renderComments(comments);
        statusLine.textContent = `OK • ${comments.length}개`;
      } catch (e) {
        console.error(e);
        statusLine.textContent = "불러오기 실패: " + (e?.message ?? e);
        listWrap.innerHTML = "";
        const err = document.createElement("div");
        err.style.padding = "12px";
        err.style.borderRadius = "14px";
        err.style.border = "1px solid rgba(255,77,79,.25)";
        err.style.background = "rgba(255,77,79,.06)";
        err.style.color = "rgba(255,220,220,.92)";
        err.style.fontWeight = "900";
        err.style.whiteSpace = "pre-wrap";
        err.textContent =
          "코멘트 API 호출에 실패했습니다.\n" +
          "- GET    /api/history/:historyId/comments\n" +
          "- POST   /api/history/:historyId/comments\n" +
          "- PUT    /api/history/comments/:commentId\n" +
          "- DELETE /api/history/comments/:commentId\n\n" +
          String(e?.message ?? e);
        listWrap.appendChild(err);
      }
    }

    saveNewBtn.addEventListener("click", async () => {
      const body = String(input.value || "").trim();
      if (!body) {
        alert("내용이 비어있습니다.");
        return;
      }
      try {
        saveNewBtn.disabled = true;
        statusLine.textContent = "저장 중...";
        await apiCreateComment(historyId, body);
        input.value = "";
        statusLine.textContent = "저장 완료.";
        await refresh();
        if (typeof onChanged === "function") onChanged(historyId);
      } catch (e) {
        console.error(e);
        statusLine.textContent = "저장 실패: " + (e?.message ?? e);
        alert("저장 실패: " + (e?.message ?? e));
      } finally {
        saveNewBtn.disabled = false;
      }
    });

    input.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") saveNewBtn.click();
    });

    refresh();
  }

  function openHistory() {
    const entries = getEntries();
    const commentedIds = new Set();

    const root = document.createElement("div");
    root.style.padding = "12px";
    root.style.background = "rgba(0,0,0,.2)";
    root.style.border = "1px solid rgba(255,255,255,.12)";
    root.style.borderRadius = "14px";

    const hint = document.createElement("div");
    hint.style.margin = "0 0 10px";
    hint.style.fontWeight = "900";
    hint.style.color = "rgba(255,255,255,.75)";
    hint.textContent = isFileLinked()
      ? "DB(history) 라인 차트입니다. (hover: 날짜/금액, 라벨: 직전 대비 %)"
      : "DB history 데이터가 없거나 연결 전일 수 있습니다.";

    const data = (Array.isArray(entries) ? entries.slice() : [])
      .filter((r) => r && r.TS != null && r.AMOUNT != null)
      .map((r) => {
        const ts = normalizeTS(r.TS) || String(r.TS);
        const amt = toNum(r.AMOUNT);
        const pnl = toNum(r.PNL);
        const id = r.id ?? r.ID ?? r.history_id ?? r.HISTORY_ID ?? null;
        return { ...r, id, TS: ts, AMOUNT: amt, PNL: pnl };
      })
      .filter((r) => r.TS && Number.isFinite(r.AMOUNT))
      .sort((a, b) => String(a.TS).localeCompare(String(b.TS)));

    const sliced = data.length > 60 ? data.slice(data.length - 60) : data;

    const chartWrap = document.createElement("div");
    chartWrap.style.position = "relative";
    chartWrap.style.width = "100%";
    chartWrap.style.height = "320px";
    chartWrap.style.border = "1px solid rgba(255,255,255,.12)";
    chartWrap.style.borderRadius = "14px";
    chartWrap.style.background = "rgba(0,0,0,.18)";
    chartWrap.style.overflow = "hidden";

    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "320px";
    canvas.style.display = "block";
    chartWrap.appendChild(canvas);

    const tooltip = document.createElement("div");
    tooltip.style.position = "absolute";
    tooltip.style.left = "0";
    tooltip.style.top = "0";
    tooltip.style.transform = "translate(-9999px,-9999px)";
    tooltip.style.padding = "8px 10px";
    tooltip.style.borderRadius = "12px";
    tooltip.style.border = "1px solid rgba(255,255,255,.18)";
    tooltip.style.background = "rgba(10,12,18,.92)";
    tooltip.style.color = "rgba(255,255,255,.92)";
    tooltip.style.fontWeight = "900";
    tooltip.style.fontSize = "12px";
    tooltip.style.pointerEvents = "none";
    tooltip.style.boxShadow = "0 14px 28px rgba(0,0,0,.55)";
    tooltip.style.whiteSpace = "nowrap";
    chartWrap.appendChild(tooltip);

    root.appendChild(hint);
    root.appendChild(chartWrap);

    const tableTitle = document.createElement("div");
    tableTitle.style.margin = "12px 0 6px";
    tableTitle.style.fontWeight = "950";
    tableTitle.style.color = "rgba(255,255,255,.82)";
    tableTitle.textContent = "Recent 20 (Table)";
    root.appendChild(tableTitle);

    const rows = sliced.slice().reverse().slice(0, 20);
    const table = document.createElement("table");
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";
    table.innerHTML = `
      <thead>
        <tr>
          <th style="text-align:left; padding:8px; border-bottom:1px solid rgba(255,255,255,.12);">TS</th>
          <th style="text-align:right; padding:8px; border-bottom:1px solid rgba(255,255,255,.12);">AMOUNT</th>
          <th style="text-align:right; padding:8px; border-bottom:1px solid rgba(255,255,255,.12);">PNL</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((r) => {
            const pnl = Number.isFinite(r.PNL) ? r.PNL : 0;
            const cls = pnl >= 0 ? "positive" : "negative";
            return `
            <tr>
              <td style="padding:8px; border-bottom:1px solid rgba(255,255,255,.08);">${normalizeTS(r.TS) || String(r.TS)}</td>
              <td style="padding:8px; text-align:right; border-bottom:1px solid rgba(255,255,255,.08);">${fmt2Plain(r.AMOUNT)}</td>
              <td style="padding:8px; text-align:right; border-bottom:1px solid rgba(255,255,255,.08);" class="${cls}">${fmt2Plain(pnl)}</td>
            </tr>
          `;
          })
          .join("")}
      </tbody>
    `;
    root.appendChild(table);

    openModal("History", `rows=${entries.length}`, root, { top: true });

    const ctx2d = canvas.getContext("2d");
    let DPR = Math.max(1, window.devicePixelRatio || 1);

    function niceNum(n) {
      if (!Number.isFinite(n)) return "0.00";
      if (Math.abs(n) >= 1000)
        return n.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return n.toFixed(2);
    }

    let points = [];
    let hoverIndex = -1;

    function getWrapSize() {
      const rect = chartWrap.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width || chartWrap.clientWidth || 1));
      const h = Math.max(1, Math.floor(rect.height || chartWrap.clientHeight || 1));
      return { w, h };
    }

    function resizeCanvas() {
      DPR = Math.max(1, window.devicePixelRatio || 1);
      const { w, h } = getWrapSize();
      if (w <= 2 || h <= 2) {
        requestAnimationFrame(resizeCanvas);
        return;
      }
      const nextW = Math.floor(w * DPR);
      const nextH = Math.floor(h * DPR);
      if (canvas.width !== nextW) canvas.width = nextW;
      if (canvas.height !== nextH) canvas.height = nextH;
      draw();
    }

    async function refreshCommentFlagsForSliced() {
      const ids = sliced.map((r) => r?.id).filter((id) => id != null);
      if (!ids.length) return;

      const CONCURRENCY = 6;
      let cursor = 0;

      async function worker() {
        while (cursor < ids.length) {
          const i = cursor++;
          const hid = ids[i];
          try {
            const comments = await apiListComments(hid);
            if (Array.isArray(comments) && comments.length > 0) commentedIds.add(hid);
            else commentedIds.delete(hid);
          } catch {
            // ignore
          }
        }
      }

      const workers = Array.from({ length: Math.min(CONCURRENCY, ids.length) }, () => worker());
      await Promise.allSettled(workers);
      draw();
    }

    async function refreshCommentFlagOne(historyId) {
      if (historyId == null) return;
      try {
        const comments = await apiListComments(historyId);
        if (Array.isArray(comments) && comments.length > 0) commentedIds.add(historyId);
        else commentedIds.delete(historyId);
        draw();
      } catch {}
    }

    function draw() {
      const W = canvas.width, H = canvas.height;
      if (W <= 2 || H <= 2) return;

      ctx2d.clearRect(0, 0, W, H);

      const padL = 78 * DPR;
      const padR = 68 * DPR;
      const padT = 18 * DPR;
      const padB = 48 * DPR;

      const plotW = W - padL - padR;
      const plotH = H - padT - padB;

      if (!sliced.length) {
        ctx2d.fillStyle = "rgba(255,255,255,.75)";
        ctx2d.font = `${14 * DPR}px system-ui`;
        ctx2d.fillText("history 데이터가 없습니다.", padL, padT + 24 * DPR);
        points = [];
        return;
      }

      const ys = sliced.map((d) => d.AMOUNT).filter((n) => Number.isFinite(n));
      let minY = Math.min(...ys);
      let maxY = Math.max(...ys);

      if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
        minY = 0;
        maxY = 1;
      }

      if (minY === maxY) {
        const bump = Math.max(1, Math.abs(minY) * 0.02);
        minY -= bump;
        maxY += bump;
      }

      const yRange = maxY - minY || 1;

      ctx2d.strokeStyle = "rgba(255,255,255,.10)";
      ctx2d.lineWidth = 1 * DPR;
      const gridN = 4;
      for (let i = 0; i <= gridN; i++) {
        const y = padT + (plotH * i) / gridN;
        ctx2d.beginPath();
        ctx2d.moveTo(padL, y);
        ctx2d.lineTo(padL + plotW, y);
        ctx2d.stroke();
      }

      ctx2d.fillStyle = "rgba(255,255,255,.72)";
      ctx2d.font = `${12 * DPR}px system-ui`;
      for (let i = 0; i <= gridN; i++) {
        const v = maxY - (yRange * i) / gridN;
        const y = padT + (plotH * i) / gridN;
        ctx2d.fillText(niceNum(v), 10 * DPR, y + 4 * DPR);
      }

      points = sliced.map((d, i) => {
        const x = padL + plotW * (sliced.length === 1 ? 0.5 : i / (sliced.length - 1));
        const y = padT + plotH * (1 - (d.AMOUNT - minY) / yRange);
        return { x, y, d };
      });

      ctx2d.strokeStyle = "rgba(255,255,255,.85)";
      ctx2d.lineWidth = 2 * DPR;
      ctx2d.beginPath();
      points.forEach((p, idx) => {
        if (idx === 0) ctx2d.moveTo(p.x, p.y);
        else ctx2d.lineTo(p.x, p.y);
      });
      ctx2d.stroke();

      points.forEach((p, idx) => {
        const hid = p?.d?.id;
        const hasComment = hid != null && commentedIds.has(hid);

        const baseR = 3.5 * DPR;
        const r = hasComment ? 5.3 * DPR : baseR;

        if (hasComment) {
          ctx2d.fillStyle = "#3cff7a";
          ctx2d.beginPath();
          ctx2d.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx2d.fill();

          ctx2d.strokeStyle = "rgba(60,255,122,.35)";
          ctx2d.lineWidth = 2 * DPR;
          ctx2d.beginPath();
          ctx2d.arc(p.x, p.y, r + 3.5 * DPR, 0, Math.PI * 2);
          ctx2d.stroke();
        } else {
          ctx2d.fillStyle = "rgba(255,255,255,.92)";
          ctx2d.beginPath();
          ctx2d.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx2d.fill();
        }

        if (idx === hoverIndex) {
          ctx2d.strokeStyle = "rgba(60,255,122,.55)";
          ctx2d.lineWidth = 2 * DPR;
          ctx2d.beginPath();
          ctx2d.arc(p.x, p.y, 8 * DPR, 0, Math.PI * 2);
          ctx2d.stroke();
        }

        if (idx >= 1) {
          const prev = points[idx - 1].d.AMOUNT;
          const curr = p.d.AMOUNT;
          if (Number.isFinite(prev) && prev !== 0 && Number.isFinite(curr)) {
            const pct = ((curr - prev) / prev) * 100;
            const isPos = pct >= 0;
            ctx2d.fillStyle = isPos ? "#3cff7a" : "#ff4d4f";
            ctx2d.font = `${12 * DPR}px system-ui`;
            const text = `${isPos ? "+" : ""}${pct.toFixed(2)}%`;
            ctx2d.fillText(text, p.x + 6 * DPR, p.y - 8 * DPR);
          }
        }
      });

      const labelIdx =
        sliced.length <= 3
          ? [...Array(sliced.length).keys()]
          : [0, Math.floor((sliced.length - 1) / 2), sliced.length - 1];

      ctx2d.fillStyle = "rgba(255,255,255,.70)";
      ctx2d.font = `${12 * DPR}px system-ui`;
      labelIdx.forEach((i) => {
        const p = points[i];
        if (!p) return;
        const ts = normalizeTS(p.d.TS) || String(p.d.TS);
        ctx2d.fillText(ts, p.x - 18 * DPR, padT + plotH + 30 * DPR);
      });
    }

    function hitTest(mx, my) {
      const r = 10 * DPR;
      let best = -1;
      let bestDist = Infinity;
      for (let i = 0; i < points.length; i++) {
        const dx = mx - points[i].x;
        const dy = my - points[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= r && dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      }
      return best;
    }

    function moveTooltip(i, clientX, clientY) {
      if (i < 0) {
        tooltip.style.transform = "translate(-9999px,-9999px)";
        return;
      }
      const d = points[i].d;
      const ts = normalizeTS(d.TS) || String(d.TS);
      const amt = d.AMOUNT;
      tooltip.innerHTML = `${ts}<br>USDT ${fmt2(amt)}`;

      const rect = chartWrap.getBoundingClientRect();
      const tw = tooltip.offsetWidth || 220;
      const th = tooltip.offsetHeight || 60;

      const localX = clientX - rect.left;
      const localY = clientY - rect.top;

      const margin = 12;

      let x = localX + margin;
      let y = localY + margin;

      if (x + tw + margin > rect.width) x = localX - tw - margin;
      x = Math.max(margin, Math.min(x, rect.width - tw - margin));

      if (y + th + margin > rect.height) y = localY - th - margin;
      y = Math.max(margin, Math.min(y, rect.height - th - margin));

      tooltip.style.transform = `translate(${x}px, ${y}px)`;
    }

    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * DPR;
      const my = (e.clientY - rect.top) * DPR;

      const idx = hitTest(mx, my);
      if (idx !== hoverIndex) {
        hoverIndex = idx;
        draw();
      }
      moveTooltip(idx, e.clientX, e.clientY);
    });

    canvas.addEventListener("mouseleave", () => {
      hoverIndex = -1;
      draw();
      moveTooltip(-1, 0, 0);
    });

    canvas.addEventListener("click", (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * DPR;
      const my = (e.clientY - rect.top) * DPR;

      const idx = hitTest(mx, my);
      console.log("[HistoryChart] click idx=", idx);

      if (idx < 0) return;

      const row = points[idx]?.d;
      if (!row) return;

      if (row.id == null) {
        alert("이 history row에 id가 없습니다. /api/history 에서 id를 내려주세요.");
        return;
      }

      openCommentPopupForPoint(row, (historyId) => refreshCommentFlagOne(historyId));
    });

    const ro = new ResizeObserver(() => resizeCanvas());
    ro.observe(chartWrap);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resizeCanvas();
        refreshCommentFlagsForSliced();
      });
    });

    const cleanupTick = setInterval(() => {
      if (!document.body.contains(root)) {
        try { ro.disconnect(); } catch {}
        clearInterval(cleanupTick);
      }
    }, 800);
  }

  return { openHistory };
}