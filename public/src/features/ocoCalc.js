// /src/features/ocoCalc.js
// OCO Quick Calc 모달 (기존 index.html의 openOcoQuickCalc()를 모듈화)

export function createOcoCalcModal(ctx) {
  const {
    openModal,
    getPrevAndCurrForDisplay,
  } = ctx;

  function openOcoQuickCalc() {
    const root = document.createElement("div");
    root.style.padding = "12px";
    root.style.background = "rgba(0,0,0,.2)";
    root.style.border = "1px solid rgba(255,255,255,.12)";
    root.style.borderRadius = "14px";

    root.innerHTML = `
      <div style="font-weight:950;margin-bottom:10px;color:rgba(255,255,255,.86)">OCO Quick Calc (Order-ready)</div>
      <div style="display:grid;grid-template-columns:repeat(4, minmax(200px, 1fr));gap:10px;align-items:end;">
        <div style="display:flex;flex-direction:column;gap:6px">
          <label style="font-size:12px;font-weight:900;color:rgba(255,255,255,.72)">Entry</label>
          <input id="oco_entry" type="number" step="0.000000001" placeholder="예: 34289.34"
            style="width:100%;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:rgba(255,255,255,.92);outline:none;">
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <label style="font-size:12px;font-weight:900;color:rgba(255,255,255,.72)">TP % (익절)</label>
          <input id="oco_tp" type="number" step="0.000000001" placeholder="예: 3"
            style="width:100%;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:rgba(255,255,255,.92);outline:none;">
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <label style="font-size:12px;font-weight:900;color:rgba(255,255,255,.72)">SL % (손절 Trigger)</label>
          <input id="oco_sl" type="number" step="0.000000001" placeholder="예: -1.5"
            style="width:100%;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:rgba(255,255,255,.92);outline:none;">
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <label style="font-size:12px;font-weight:900;color:rgba(255,255,255,.72)">SL Limit Gap %</label>
          <input id="oco_gap" type="number" step="0.000000001" placeholder="예: -1"
            style="width:100%;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:rgba(255,255,255,.92);outline:none;">
        </div>
      </div>
      <div style="height:12px"></div>
      <div style="overflow:auto;border-radius:16px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.16);">
        <table style="width:100%;border-collapse:separate;border-spacing:0;min-width:820px;">
          <thead>
            <tr>
              <th style="position:sticky;top:0;background:rgba(10,12,18,.92);z-index:3;padding:10px;border-bottom:1px solid rgba(255,255,255,.10);text-align:left;font-weight:950;">항목</th>
              <th style="position:sticky;top:0;background:rgba(10,12,18,.92);z-index:3;padding:10px;border-bottom:1px solid rgba(255,255,255,.10);text-align:left;font-weight:950;">가격</th>
              <th style="position:sticky;top:0;background:rgba(10,12,18,.92);z-index:3;padding:10px;border-bottom:1px solid rgba(255,255,255,.10);text-align:left;font-weight:950;">Entry 대비</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:10px;border-bottom:1px solid rgba(255,255,255,.10);font-weight:950;">TP Price</td>
              <td id="oco_out_tp" style="padding:10px;border-bottom:1px solid rgba(255,255,255,.10);font-weight:950;">-</td>
              <td id="oco_out_tp_pct" style="padding:10px;border-bottom:1px solid rgba(255,255,255,.10);font-weight:950;">-</td>
            </tr>
            <tr>
              <td style="padding:10px;border-bottom:1px solid rgba(255,255,255,.10);font-weight:950;">SL Trigger</td>
              <td id="oco_out_sl" style="padding:10px;border-bottom:1px solid rgba(255,255,255,.10);font-weight:950;">-</td>
              <td id="oco_out_sl_pct" style="padding:10px;border-bottom:1px solid rgba(255,255,255,.10);font-weight:950;">-</td>
            </tr>
            <tr>
              <td style="padding:10px;border-bottom:1px solid rgba(255,255,255,.10);font-weight:950;">SL Limit</td>
              <td id="oco_out_sll" style="padding:10px;border-bottom:1px solid rgba(255,255,255,.10);font-weight:950;">-</td>
              <td id="oco_out_sll_pct" style="padding:10px;border-bottom:1px solid rgba(255,255,255,.10);font-weight:950;">-</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style="margin-top:10px;color:rgba(255,255,255,.70);font-weight:900;font-size:12px;line-height:1.45">
        • 표시: 가격은 소수점 8자리, 퍼센트는 소수점 9자리<br>
        • SL Limit = SL Trigger × (1 + Gap%/100)
      </div>
    `;

    openModal("OCO Quick Calc", "주문용: Entry → TP / SL Trigger / SL Limit", root);

    const entryEl = root.querySelector("#oco_entry");
    const tpEl = root.querySelector("#oco_tp");
    const slEl = root.querySelector("#oco_sl");
    const gapEl = root.querySelector("#oco_gap");

    const outTp = root.querySelector("#oco_out_tp");
    const outSl = root.querySelector("#oco_out_sl");
    const outSll = root.querySelector("#oco_out_sll");
    const outTpPct = root.querySelector("#oco_out_tp_pct");
    const outSlPct = root.querySelector("#oco_out_sl_pct");
    const outSllPct = root.querySelector("#oco_out_sll_pct");

    function fmtPrice(x) { return Number.isFinite(x) ? x.toFixed(8) : "-"; }
    function fmtPct(x) {
      if (!Number.isFinite(x)) return "-";
      const sign = x > 0 ? "+" : "";
      return `${sign}${x.toFixed(9)}%`;
    }
    function setPctNode(node, pct) {
      node.classList.remove("positive", "negative");
      if (pct > 0) node.classList.add("positive");
      else if (pct < 0) node.classList.add("negative");
      node.textContent = fmtPct(pct);
    }

    entryEl.value = sessionStorage.getItem("oco_entry") || "";
    tpEl.value = sessionStorage.getItem("oco_tp") || "3";
    slEl.value = sessionStorage.getItem("oco_sl") || "-1.5";
    gapEl.value = sessionStorage.getItem("oco_gap") || "-1";

    function recalc() {
      const entry = Number(entryEl.value);
      const tpPct = Number(tpEl.value);
      const slPct = Number(slEl.value);
      const gapPct = Number(gapEl.value);

      sessionStorage.setItem("oco_entry", entryEl.value);
      sessionStorage.setItem("oco_tp", tpEl.value);
      sessionStorage.setItem("oco_sl", slEl.value);
      sessionStorage.setItem("oco_gap", gapEl.value);

      if (!Number.isFinite(entry) || entry === 0) {
        outTp.textContent = outSl.textContent = outSll.textContent = "-";
        outTpPct.textContent = outSlPct.textContent = outSllPct.textContent = "-";
        outTpPct.classList.remove("positive", "negative");
        outSlPct.classList.remove("positive", "negative");
        outSllPct.classList.remove("positive", "negative");
        return;
      }

      const tpPrice = entry * (1 + tpPct / 100);
      const slTrig = entry * (1 + slPct / 100);
      const slLimit = slTrig * (1 + gapPct / 100);

      outTp.textContent = fmtPrice(tpPrice);
      outSl.textContent = fmtPrice(slTrig);
      outSll.textContent = fmtPrice(slLimit);

      setPctNode(outTpPct, ((tpPrice - entry) / entry) * 100);
      setPctNode(outSlPct, ((slTrig - entry) / entry) * 100);
      setPctNode(outSllPct, ((slLimit - entry) / entry) * 100);
    }

    ["input", "change"].forEach((evt) => {
      entryEl.addEventListener(evt, recalc);
      tpEl.addEventListener(evt, recalc);
      slEl.addEventListener(evt, recalc);
      gapEl.addEventListener(evt, recalc);
    });

    if (!entryEl.value) {
      const { curr } = getPrevAndCurrForDisplay();
      if (curr !== null) entryEl.value = String(curr);
    }
    recalc();
  }

  return { openOcoQuickCalc };
}