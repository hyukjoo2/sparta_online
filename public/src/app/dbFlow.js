// /src/app/dbFlow.js
import { apiGetAllTables, apiSaveTodayAmount, apiAdenaDelta } from "/src/app/api.js";
import { round2, fmt2, fmt2Plain, todayTS, normalizeTS, setFileStatus } from "/src/app/utils.js";

export function createDbFlow({
  el,
  render,
  evaluateQuotaTicker,
  appendLog,

  audio,
  background,
  adenaTimerFeature,

  getState,
  setState,
}) {
  // 직렬화 큐
  let adenaWriting = Promise.resolve();

  // 은행 입금 pending (DB 미연결 때 누적)
  let pendingBankDeposit = 0;

  // ==========================================================
  // ✅ Money FX (earn/loss gif overlay)
  // ==========================================================
  let __moneyFxEl = null;
  let __moneyFxTimer = null;

  function ensureMoneyFxOverlay() {
    if (__moneyFxEl) return __moneyFxEl;

    const wrap = document.createElement("div");
    wrap.id = "moneyFxOverlay";
    wrap.style.position = "fixed";
    wrap.style.left = "50%";
    wrap.style.top = "50%";
    wrap.style.transform = "translate(-50%, -50%)";
    wrap.style.zIndex = "2147483000";
    wrap.style.pointerEvents = "none";
    wrap.style.display = "none";

    const img = document.createElement("img");
    img.alt = "money-fx";
    img.style.maxWidth = "70vw";
    img.style.maxHeight = "70vh";
    img.style.objectFit = "contain";
    img.style.filter = "drop-shadow(0 10px 28px rgba(0,0,0,.55))";

    wrap.appendChild(img);
    document.body.appendChild(wrap);

    __moneyFxEl = wrap;
    return __moneyFxEl;
  }

  function showMoneyFx(kind /* 'earn' | 'loss' */, ms = 3000) {
    const wrap = ensureMoneyFxOverlay();
    const img = wrap.querySelector("img");
    if (!img) return;

    const src = kind === "earn" ? "/bglist/earn_money.gif" : "/bglist/loss_money.gif";
    img.src = `${src}?t=${Date.now()}`; // cache bust

    wrap.style.display = "block";

    if (__moneyFxTimer) clearTimeout(__moneyFxTimer);
    __moneyFxTimer = setTimeout(() => {
      wrap.style.display = "none";
    }, ms);
  }

  function maybeShowProfitFx(baseAmount, todayAmount) {
    if (baseAmount == null) return; // ✅ 핵심: null/undefined면 비교 자체를 안 함

    const prev = Number(baseAmount);
    const curr = Number(todayAmount);
    if (!Number.isFinite(prev) || !Number.isFinite(curr)) return;

    const diff = curr - prev;
    if (diff > 0) showMoneyFx("earn", 3000);
    else if (diff < 0) showMoneyFx("loss", 3000);
  }
  // ==========================================================

  async function applyMediaConfigFromDB(nextBgmusic, nextBglist) {
    await audio.applyBgmusicFromDB(nextBgmusic);
    background.applyBgListFromDB(nextBglist);
  }

  async function applyAdenaDeltaQueued(delta, reason = "SYSTEM") {
    const d = Number(delta);
    if (!Number.isFinite(d) || d <= 0) return;

    const { fileLinked } = getState();

    // DB 미연결이면 pending 누적 + 로컬 반영
    if (!fileLinked) {
      pendingBankDeposit = round2(pendingBankDeposit + d);
      setState((s) => ({ ...s, adena: Number(s.adena || 0) + d }));
      render();
      appendLog(`[${reason}] DB 미연결: 아데나 +${fmt2(d)} (임시 누적). pending=${fmt2(pendingBankDeposit)}`);
      setFileStatus(el, `DB: (미연결) • pending adena=${fmt2(pendingBankDeposit)}`);
      return;
    }

    adenaWriting = adenaWriting
      .then(async () => {
        const out = await apiAdenaDelta(d);
        setState((s) => ({ ...s, adena: Number(out.adena || 0) }));
        render();
        appendLog(`[${reason}] 아데나 +${fmt2(d)} (DB 저장 완료). 현재 아데나: ${fmt2(Number(out.adena || 0))}`);
        setFileStatus(el, `DB: adena 업데이트(+${fmt2(d)})`);
      })
      .catch((e) => {
        appendLog(`[${reason}] 아데나 업데이트 실패: ` + (e?.message ?? e));
      });

    return adenaWriting;
  }

  async function awardHourlyAdena(deltaHours) {
    const { fileLinked } = getState();
    if (!fileLinked) return;

    const delta = Number(deltaHours);
    if (!Number.isFinite(delta) || delta <= 0) return;

    adenaWriting = adenaWriting
      .then(async () => {
        const out = await apiAdenaDelta(delta);
        setState((s) => ({ ...s, adena: Number(out.adena || 0) }));
        render();
        appendLog(`[SYSTEM] 1시간 경과 → 아데나 +${fmt2(delta)} (DB 저장 완료). 현재 아데나: ${fmt2(Number(out.adena || 0))}`);
        setFileStatus(el, `DB: adena 업데이트(+${fmt2(delta)}/hr)`);
      })
      .catch((e) => {
        appendLog("[SYSTEM] 아데나 자동지급 실패: " + (e?.message ?? e));
      });

    return adenaWriting;
  }

  async function reloadFromDB(isOpenFlow = false) {
    setFileStatus(el, "DB: (전체 테이블 로딩 중...)");

    const all = await apiGetAllTables();

    const nextAdena = Number(all?.adena || 0);
    const nextEntries = Array.isArray(all?.history) ? all.history.slice() : [];

    setState((s) => ({
      ...s,
      adena: nextAdena,
      entries: nextEntries,
      pendingValue: null,
      fileLinked: true,
    }));

    el.priceInput.value = "";

    await applyMediaConfigFromDB(all?.bgmusic, all?.bglist);

    adenaTimerFeature.start();

    // DB 연결 후 pending flush
    if (pendingBankDeposit > 0) {
      const flush = pendingBankDeposit;
      pendingBankDeposit = 0;
      await applyAdenaDeltaQueued(flush, "BANK(PENDING)");
    }

    setFileStatus(el, `DB: 연결됨 (${isOpenFlow ? "Initial" : "Reload"})`);
    const { screenEnabled } = getState();
    if (screenEnabled) background.applyScreenState();
    else render();

    evaluateQuotaTicker();
  }

  async function doReloadAction() {
    await reloadFromDB(false);
    appendLog("리로드: DB ALL TABLES Reload 완료.");
  }

  function getPrevDayAmountFrom(historyArr, tsToday) {
    const rows = (Array.isArray(historyArr) ? historyArr : [])
      .filter((r) => r && r.TS != null && r.AMOUNT != null)
      .map((r) => ({ ts: normalizeTS(r.TS), amt: Number(r.AMOUNT) }))
      .filter((x) => x.ts && Number.isFinite(x.amt))
      .sort((a, b) => String(a.ts).localeCompare(String(b.ts)));

    for (let i = rows.length - 1; i >= 0; i--) {
      if (String(rows[i].ts) < String(tsToday)) return rows[i].amt;
    }
    return null;
  }

  function getSameDayAmountFrom(historyArr, tsToday) {
    const rows = (Array.isArray(historyArr) ? historyArr : [])
      .filter((r) => r && r.TS != null && r.AMOUNT != null)
      .map((r) => ({ ts: normalizeTS(r.TS), amt: Number(r.AMOUNT) }))
      .filter((x) => x.ts && Number.isFinite(x.amt))
      .filter((x) => String(x.ts) === String(tsToday));

    // 같은 날이 여러 개면 "마지막" (정렬 필요하면 TS+id 기준인데, 여기선 배열 뒤에서부터 찾는 방식이 더 안전)
    for (let i = rows.length - 1; i >= 0; i--) return rows[i].amt;
    return null;
  }

  function getLastAmountFromEntries(entriesArr) {
    const arr = Array.isArray(entriesArr) ? entriesArr : [];
    for (let i = arr.length - 1; i >= 0; i--) {
      const a = Number(arr[i]?.AMOUNT);
      if (Number.isFinite(a)) return a;
    }
    return null;
  }

  function calcProfitBonusFromBase(baseAmt, savedAmount) {
    if (baseAmt == null) return { profit: 0, bonus: 0, prev: null }; // ✅ 추가

    const prev = Number(baseAmt);
    const curr = Number(savedAmount);
    if (!Number.isFinite(curr) || !Number.isFinite(prev)) return { profit: 0, bonus: 0, prev: null };

    const profit = Math.max(0, curr - prev);
    const bonus = round2(profit * 0.1);
    return { profit, bonus, prev };
  }

  function pickBaseAmountForDiff(entriesSnapshot, tsToday) {
    // 1) 같은 날 값(오늘 overwrite 기준) 우선
    const sameDay = getSameDayAmountFrom(entriesSnapshot, tsToday);
    if (Number.isFinite(Number(sameDay))) return Number(sameDay);

    // 2) 없으면 전일 값
    const prevDay = getPrevDayAmountFrom(entriesSnapshot, tsToday);
    if (Number.isFinite(Number(prevDay))) return Number(prevDay);

    // 3) 그것도 없으면 직전 마지막 값
    const last = getLastAmountFromEntries(entriesSnapshot);
    if (Number.isFinite(Number(last))) return Number(last);

    return null;
  }

  async function saveTodayToDB() {
    const { pendingValue, entries, adena } = getState();

    if (pendingValue === null) {
      alert("저장할 값이 없습니다. (가격 입력 후 Enter로 UI 반영 후 저장)");
      return;
    }

    const valueToSave = Number(pendingValue);
    const tsToday = todayTS();

    const prevEntriesSnapshot = entries.slice();
    const baseForDiff = pickBaseAmountForDiff(prevEntriesSnapshot, tsToday);

    setFileStatus(el, `DB: 저장 중... • TS=${tsToday}`);

    try {
      const out = await apiSaveTodayAmount(valueToSave);

      const outHistory = Array.isArray(out.history) ? out.history.slice() : entries;
      const outAdena = Number(out.adena || adena || 0);

      setState((s) => ({
        ...s,
        entries: outHistory,
        pendingValue: null,
        adena: outAdena,
        fileLinked: true,
      }));

      el.priceInput.value = "";

      // ✅ 요구사항: 차익 +/- 시 중앙 GIF 3초 표시
      // ✅ 버그 수정: base는 "같은날(오늘) 기존값" 우선
      maybeShowProfitFx(baseForDiff, valueToSave);

      let bonusToApply = 0;

      // 서버가 bonus를 내려주면 그걸 우선
      if (Number.isFinite(Number(out.bonus)) && Number(out.bonus) > 0) {
        bonusToApply = round2(Number(out.bonus));
      } else {
        // ✅ 버그 수정: 보너스 계산도 "같은날 overwrite 기준"으로
        const { profit, bonus, prev } = calcProfitBonusFromBase(baseForDiff, valueToSave);
        bonusToApply = Math.max(0, round2(bonus || 0));

        if (!Number.isFinite(Number(prev))) {
          appendLog("[SYSTEM] 수익 보너스 계산 불가: 비교 기준 데이터가 없습니다.");
        } else {
          appendLog(
            `[SYSTEM] 기준=${fmt2Plain(prev)} → 저장=${fmt2Plain(valueToSave)} / 이익=${fmt2Plain(profit)} / 보너스=${fmt2Plain(
              bonusToApply
            )}`
          );
        }
      }

      if (bonusToApply > 0) {
        const deltaOut = await apiAdenaDelta(bonusToApply);
        setState((s) => ({ ...s, adena: Number(deltaOut.adena || s.adena || 0) }));
        appendLog(`[SYSTEM] 수익 보너스 아데나 +${fmt2(bonusToApply)} (이익의 10%).`);
      } else {
        appendLog(`[SYSTEM] 수익 보너스 없음 (이익이 없거나 계산 불가).`);
      }

      adenaTimerFeature.start();

      const st = getState();
      setFileStatus(el, `DB: 저장 OK(오늘 overwrite) • adena=${fmt2(st.adena)} • len=${st.entries.length}`);
      render();
      evaluateQuotaTicker();
    } catch (e) {
      alert("DB 저장 실패: " + (e?.message ?? e));
      console.error(e);
      setState((s) => ({ ...s, pendingValue: valueToSave }));
      render();
      setFileStatus(el, "DB: 저장 실패 • API 상태 확인");
    }
  }

  // bank deposit event binding (main에서 1회만 호출되도록)
  const bankDepositEventState = { bound: false };
  function bindBankDepositEventOnce() {
    if (bankDepositEventState.bound) return;
    bankDepositEventState.bound = true;

    window.addEventListener("adena:deposit", (e) => {
      const amt = Number(e?.detail?.amount);
      if (!Number.isFinite(amt) || amt <= 0) return;
      applyAdenaDeltaQueued(amt, "BANK");
    });

    window.updateAdena = (delta) => applyAdenaDeltaQueued(delta, "BANK");
    window.addAdena = (delta) => applyAdenaDeltaQueued(delta, "BANK");
  }

  return {
    reloadFromDB,
    doReloadAction,
    saveTodayToDB,
    awardHourlyAdena,
    applyAdenaDeltaQueued,
    bindBankDepositEventOnce,
  };
}