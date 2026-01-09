// /src/features/calculator.js
// 계산기 모달 (기존 index.html의 openCalculator()를 모듈화)

export function createCalculatorModal(ctx) {
  const { openModal, getPrevAndCurrForDisplay } = ctx;

  function openCalculator() {
    const root = document.createElement("div");
    root.style.padding = "12px";
    root.style.background = "rgba(0,0,0,.2)";
    root.style.border = "1px solid rgba(255,255,255,.12)";
    root.style.borderRadius = "14px";
    root.innerHTML = `
      <div style="font-weight:950;margin-bottom:10px;color:rgba(255,255,255,.86)">계산기</div>

      <div style="padding:12px;background:rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.12);border-radius:14px;">
        <div style="font-weight:900;color:rgba(255,255,255,.82);margin-bottom:10px;">1) 현재값 + 퍼센트(%) → 예상 금액</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div style="display:flex;flex-direction:column;gap:6px;min-width:0">
            <label style="font-size:12px;font-weight:900;color:rgba(255,255,255,.72)">현재값</label>
            <input id="c1_value" type="number" step="0.000000001" placeholder="예: 34289.34"
              style="width:100%;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:rgba(255,255,255,.92);outline:none;">
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;min-width:0">
            <label style="font-size:12px;font-weight:900;color:rgba(255,255,255,.72)">퍼센트(%)</label>
            <input id="c1_pct" type="number" step="0.000000001" placeholder="예: 3"
              style="width:100%;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:rgba(255,255,255,.92);outline:none;">
          </div>
        </div>
        <div class="output" id="c1_out" style="margin-top:10px;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);font-weight:950;">예상 금액: -</div>
      </div>

      <div style="height:12px"></div>

      <div style="padding:12px;background:rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.12);border-radius:14px;">
        <div style="font-weight:900;color:rgba(255,255,255,.82);margin-bottom:10px;">2) 값1, 값2 → 상승/하락률(%)</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div style="display:flex;flex-direction:column;gap:6px;min-width:0">
            <label style="font-size:12px;font-weight:900;color:rgba(255,255,255,.72)">값1 (기준/직전)</label>
            <input id="c2_a" type="number" step="0.000000001" placeholder="예: 34289.34"
              style="width:100%;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:rgba(255,255,255,.92);outline:none;">
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;min-width:0">
            <label style="font-size:12px;font-weight:900;color:rgba(255,255,255,.72)">값2 (현재)</label>
            <input id="c2_b" type="number" step="0.000000001" placeholder="예: 34403.05"
              style="width:100%;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:rgba(255,255,255,.92);outline:none;">
          </div>
        </div>
        <div class="output" id="c2_out" style="margin-top:10px;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);font-weight:950;">변화율: -</div>
      </div>

      <div style="height:12px"></div>

      <div style="padding:12px;background:rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.12);border-radius:14px;">
        <div style="font-weight:900;color:rgba(255,255,255,.82);margin-bottom:10px;">3) 현재값의 퍼센트(%) → 예상 금액</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div style="display:flex;flex-direction:column;gap:6px;min-width:0">
            <label style="font-size:12px;font-weight:900;color:rgba(255,255,255,.72)">현재값</label>
            <input id="c3_value" type="number" step="0.000000001" placeholder="예: 100"
              style="width:100%;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:rgba(255,255,255,.92);outline:none;">
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;min-width:0">
            <label style="font-size:12px;font-weight:900;color:rgba(255,255,255,.72)">퍼센트(%)</label>
            <input id="c3_pct" type="number" step="0.000000001" placeholder="예: 50"
              style="width:100%;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:rgba(255,255,255,.92);outline:none;">
          </div>
        </div>
        <div class="output" id="c3_out" style="margin-top:10px;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);font-weight:950;">예상 금액: -</div>
      </div>
    `;

    openModal("계산기", "입력값은 유지됩니다(파일 reload와 무관)", root);

    const c1_value = root.querySelector("#c1_value");
    const c1_pct = root.querySelector("#c1_pct");
    const c1_out = root.querySelector("#c1_out");
    const c2_a = root.querySelector("#c2_a");
    const c2_b = root.querySelector("#c2_b");
    const c2_out = root.querySelector("#c2_out");

    const c3_value = root.querySelector("#c3_value");
    const c3_pct = root.querySelector("#c3_pct");
    const c3_out = root.querySelector("#c3_out");

    c1_value.value = sessionStorage.getItem("calc_c1_value") || "";
    c1_pct.value = sessionStorage.getItem("calc_c1_pct") || "";
    c2_a.value = sessionStorage.getItem("calc_c2_a") || "";
    c2_b.value = sessionStorage.getItem("calc_c2_b") || "";

    c3_value.value = sessionStorage.getItem("calc_c3_value") || "";
    c3_pct.value = sessionStorage.getItem("calc_c3_pct") || "";

    function setSignedClass(node, v) {
      node.classList.remove("positive", "negative");
      if (v > 0) node.classList.add("positive");
      else if (v < 0) node.classList.add("negative");
    }

    function calc1() {
      const v = Number(c1_value.value);
      const p = Number(c1_pct.value);
      if (!Number.isFinite(v) || !Number.isFinite(p)) {
        c1_out.textContent = "예상 금액: -";
        return;
      }
      c1_out.textContent = `예상 금액: ${(v * (1 + p / 100)).toFixed(9)}`;
    }

    function calc2() {
      const a = Number(c2_a.value);
      const b = Number(c2_b.value);
      c2_out.classList.remove("positive", "negative");
      if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0) {
        c2_out.textContent = "변화율: -";
        return;
      }
      const pct = ((b - a) / a) * 100;
      c2_out.textContent = `변화율: ${pct > 0 ? "+" : ""}${pct.toFixed(9)}%`;
      setSignedClass(c2_out, pct);
    }

    // ✅ 3) 현재값의 퍼센트(%) → 예상 금액 (v * p / 100)
    function calc3() {
      const v = Number(c3_value.value);
      const p = Number(c3_pct.value);
      if (!Number.isFinite(v) || !Number.isFinite(p)) {
        c3_out.textContent = "예상 금액: -";
        return;
      }
      c3_out.textContent = `예상 금액: ${(v * (p / 100)).toFixed(9)}`;
    }

    function persist() {
      sessionStorage.setItem("calc_c1_value", c1_value.value);
      sessionStorage.setItem("calc_c1_pct", c1_pct.value);
      sessionStorage.setItem("calc_c2_a", c2_a.value);
      sessionStorage.setItem("calc_c2_b", c2_b.value);

      sessionStorage.setItem("calc_c3_value", c3_value.value);
      sessionStorage.setItem("calc_c3_pct", c3_pct.value);
    }

    ["input", "change"].forEach((evt) => {
      c1_value.addEventListener(evt, () => {
        calc1();
        persist();
      });
      c1_pct.addEventListener(evt, () => {
        calc1();
        persist();
      });
      c2_a.addEventListener(evt, () => {
        calc2();
        persist();
      });
      c2_b.addEventListener(evt, () => {
        calc2();
        persist();
      });

      c3_value.addEventListener(evt, () => {
        calc3();
        persist();
      });
      c3_pct.addEventListener(evt, () => {
        calc3();
        persist();
      });
    });

    const { curr, prev } = getPrevAndCurrForDisplay();

    // 기존 자동 채움 유지
    if (!c1_value.value && curr !== null) c1_value.value = String(curr);
    if (!c2_a.value && prev !== null) c2_a.value = String(prev);
    if (!c2_b.value && curr !== null) c2_b.value = String(curr);

    // ✅ 3번도 현재값 자동 채움 (비어있으면)
    if (!c3_value.value && curr !== null) c3_value.value = String(curr);

    calc1();
    calc2();
    calc3();
  }

  return { openCalculator };
}