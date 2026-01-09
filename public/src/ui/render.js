// /src/ui/render.js
export function createRenderUI({
  el,

  // formatting / utils
  fmt2,
  fmt2Plain,
  clamp,
  normalizeTS,
  todayTS,

  // constants
  MAX_LEVEL,
  MAX_CURRENT_INDICATOR,

  // state getters
  getAdena,
  getEntries,
  getScreenEnabled,
  getOrbsOverride,

  // data helpers from main
  getPrevAndCurrForDisplay,
  lastSavedAmount,
}) {
  function shouldShowOrbs() {
    const ov = getOrbsOverride();
    if (ov === false) return false;
    if (ov === true) return true;
    return !!getScreenEnabled();
  }

  function setOrbFill(fillEl, pct) {
    fillEl.style.height = clamp(pct, 0, 100).toFixed(2) + "%";
  }

  function forceRightBlue() {
    el.rightFill.classList.remove("fill-green", "fill-red", "fill-neutral");
    if (!el.rightFill.classList.contains("fill-blue")) el.rightFill.classList.add("fill-blue");
  }

  function forceLeftGreen() {
    el.leftFill.classList.remove("fill-blue", "fill-red", "fill-neutral");
    if (!el.leftFill.classList.contains("fill-green")) el.leftFill.classList.add("fill-green");
  }

  function showOrbs(yes) {
    if (yes) {
      el.leftOrb.classList.remove("hidden");
      el.rightOrb.classList.remove("hidden");
    } else {
      el.leftOrb.classList.add("hidden");
      el.rightOrb.classList.add("hidden");
    }
  }

  function arrowByDelta(delta) {
    if (delta > 0) return "▲";
    if (delta < 0) return "▼";
    return "▲";
  }

  function metricHtml(title, numberText, pctText, arrow) {
    return `
      <div class="orb-metric">
        <div class="title">${title}</div>
        <div class="num">${numberText}</div>
        <div class="pct">${pctText}</div>
        <div class="arrow">${arrow}</div>
      </div>
    `;
  }

  // ===== Quota ticker =====
  function syncQuotaTickerPosition() {
    const rect = el.topForm.getBoundingClientRect();
    el.quotaTicker.style.top = rect.bottom + 8 + "px";
  }

  function setQuotaTickerVisible(on) {
    if (on) {
      el.quotaTicker.classList.add("show");
      el.quotaTicker.setAttribute("aria-hidden", "false");
      syncQuotaTickerPosition();
    } else {
      el.quotaTicker.classList.remove("show");
      el.quotaTicker.setAttribute("aria-hidden", "true");
    }
  }

  function getPrevDayAmount() {
    const entries = getEntries();
    const tsToday = todayTS();
    for (let i = entries.length - 1; i >= 0; i--) {
      const t = normalizeTS(entries[i]?.TS);
      if (t && t !== tsToday) return Number(entries[i].AMOUNT);
    }
    return null;
  }

  function getTodayReturnPct(currentValue) {
    const prevDay = getPrevDayAmount();
    const curr = Number(currentValue);
    if (!Number.isFinite(curr) || !Number.isFinite(prevDay) || prevDay === 0) return null;
    return ((curr - prevDay) / prevDay) * 100;
  }

  function evaluateQuotaTicker() {
    const { curr } = getPrevAndCurrForDisplay();
    const current = curr !== null && Number.isFinite(Number(curr)) ? Number(curr) : null;
    if (current === null) {
      setQuotaTickerVisible(false);
      return;
    }
    const pct = getTodayReturnPct(current);
    if (pct !== null && pct >= 0.3) setQuotaTickerVisible(true);
    else setQuotaTickerVisible(false);
  }

  function setAdenaBadge() {
    const n = Number(getAdena());
    const safe = Number.isFinite(n) ? Math.max(0, n) : 0;
    el.pnlText.textContent = fmt2(safe);
  }

  function render() {
    forceRightBlue();
    forceLeftGreen();

    showOrbs(shouldShowOrbs());

    const { prev, curr, isPending } = getPrevAndCurrForDisplay();
    const savedLast = lastSavedAmount();

    setAdenaBadge();

    const currNum = curr === null ? null : Number(curr);
    if (!Number.isFinite(currNum)) {
      el.bottomFill.style.width = "0%";
      el.bottomValue.textContent = `- / ${MAX_CURRENT_INDICATOR}`;
    } else {
      const pct = clamp((currNum / MAX_CURRENT_INDICATOR) * 100, 0, 100);
      el.bottomFill.style.width = pct.toFixed(2) + "%";
      el.bottomValue.textContent = `${fmt2Plain(currNum)} / ${MAX_CURRENT_INDICATOR}`;
    }

    if (curr === null) {
      el.priceBadge.textContent = "Current: -";
      el.leftLabel.textContent = "-";
      el.rightLabel.textContent = "-";
      setOrbFill(el.leftFill, 0);
      setOrbFill(el.rightFill, 0);
      setQuotaTickerVisible(false);
      return;
    }

    el.priceBadge.textContent = `Current: ${fmt2(currNum)}` + (isPending ? " (미저장)" : "");

    const level = clamp(Math.floor(Number(currNum) / 1000), 0, MAX_LEVEL);
    const levelPct = (level / MAX_LEVEL) * 100;
    setOrbFill(el.rightFill, levelPct);

    const prevLevel = prev === null ? null : clamp(Math.floor(Number(prev) / 1000), 0, MAX_LEVEL);
    const deltaLevel = prevLevel === null ? 0 : level - prevLevel;

    el.rightLabel.innerHTML = metricHtml(
      "LEVEL",
      `${level} / ${MAX_LEVEL}`,
      `${levelPct.toFixed(2)}%`,
      prevLevel === null ? "" : arrowByDelta(deltaLevel)
    );

    const energy = Math.abs(Number(currNum)) % 1000;
    const energyPct = (energy / 999.99) * 100;
    setOrbFill(el.leftFill, energyPct);

    const arrow = savedLast === null ? "" : arrowByDelta(Number(currNum) - Number(savedLast));

    el.leftLabel.innerHTML = metricHtml(
      "ENERGY",
      `${energy.toFixed(2)} / ${999.99}`,
      `${energyPct.toFixed(2)}%`,
      arrow
    );

    evaluateQuotaTicker();
  }

  return {
    render,
    evaluateQuotaTicker,
    syncQuotaTickerPosition,
    setQuotaTickerVisible, // (디버그/확장용, main에서 안 써도 됨)
  };
}