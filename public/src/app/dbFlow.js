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

  function calcProfitBonusFromPrev(prevAmt, savedAmount) {
    const prev = Number(prevAmt);
    const curr = Number(savedAmount);
    if (!Number.isFinite(curr) || !Number.isFinite(prev)) return { profit: 0, bonus: 0, prev };
    const profit = Math.max(0, curr - prev);
    const bonus = round2(profit * 0.1);
    return { profit, bonus, prev };
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
    const prevDayAmount = getPrevDayAmountFrom(prevEntriesSnapshot, tsToday);

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

      let bonusToApply = 0;

      if (Number.isFinite(Number(out.bonus)) && Number(out.bonus) > 0) {
        bonusToApply = round2(Number(out.bonus));
      } else {
        const { profit, bonus, prev } = calcProfitBonusFromPrev(prevDayAmount, valueToSave);
        bonusToApply = Math.max(0, round2(bonus || 0));

        if (!Number.isFinite(Number(prev))) {
          appendLog("[SYSTEM] 수익 보너스 계산 불가: 전일(이전일) 데이터가 없습니다.");
        } else {
          appendLog(
            `[SYSTEM] 전일=${fmt2Plain(prev)} → 오늘=${fmt2Plain(valueToSave)} / 이익=${fmt2Plain(profit)} / 보너스=${fmt2Plain(
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