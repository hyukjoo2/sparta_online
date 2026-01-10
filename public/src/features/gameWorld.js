// gameWorld.js
// /src/features/gameWorld.js
// GameWorld (Fullscreen-aware)
//
// ✅ 형님 요청 반영(마을 절반 크기 + 재진입 + 화면 끝 청크 이동 + 마을 내부 EXIT + Agen NPC)
// ✅ 추가(아데나 💰):
// - 💰는 청크마다 랜덤(결정론적) 생성
// - 화면 왼쪽 위에 💰 총량 표시
// - 플레이어가 💰에 닿으면 💰 +1 (죽음/리젠 없음)
// - ✅ Agen과 부딪혀서 죽고 마을 리젠될 때 💰을 0으로 초기화
//
// ✅ 추가(은행 🏦):
// - (0,0) 마을 내부 "왼쪽 아래"에 은행 건물 생성
// - 캐릭터가 은행(트리거)에 닿으면, 현재 들고있는 💰(state.money)을 "DB adena"에 더하는 이벤트를 발생시킴
//   -> main.js 쪽 기존 adena 업데이트 로직에서 이 이벤트를 받아 처리하면 됨
// - 입금 후 들고 있는 💰은 0으로 초기화
//
// ✅ 추가(전투 - 칼 공격):
// - 스페이스바로 공격
// - 전방 60도 부채꼴 + 맞으면 즉사
// - Agen 사망 시 10% 확률로 💰 드랍 (1~10개), 드랍된 💰은 기존 픽업 로직(개당 +1) 사용

export function createGameWorldFeature({
  el,
  openModal,
  closeAllMenus2,
  getScreenEnabled,
  getEntries,
  onOpenAiPopup,
}) {
  const state = {
    enabled: true,
    running: false,

    tile: 32,
    cols: 30,
    rows: 18,

    x: 5 * 32 + 16,
    y: 5 * 32 + 16,
    r: 10,
    speed: 200,

    keys: { up: false, down: false, left: false, right: false },
    clickMove: null,

    canvas: null,
    ctx: null,
    raf: null,
    lastT: 0,

    worldX: 0,
    worldY: 0,
    chunkW: 0,
    chunkH: 0,

    blocks: new Set(),
    triggers: [],
    lastTriggerId: null,

    chunkMeta: null, // { villageRect?: {...}, bankRect?: {...} }

    worlds: new Map(),

    // ✅ NPCs
    npcs: [], // { id, type, name, x, y, r, speed, dirX, dirY, thinkT }

    // ✅ Coins
    coins: [], // { id, x, y, r, alive }
    money: 0,
    moneyFlashT: 0, // +1 되었을 때 살짝 강조

    // ✅ death/respawn
    deadFlashT: 0, // 화면 플래시(초)

    // ✅ combat
    facingX: 1, // 마지막 이동 방향(전방 판정에 사용)
    facingY: 0,
    attackT: 0, // 공격 이펙트 타이머
    attackCdT: 0, // 공격 쿨다운
    dropSeq: 0, // 드랍 코인 id 시퀀스

    _keysBound: false,
    _resizeBound: false,
  };

  // =========================================
  // helpers
  // =========================================
  function keyCR(c, r) {
    return `${c},${r}`;
  }
  function keyWorld(wx, wy) {
    return `${wx},${wy}`;
  }
  function pxToCell(px) {
    return Math.floor(px / state.tile);
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function emitMatrixAction(action) {
    try {
      window.dispatchEvent(new CustomEvent("matrix:trigger", { detail: { action } }));
    } catch {}
  }

  // ✅ 은행 입금 이벤트 (main.js에서 받아서 DB adena 업데이트)
  function emitAdenaDeposit(amount) {
    if (!amount || amount <= 0) return;
    try {
      window.dispatchEvent(new CustomEvent("adena:deposit", { detail: { amount } }));
      return;
    } catch {}

    // fallback: 혹시 main.js에 전역 함수가 있으면 사용
    try {
      if (typeof window.updateAdena === "function") window.updateAdena(amount);
      else if (typeof window.addAdena === "function") window.addAdena(amount);
    } catch {}
  }

  // deterministic rng
  function hash32(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function makeRng(seed) {
    let x = seed >>> 0;
    return () => {
      x ^= x << 13;
      x >>>= 0;
      x ^= x >>> 17;
      x >>>= 0;
      x ^= x << 5;
      x >>>= 0;
      return (x >>> 0) / 4294967296;
    };
  }

  function randDir(rng) {
    const ang = rng() * Math.PI * 2;
    return { x: Math.cos(ang), y: Math.sin(ang) };
  }

  function normalize(x, y) {
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len, len };
  }

  function setFacingFromVector(dx, dy) {
    const n = normalize(dx, dy);
    if (n.len > 0.0001) {
      state.facingX = n.x;
      state.facingY = n.y;
    }
  }

  function getOriginGlobal() {
    return { ox: state.chunkW / 2, oy: state.chunkH / 2 };
  }

  function getPlayerGlobal() {
    return {
      gx: state.worldX * state.chunkW + state.x,
      gy: state.worldY * state.chunkH + state.y,
    };
  }

  function getPlayerRelativeToOrigin() {
    const { ox, oy } = getOriginGlobal();
    const { gx, gy } = getPlayerGlobal();
    return { rx: gx - ox, ry: gy - oy };
  }

  // 현재 (0,0) 청크에서 플레이어가 "마을 내부"에 있는지
  function isInVillageInterior() {
    if (!(state.worldX === 0 && state.worldY === 0)) return false;
    const vr = state.chunkMeta?.villageRect;
    if (!vr) return false;

    const c = pxToCell(state.x);
    const r = pxToCell(state.y);

    // fence 안쪽(테두리 제외)
    return c > vr.leftC && c < vr.rightC && r > vr.topC && r < vr.bottomC;
  }

  // ✅ NPC가 "마을 내부"에 있는지 (Agen 진입 금지용)
  function npcInVillageInterior(nx, ny, radius) {
    if (!(state.worldX === 0 && state.worldY === 0)) return false;
    const vr = state.chunkMeta?.villageRect;
    if (!vr) return false;

    const padPx = Math.max(0, radius);
    const leftPx = (vr.leftC + 1) * state.tile + padPx;
    const rightPx = (vr.rightC - 1) * state.tile - padPx;
    const topPx = (vr.topC + 1) * state.tile + padPx;
    const bottomPx = (vr.bottomC - 1) * state.tile - padPx;

    return nx > leftPx && nx < rightPx && ny > topPx && ny < bottomPx;
  }

  // =========================================
  // collision (current chunk)
  // =========================================
  function isBlockedCell(c, r) {
    if (c < 0 || r < 0 || c >= state.cols || r >= state.rows) return true;
    return state.blocks.has(keyCR(c, r));
  }

  function circleHitsBlocked(nx, ny) {
    const pts = [
      [nx, ny],
      [nx - state.r, ny],
      [nx + state.r, ny],
      [nx, ny - state.r],
      [nx, ny + state.r],
      [nx - state.r, ny - state.r],
      [nx + state.r, ny - state.r],
      [nx - state.r, ny + state.r],
      [nx + state.r, ny + state.r],
    ];
    for (const [x, y] of pts) {
      const c = pxToCell(x);
      const r = pxToCell(y);
      if (isBlockedCell(c, r)) return true;
    }
    return false;
  }

  function clampToChunk(nx, ny) {
    const x = Math.max(state.r, Math.min(state.chunkW - state.r, nx));
    const y = Math.max(state.r, Math.min(state.chunkH - state.r, ny));
    return { x, y };
  }

  // NPC collision (circle)
  function npcHitsBlocked(nx, ny, r) {
    const pts = [
      [nx, ny],
      [nx - r, ny],
      [nx + r, ny],
      [nx, ny - r],
      [nx, ny + r],
    ];
    for (const [x, y] of pts) {
      const c = pxToCell(x);
      const rr = pxToCell(y);
      if (isBlockedCell(c, rr)) return true;
    }
    return false;
  }

  // =========================================
  // size sync
  // =========================================
  function syncWorldSizeFromCanvas() {
    if (!state.canvas) return;

    const rect = state.canvas.getBoundingClientRect();
    const cols = Math.max(10, Math.floor(rect.width / state.tile));
    const rows = Math.max(8, Math.floor(rect.height / state.tile));

    const changed = cols !== state.cols || rows !== state.rows;
    state.cols = cols;
    state.rows = rows;

    state.chunkW = state.cols * state.tile;
    state.chunkH = state.rows * state.tile;

    if (changed) {
      state.worlds.clear();
      loadChunk(state.worldX, state.worldY);

      const cl = clampToChunk(state.x, state.y);
      state.x = cl.x;
      state.y = cl.y;
    }
  }

  // =========================================
  // ✅ EXIT (GameWorld 종료)
  // =========================================
  function exitGameWorld() {
    try {
      closeAllMenus2?.();
    } catch {}

    emitMatrixAction("exit");

    stop();

    state.keys.up = state.keys.down = state.keys.left = state.keys.right = false;
    state.clickMove = null;
    state.lastTriggerId = null;

    try {
      if (state.canvas && state.canvas.parentNode) {
        state.canvas.parentNode.removeChild(state.canvas);
      }
    } catch {}

    state.canvas = null;
    state.ctx = null;

    state.enabled = false;
  }

  // =========================================
  // ✅ death & respawn (goblin only)
  // =========================================
  function findSafeVillageSpawn() {
    const vr = state.chunkMeta?.villageRect;
    if (!vr) {
      return { x: state.chunkW / 2, y: state.chunkH / 2 };
    }

    const midC = Math.floor((vr.leftC + vr.rightC) / 2);
    const midR = Math.floor((vr.topC + vr.bottomC) / 2);

    const maxRing = 12;
    for (let ring = 0; ring <= maxRing; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.abs(dc) !== ring && Math.abs(dr) !== ring) continue;

          const c = midC + dc;
          const r = midR + dr;

          if (!(c > vr.leftC && c < vr.rightC && r > vr.topC && r < vr.bottomC)) continue;

          const x = c * state.tile + state.tile / 2;
          const y = r * state.tile + state.tile / 2;

          const cl = clampToChunk(x, y);
          if (circleHitsBlocked(cl.x, cl.y)) continue;

          return { x: cl.x, y: cl.y };
        }
      }
    }

    const cl = clampToChunk(midC * state.tile + state.tile / 2, midR * state.tile + state.tile / 2);
    return { x: cl.x, y: cl.y };
  }

  function respawnInVillage() {
    // ✅ 형님 요청: Agen 죽음 리젠 시 아데나 초기화
    state.money = 0;
    state.moneyFlashT = 0;

    state.keys.up = state.keys.down = state.keys.left = state.keys.right = false;
    state.clickMove = null;
    state.lastTriggerId = null;

    loadChunk(0, 0);

    const p = findSafeVillageSpawn();
    state.x = p.x;
    state.y = p.y;

    state.deadFlashT = 0.25;
  }

  function killPlayerAndRespawn() {
    respawnInVillage();
  }

  function checkGoblinCollision() {
    if (!state.npcs || state.npcs.length === 0) return false;

    for (const n of state.npcs) {
      const dx = state.x - n.x;
      const dy = state.y - n.y;
      const rr = state.r + (n.r || 10);
      if (dx * dx + dy * dy <= rr * rr) {
        killPlayerAndRespawn();
        return true;
      }
    }
    return false;
  }

  // =========================================
  // ✅ COINS (Adena)
  // =========================================
  function circleHitsCoin(px, py, pr, coin) {
    if (!coin.alive) return false;
    const dx = px - coin.x;
    const dy = py - coin.y;
    const rr = pr + (coin.r || 8);
    return dx * dx + dy * dy <= rr * rr;
  }

  function checkCoinPickup() {
    if (!state.coins || state.coins.length === 0) return false;

    let picked = false;
    for (const c of state.coins) {
      if (!c.alive) continue;
      if (circleHitsCoin(state.x, state.y, state.r, c)) {
        c.alive = false;
        state.money += 1;
        state.moneyFlashT = 0.25;
        picked = true;
      }
    }
    return picked;
  }

  function buildCoinsForChunk(wx, wy, meta) {
    const seed = hash32(`coins:${wx},${wy}`);
    const rng = makeRng(seed);

    // 청크당 3~6개
    const count = 3 + Math.floor(rng() * 4);

    const coins = [];
    for (let i = 0; i < count; i++) {
      const id = `coin_${wx}_${wy}_${i}`;
      const r = 8;

      let x = 0,
        y = 0;

      for (let tries = 0; tries < 120; tries++) {
        const c = 1 + Math.floor(rng() * (state.cols - 2));
        const rr = 1 + Math.floor(rng() * (state.rows - 2));

        x = c * state.tile + state.tile / 2;
        y = rr * state.tile + state.tile / 2;

        // 블록 위는 금지
        if (isBlockedCell(c, rr)) continue;

        // 트리거 위는 피하기
        let onTrigger = false;
        for (const t of state.triggers) {
          if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) {
            onTrigger = true;
            break;
          }
        }
        if (onTrigger) continue;

        if (circleHitsBlocked(x, y)) continue;
        break;
      }

      coins.push({ id, x, y, r, alive: true });
    }

    return coins;
  }

  // ✅ 드랍 코인 생성 (현재 청크의 coins 배열에 추가 = 청크 캐시에도 그대로 유지됨)
  function spawnDropCoinsAt(x, y, count) {
    if (!count || count <= 0) return;

    for (let i = 0; i < count; i++) {
      const id = `drop_${state.worldX}_${state.worldY}_${state.dropSeq++}`;
      const r = 8;

      // 살짝 퍼지게(랜덤)
      const ang = Math.random() * Math.PI * 2;
      const dist = 6 + Math.random() * 14;
      let nx = x + Math.cos(ang) * dist;
      let ny = y + Math.sin(ang) * dist;

      // 청크 경계/벽 보정
      const cl = clampToChunk(nx, ny);
      nx = cl.x;
      ny = cl.y;

      // 벽 위면 몇 번 재시도
      for (let tries = 0; tries < 10; tries++) {
        if (!circleHitsBlocked(nx, ny)) break;
        const ang2 = Math.random() * Math.PI * 2;
        const dist2 = 10 + Math.random() * 18;
        nx = clampToChunk(x + Math.cos(ang2) * dist2, y + Math.sin(ang2) * dist2).x;
        ny = clampToChunk(x + Math.cos(ang2) * dist2, y + Math.sin(ang2) * dist2).y;
      }

      state.coins.push({ id, x: nx, y: ny, r, alive: true });
    }
  }

  function maybeDropFromGoblinDeath(x, y) {
    // 10% 확률
    if (Math.random() > 0.10) return;
    const amount = 1 + Math.floor(Math.random() * 10); // 1~10개
    spawnDropCoinsAt(x, y, amount);
  }

  // =========================================
  // ✅ COMBAT (칼 휘두르기)
  // =========================================
  function triggerAttack() {
    if (!state.running) return;
    if (state.attackCdT > 0) return;

    // 공격 이펙트
    state.attackT = 0.12;
    state.attackCdT = 0.22;

    applySwordHit();
  }

  function applySwordHit() {
    if (!state.npcs || state.npcs.length === 0) return;

    // 전방 60도 = ±30도
    const halfAngle = (30 * Math.PI) / 180;
    const cosHalf = Math.cos(halfAngle);

    const fx = state.facingX;
    const fy = state.facingY;
    const fLen = Math.hypot(fx, fy);
    if (fLen < 0.0001) return;

    // 공격 사거리(체감값)
    const range = 78;

    const killedIds = new Set();

    for (const n of state.npcs) {
      const dx = n.x - state.x;
      const dy = n.y - state.y;

      const dist = Math.hypot(dx, dy);
      const reach = range + (n.r || 10);
      if (dist > reach) continue;

      const nx = dx / (dist || 1);
      const ny = dy / (dist || 1);

      const dot = fx * nx + fy * ny; // cos(theta)
      if (dot >= cosHalf) {
        // ✅ 맞으면 즉사
        killedIds.add(n.id);
        // ✅ 드랍 판정 (죽은 위치 기준)
        maybeDropFromGoblinDeath(n.x, n.y);
      }
    }

    if (killedIds.size > 0) {
      // state.npcs는 청크 캐시 배열을 그대로 바라보고 있으므로 filter로 교체해도 캐시 반영됨
      state.npcs = state.npcs.filter((n) => !killedIds.has(n.id));

      // loadChunk에서 state.npcs를 chunk.npcs로 다시 세팅하므로,
      // 현재 chunk 객체에도 동일 반영(안전하게 한번 더)
      const k = keyWorld(state.worldX, state.worldY);
      const chunk = state.worlds.get(k);
      if (chunk && chunk.npcs) {
        chunk.npcs = state.npcs;
      }
    }
  }

  // =========================================
  // NPCs (per-chunk deterministic spawn)
  // =========================================
  // NPCs (per-chunk deterministic spawn)  ✅ 거리 기반 스폰 수 증가 버전
  function buildNPCsForChunk(wx, wy, meta) {
    const isOrigin = wx === 0 && wy === 0;
    if (isOrigin) return [];

    const seed = hash32(`npcs:${wx},${wy}`);
    const rng = makeRng(seed);

    // ✅ (0,0) 마을로부터의 거리
    const dist = Math.hypot(wx, wy);

    // ✅ 거리별 스폰 수 룰 (체감용)
    const base = 2;
    const distBonus = Math.floor(dist * 0.9);
    const randBonus = Math.floor(rng() * 3);
    const count = clamp(base + distBonus + randBonus, 2, 10);

    const npcs = [];
    for (let i = 0; i < count; i++) {
      const id = `goblin_${wx}_${wy}_${i}`;

      let x = 0,
        y = 0;

      for (let tries = 0; tries < 80; tries++) {
        x = (2 + Math.floor(rng() * (state.cols - 4))) * state.tile + state.tile / 2;
        y = (2 + Math.floor(rng() * (state.rows - 4))) * state.tile + state.tile / 2;

        if (meta?.villageRect && npcInVillageInterior(x, y, 10)) continue;

        if (!npcHitsBlocked(x, y, 10)) break;
      }

      const d = randDir(rng);

      // ✅ 멀수록 조금 더 빠르게(압박감 상승)
      const speedBase = 70 + dist * 6;
      const speed = clamp(speedBase + rng() * 40, 70, 160);

      npcs.push({
        id,
        type: "goblin",
        name: "Agen",
        x,
        y,
        r: 10,
        speed,
        dirX: d.x,
        dirY: d.y,
        thinkT: 0.25 + rng() * 1.2,
      });
    }

    return npcs;
  }

  function updateNPCs(dt) {
    if (!state.npcs || state.npcs.length === 0) return;

    for (const n of state.npcs) {
      n.thinkT -= dt;

      if (n.thinkT <= 0) {
        const seed = hash32(`${n.id}:${Math.floor(performance.now() / 1000)}`);
        const rng = makeRng(seed);

        if (rng() < 0.15) {
          n.dirX = 0;
          n.dirY = 0;
        } else {
          const d = randDir(rng);
          n.dirX = d.x;
          n.dirY = d.y;
        }
        n.thinkT = 0.3 + rng() * 1.4;
      }

      const vx = n.dirX * n.speed;
      const vy = n.dirY * n.speed;

      let nx = n.x + vx * dt;
      let ny = n.y + vy * dt;

      nx = clamp(nx, n.r, state.chunkW - n.r);
      ny = clamp(ny, n.r, state.chunkH - n.r);

      // Agen 마을 내부 진입 차단
      if (npcInVillageInterior(nx, ny, n.r)) {
        if (npcInVillageInterior(n.x, n.y, n.r)) {
          const vr = state.chunkMeta?.villageRect;
          if (vr) {
            const leftPx = (vr.leftC + 1) * state.tile - (n.r + 2);
            const rightPx = (vr.rightC - 1) * state.tile + (n.r + 2);
            const topPx = (vr.topC + 1) * state.tile - (n.r + 2);
            const bottomPx = (vr.bottomC - 1) * state.tile + (n.r + 2);

            const dl = Math.abs(n.x - leftPx);
            const dr = Math.abs(n.x - rightPx);
            const dtp = Math.abs(n.y - topPx);
            const dbt = Math.abs(n.y - bottomPx);
            const m = Math.min(dl, dr, dtp, dbt);

            if (m === dl) n.x = leftPx;
            else if (m === dr) n.x = rightPx;
            else if (m === dtp) n.y = topPx;
            else n.y = bottomPx;
          }
        }

        n.dirX = -n.dirX;
        n.dirY = -n.dirY;
        n.thinkT = Math.min(n.thinkT, 0.15);
        continue;
      }

      if (npcHitsBlocked(nx, ny, n.r)) {
        const tryX = !npcHitsBlocked(nx, n.y, n.r) && !npcInVillageInterior(nx, n.y, n.r);
        const tryY = !npcHitsBlocked(n.x, ny, n.r) && !npcInVillageInterior(n.x, ny, n.r);

        if (tryX) n.x = nx;
        if (tryY) n.y = ny;

        if (!tryX && !tryY) {
          const seed = hash32(`${n.id}:bounce:${Math.floor(performance.now() / 200)}`);
          const rng = makeRng(seed);
          const d = randDir(rng);
          n.dirX = d.x;
          n.dirY = d.y;
          n.thinkT = 0.2 + rng() * 0.6;
        }
      } else {
        n.x = nx;
        n.y = ny;
      }
    }
  }

  // =========================================
  // chunks
  // =========================================
  function buildVillageChunk() {
    const blocks = new Set();
    const triggers = [];
    state.lastTriggerId = null;

    const vCols = Math.max(10, Math.floor(state.cols * 0.5));
    const vRows = Math.max(8, Math.floor(state.rows * 0.5));

    const leftC = Math.floor((state.cols - vCols) / 2);
    const rightC = leftC + vCols - 1;
    const topC = Math.floor((state.rows - vRows) / 2);
    const bottomC = topC + vRows - 1;

    const gateSpan = Math.min(3, Math.max(2, Math.floor(vCols * 0.18)));

    const midC = Math.floor((leftC + rightC) / 2);
    const northC = Math.max(leftC + 2, Math.min(rightC - gateSpan - 1, midC - Math.floor(gateSpan / 2)));
    const southC = Math.max(leftC + 2, Math.min(rightC - gateSpan - 1, midC - Math.floor(gateSpan / 2)));

    const midR = Math.floor((topC + bottomC) / 2);
    const eastR = Math.max(topC + 2, Math.min(bottomC - gateSpan - 1, midR - Math.floor(gateSpan / 2)));
    const westR = Math.max(topC + 2, Math.min(bottomC - gateSpan - 1, midR - Math.floor(gateSpan / 2)));

    // fence
    for (let c = leftC; c <= rightC; c++) {
      blocks.add(keyCR(c, topC));
      blocks.add(keyCR(c, bottomC));
    }
    for (let r = topC; r <= bottomC; r++) {
      blocks.add(keyCR(leftC, r));
      blocks.add(keyCR(rightC, r));
    }

    // holes
    for (let dc = 0; dc < gateSpan; dc++) blocks.delete(keyCR(northC + dc, topC));
    for (let dc = 0; dc < gateSpan; dc++) blocks.delete(keyCR(southC + dc, bottomC));
    for (let dr = 0; dr < gateSpan; dr++) blocks.delete(keyCR(rightC, eastR + dr));
    for (let dr = 0; dr < gateSpan; dr++) blocks.delete(keyCR(leftC, westR + dr));

    // small deco inside village
    const decoCount = Math.max(4, Math.floor(vCols * vRows * 0.03));
    const rng = makeRng(hash32("village_deco_small"));
    for (let i = 0; i < decoCount; i++) {
      const c = leftC + 2 + Math.floor(rng() * (vCols - 4));
      const r = topC + 2 + Math.floor(rng() * (vRows - 4));
      if (Math.abs(c - midC) <= 2 && Math.abs(r - midR) <= 2) continue;
      blocks.add(keyCR(c, r));
    }

    // outside-of-village deco in origin chunk
    {
      const seed = hash32(`wild_in_origin`);
      const r2 = makeRng(seed);
      const density = 0.008;
      const total = Math.floor(state.cols * state.rows * density);
      for (let i = 0; i < total; i++) {
        const c = Math.floor(r2() * state.cols);
        const r = Math.floor(r2() * state.rows);

        if (c >= leftC - 1 && c <= rightC + 1 && r >= topC - 1 && r <= bottomC + 1) continue;
        if (c <= 1 || r <= 1 || c >= state.cols - 2 || r >= state.rows - 2) continue;

        blocks.add(keyCR(c, r));
      }
    }

    // ✅ 은행 건물 (마을 내부 왼쪽 아래)
    const bankW = 4;
    const bankH = 3;
    const bankC = leftC + 2;
    const bankR = Math.max(topC + 2, bottomC - (bankH + 2));

    for (let rr = bankR; rr < bankR + bankH; rr++) {
      for (let cc = bankC; cc < bankC + bankW; cc++) {
        if (cc <= leftC || cc >= rightC || rr <= topC || rr >= bottomC) continue;
        blocks.add(keyCR(cc, rr));
      }
    }

    // 은행 문(트리거)
    {
      const doorC = bankC + 1;
      const doorR = Math.min(bottomC - 2, bankR + bankH);
      triggers.push({
        id: "bank_deposit",
        label: "BANK",
        glyph: "🏦",
        x: doorC * state.tile,
        y: doorR * state.tile,
        w: state.tile * 2,
        h: state.tile * 1.5,
        once: false,
        fired: false,
        onEnter: () => {
          const amt = state.money || 0;
          if (amt > 0) {
            emitAdenaDeposit(amt);
            state.money = 0;
            state.moneyFlashT = 0.25;
          }
        },
      });
    }

    // ✅ EXIT trigger (마을 내부 왼쪽)
    {
      const tC = leftC + 2;
      const tR = Math.min(bottomC - 3, Math.max(topC + 2, midR - 1));
      triggers.push({
        id: "village_exit_gameworld",
        label: "EXIT",
        glyph: "⎋",
        x: tC * state.tile,
        y: tR * state.tile,
        w: state.tile * 2,
        h: state.tile * 2,
        once: false,
        fired: false,
        onEnter: () => {
          exitGameWorld();
        },
      });
    }

    // AI / HISTORY triggers
    {
      const tC = Math.min(rightC - 3, Math.max(leftC + 2, Math.floor(leftC + vCols * 0.65)));
      const tR = Math.min(bottomC - 3, Math.max(topC + 2, Math.floor(topC + vRows * 0.55)));
      triggers.push({
        id: "ai_memory_garden",
        label: "AI",
        glyph: "⟡",
        x: tC * state.tile,
        y: tR * state.tile,
        w: state.tile * 2,
        h: state.tile * 2,
        once: false,
        fired: false,
        onEnter: () => {
          try {
            closeAllMenus2?.();
          } catch {}
          emitMatrixAction("ai");
          if (typeof onOpenAiPopup === "function") onOpenAiPopup();
        },
      });
    }
    {
      const tC = Math.min(rightC - 3, Math.max(leftC + 2, Math.floor(leftC + vCols * 0.65)));
      const tR = Math.min(bottomC - 3, Math.max(topC + 2, Math.floor(topC + vRows * 0.25)));
      triggers.push({
        id: "history_gate",
        label: "HISTORY",
        glyph: "H",
        x: tC * state.tile,
        y: tR * state.tile,
        w: state.tile * 2,
        h: state.tile * 2,
        once: false,
        fired: false,
        onEnter: () => {
          try {
            closeAllMenus2?.();
          } catch {}
          emitMatrixAction("history");
        },
      });
    }

    const meta = {
      villageRect: { leftC, topC, rightC, bottomC, gateSpan, northC, southC, eastR, westR },
      bankRect: { c: bankC, r: bankR, w: bankW, h: bankH },
    };

    return { blocks, triggers, meta };
  }

  function buildWildernessChunk(wx, wy) {
    const blocks = new Set();
    const triggers = [];
    state.lastTriggerId = null;

    const seed = hash32(`wild:${wx},${wy}`);
    const rng = makeRng(seed);

    const density = 0.02;
    const total = Math.floor(state.cols * state.rows * density);

    for (let i = 0; i < total; i++) {
      const c = Math.floor(rng() * state.cols);
      const r = Math.floor(rng() * state.rows);

      if (c <= 1 || r <= 1 || c >= state.cols - 2 || r >= state.rows - 2) continue;

      blocks.add(keyCR(c, r));
    }

    return { blocks, triggers, meta: null };
  }

  function getOrCreateChunk(wx, wy) {
    const k = keyWorld(wx, wy);
    const cached = state.worlds.get(k);
    if (cached) return cached;

    const base = wx === 0 && wy === 0 ? buildVillageChunk() : buildWildernessChunk(wx, wy);

    // coins/npcs는 청크 캐시에 저장되어 재방문 시 상태 유지
    const chunk = { ...base, coins: null, npcs: null };

    // coins 생성은 state.blocks/state.triggers가 그 청크로 설정되어야 해서 임시로 교체
    const prev = {
      blocks: state.blocks,
      triggers: state.triggers,
      chunkMeta: state.chunkMeta,
      worldX: state.worldX,
      worldY: state.worldY,
    };

    state.blocks = chunk.blocks;
    state.triggers = chunk.triggers;
    state.chunkMeta = chunk.meta || null;
    state.worldX = wx;
    state.worldY = wy;

    chunk.coins = buildCoinsForChunk(wx, wy, chunk.meta);
    chunk.npcs = buildNPCsForChunk(wx, wy, chunk.meta);

    // restore
    state.blocks = prev.blocks;
    state.triggers = prev.triggers;
    state.chunkMeta = prev.chunkMeta;
    state.worldX = prev.worldX;
    state.worldY = prev.worldY;

    state.worlds.set(k, chunk);
    return chunk;
  }

  function loadChunk(wx, wy) {
    state.worldX = wx;
    state.worldY = wy;

    const chunk = getOrCreateChunk(wx, wy);
    state.blocks = chunk.blocks;
    state.triggers = chunk.triggers;
    state.chunkMeta = chunk.meta || null;
    state.lastTriggerId = null;

    state.coins = chunk.coins || [];
    state.npcs = chunk.npcs || [];
  }

  // =========================================
  // world change
  // =========================================
  function changeWorld(dx, dy, opts = {}) {
    const nextX = state.worldX + dx;
    const nextY = state.worldY + dy;

    loadChunk(nextX, nextY);

    const entry = opts.entry || null;
    const margin = state.r + 2;

    if (entry === "north") state.y = margin;
    else if (entry === "south") state.y = state.chunkH - margin;
    else if (entry === "west") state.x = margin;
    else if (entry === "east") state.x = state.chunkW - margin;
    else {
      state.x = state.chunkW * 0.5;
      state.y = state.chunkH * 0.5;
    }

    state.clickMove = null;

    const cl = clampToChunk(state.x, state.y);
    state.x = cl.x;
    state.y = cl.y;
  }

  // =========================================
  // ✅ 화면 끝 닿으면 다음 청크로 이동
  // =========================================
  function autoTransitionIfOutside() {
    if (isInVillageInterior()) return;

    const edge = state.r + 1;

    if (state.x <= edge) {
      changeWorld(-1, 0, { entry: "east" });
      state.x = state.chunkW - (state.r + 2);
      return;
    }
    if (state.x >= state.chunkW - edge) {
      changeWorld(+1, 0, { entry: "west" });
      state.x = state.r + 2;
      return;
    }

    if (state.y <= edge) {
      changeWorld(0, -1, { entry: "south" });
      state.y = state.chunkH - (state.r + 2);
      return;
    }
    if (state.y >= state.chunkH - edge) {
      changeWorld(0, +1, { entry: "north" });
      state.y = state.r + 2;
      return;
    }
  }

  // =========================================
  // canvas
  // =========================================
  function ensureCanvas() {
    if (state.canvas) return;

    const canvas = document.createElement("canvas");
    canvas.id = "matrixGameCanvas";
    canvas.style.position = "fixed";
    canvas.style.inset = "0";
    canvas.style.width = "100vw";
    canvas.style.height = "100vh";
    canvas.style.display = "block";
    canvas.style.zIndex = "1";
    canvas.style.background = "transparent";
    canvas.style.pointerEvents = "auto";

    document.body.appendChild(canvas);
    state.canvas = canvas;
    state.ctx = canvas.getContext("2d", { alpha: true });

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      syncWorldSizeFromCanvas();
    };

    if (!state._resizeBound) {
      state._resizeBound = true;
      window.addEventListener("resize", resize, { passive: true });
    }
    resize();

    canvas.addEventListener("pointerdown", (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      state.clickMove = { tx: mx, ty: my };

      // ✅ 클릭 이동 방향도 전방으로 설정
      setFacingFromVector(mx - state.x, my - state.y);
    });
  }

  // =========================================
  // input
  // =========================================
  function bindKeys() {
    if (state._keysBound) return;
    state._keysBound = true;

    function onDown(e) {
      if (!state.running) return;

      const a = document.activeElement;
      const tag = (a?.tagName || "").toUpperCase();
      if (tag === "TEXTAREA" || tag === "INPUT" || a?.isContentEditable) return;

      const k = e.key;

      if (k === "w" || k === "W" || k === "ArrowUp") state.keys.up = true;
      if (k === "s" || k === "S" || k === "ArrowDown") state.keys.down = true;
      if (k === "a" || k === "A" || k === "ArrowLeft") state.keys.left = true;
      if (k === "d" || k === "D" || k === "ArrowRight") state.keys.right = true;

      // ✅ 공격 (Space)
      if (k === " " || e.code === "Space") {
        e.preventDefault?.();
        triggerAttack();
      }

      if (state.keys.up || state.keys.down || state.keys.left || state.keys.right) {
        state.clickMove = null;
      }
    }

    function onUp(e) {
      const k = e.key;
      if (k === "w" || k === "W" || k === "ArrowUp") state.keys.up = false;
      if (k === "s" || k === "S" || k === "ArrowDown") state.keys.down = false;
      if (k === "a" || k === "A" || k === "ArrowLeft") state.keys.left = false;
      if (k === "d" || k === "D" || k === "ArrowRight") state.keys.right = false;
    }

    window.addEventListener("keydown", onDown, true);
    window.addEventListener("keyup", onUp, true);
  }

  // =========================================
  // triggers
  // =========================================
  function checkTriggers() {
    for (const t of state.triggers) {
      if (t.once && t.fired) continue;

      const inside = state.x >= t.x && state.x <= t.x + t.w && state.y >= t.y && state.y <= t.y + t.h;

      if (inside) {
        if (state.lastTriggerId !== t.id) {
          state.lastTriggerId = t.id;
          try {
            t.onEnter?.();
          } catch {}
          t.fired = true;
        }
      } else {
        if (state.lastTriggerId === t.id) state.lastTriggerId = null;
      }
    }
  }

  // =========================================
  // movement
  // =========================================
  function step(dt) {
    // timers
    if (state.deadFlashT > 0) state.deadFlashT = Math.max(0, state.deadFlashT - dt);
    if (state.moneyFlashT > 0) state.moneyFlashT = Math.max(0, state.moneyFlashT - dt);
    if (state.attackT > 0) state.attackT = Math.max(0, state.attackT - dt);
    if (state.attackCdT > 0) state.attackCdT = Math.max(0, state.attackCdT - dt);

    let vx = 0;
    let vy = 0;

    if (state.keys.left) vx -= 1;
    if (state.keys.right) vx += 1;
    if (state.keys.up) vy -= 1;
    if (state.keys.down) vy += 1;

    if (vx !== 0 || vy !== 0) {
      const len = Math.hypot(vx, vy) || 1;
      const ux = vx / len;
      const uy = vy / len;

      // ✅ 이동 방향을 전방으로 저장
      state.facingX = ux;
      state.facingY = uy;

      vx = ux * state.speed;
      vy = uy * state.speed;

      moveWithCollision(vx * dt, vy * dt);
      state.clickMove = null;
    } else if (state.clickMove) {
      const dx = state.clickMove.tx - state.x;
      const dy = state.clickMove.ty - state.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 4) {
        state.clickMove = null;
      } else {
        const ux = dx / dist;
        const uy = dy / dist;

        // ✅ 클릭 이동도 전방으로 저장
        state.facingX = ux;
        state.facingY = uy;

        const stepX = ux * state.speed * dt;
        const stepY = uy * state.speed * dt;

        const beforeX = state.x;
        const beforeY = state.y;

        moveWithCollision(stepX, stepY);

        const m = Math.hypot(state.x - beforeX, state.y - beforeY);
        if (m < 0.5) state.clickMove = null;
      }
    }

    // NPC update
    updateNPCs(dt);

    // ✅ 먼저 아데나 픽업(죽지 않음)
    checkCoinPickup();

    // ✅ Agen 충돌은 "죽음/리젠" (+ 아데나 0 초기화는 respawn에서)
    if (checkGoblinCollision()) return;

    // 청크 이동
    autoTransitionIfOutside();

    // 트리거
    checkTriggers();
  }

  function moveWithCollision(dx, dy) {
    let nx = state.x + dx;
    let ny = state.y;

    nx = clampToChunk(nx, ny).x;
    if (!circleHitsBlocked(nx, ny)) state.x = nx;

    nx = state.x;
    ny = state.y + dy;

    ny = clampToChunk(nx, ny).y;
    if (!circleHitsBlocked(nx, ny)) state.y = ny;
  }

  // =========================================
  // draw
  // =========================================
  function drawMiniMap(ctx, w, h) {
    const mapW = 140;
    const mapH = 100;
    const pad = 14;
    const x0 = w - mapW - pad;
    const y0 = pad;

    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(x0, y0, mapW, mapH);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.strokeRect(x0, y0, mapW, mapH);

    const cx = x0 + mapW / 2;
    const cy = y0 + mapH / 2;

    const { ox, oy } = getOriginGlobal();
    const { gx, gy } = getPlayerGlobal();
    const dx = ox - gx;
    const dy = oy - gy;
    const dist = Math.hypot(dx, dy);

    const ux = dist > 0.0001 ? dx / dist : 0;
    const uy = dist > 0.0001 ? dy / dist : 0;

    const arrowLen = 26;
    const ax = cx + ux * arrowLen;
    const ay = cy + uy * arrowLen;

    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ax, ay);
    ctx.stroke();

    const head = 8;
    const ang = Math.atan2(uy, ux);
    const a1 = ang + Math.PI * 0.85;
    const a2 = ang - Math.PI * 0.85;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + Math.cos(a1) * head, ay + Math.sin(a1) * head);
    ctx.lineTo(ax + Math.cos(a2) * head, ay + Math.sin(a2) * head);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
    ctx.fill();

    const rel = getPlayerRelativeToOrigin();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "11px sans-serif";
    ctx.fillText(`chunk (${state.worldX}, ${state.worldY})`, x0 + 8, y0 + 16);

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "10px sans-serif";
    ctx.fillText(`pos (${Math.round(rel.rx)}, ${Math.round(rel.ry)})`, x0 + 8, y0 + 32);
    ctx.fillText(`to (0,0): ${Math.round(dist)}`, x0 + 8, y0 + 48);

    if (state.worldX === 0 && state.worldY === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText(isInVillageInterior() ? `Village (inside)` : `Village (outside)`, x0 + 8, y0 + 64);
      ctx.fillText(`Move chunks at screen edge`, x0 + 8, y0 + 78);
    }
  }

  function drawNPCs(ctx) {
    for (const n of state.npcs) {
      ctx.save();
      ctx.translate(n.x, n.y);

      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 2;

      const r = 14;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r, r);
      ctx.lineTo(-r, r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";

      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(-28, -r - 22, 56, 16);

      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fillText(n.name || "NPC", 0, -r - 8);

      ctx.restore();
    }
  }

  function drawCoins(ctx) {
    for (const c of state.coins) {
      if (!c.alive) continue;

      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.fillStyle = "rgba(255,255,255,0.20)";
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = "18px sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fillText("💰", 0, 0);
      ctx.restore();
    }
  }

  function drawBank(ctx) {
    if (!(state.worldX === 0 && state.worldY === 0)) return;
    const br = state.chunkMeta?.bankRect;
    if (!br) return;

    const x = br.c * state.tile;
    const y = br.r * state.tile;
    const w = br.w * state.tile;
    const h = br.h * state.tile;

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.strokeRect(x, y, w, h);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillText("🏦 BANK", x + w / 2, y + h / 2);
    ctx.restore();
  }

  // ✅ 공격 이펙트 (전방 60도 부채꼴)
  function drawAttackCone(ctx) {
    if (state.attackT <= 0) return;

    const range = 78;
    const halfAngle = (30 * Math.PI) / 180;

    const fx = state.facingX;
    const fy = state.facingY;
    const baseAng = Math.atan2(fy, fx);

    const a = Math.min(0.35, state.attackT * 3.2);

    ctx.save();
    ctx.translate(state.x, state.y);

    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, range, baseAng - halfAngle, baseAng + halfAngle);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawHud(ctx) {
    const x = 12;
    const y = 44;

    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(x - 8, y - 20, 160, 28);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.strokeRect(x - 8, y - 20, 160, 28);

    const a = state.moneyFlashT > 0 ? 0.95 : 0.85;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.font = state.moneyFlashT > 0 ? "16px sans-serif" : "14px sans-serif";
    ctx.fillText(`💰 ${state.money}`, x, y - 2);
  }

  function draw() {
    const ctx = state.ctx;
    const canvas = state.canvas;
    if (!ctx || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    const isOrigin = state.worldX === 0 && state.worldY === 0;
    const gridA = isOrigin ? 0.03 : 0.025;
    const blockA = isOrigin ? 0.14 : 0.10;

    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        const x = c * state.tile;
        const y = r * state.tile;

        ctx.fillStyle = `rgba(255,255,255,${gridA})`;
        ctx.fillRect(x, y, state.tile - 1, state.tile - 1);

        if (state.blocks.has(keyCR(c, r))) {
          ctx.fillStyle = `rgba(255,255,255,${blockA})`;
          ctx.fillRect(x, y, state.tile - 1, state.tile - 1);
        }
      }
    }

    // ✅ 은행 시각화
    drawBank(ctx);

    drawCoins(ctx);
    drawNPCs(ctx);

    // ✅ 공격 이펙트
    drawAttackCone(ctx);

    for (const t of state.triggers) {
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.strokeRect(t.x, t.y, t.w, t.h);
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(t.x, t.y, t.w, t.h);

      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "12px sans-serif";
      ctx.fillText(t.glyph || "⟡", t.x + 6, t.y + 14);

      if (t.label) {
        ctx.fillStyle = "rgba(255,255,255,0.65)";
        ctx.font = "10px sans-serif";
        ctx.fillText(String(t.label), t.x + 18, t.y + 14);
      }
    }

    if (state.clickMove) {
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.beginPath();
      ctx.arc(state.clickMove.tx, state.clickMove.ty, 10, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(state.x, state.y + 10, state.r + 6, state.r, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.arc(state.x, state.y, state.r, 0, Math.PI * 2);
    ctx.fill();

    drawMiniMap(ctx, w, h);
    drawHud(ctx);

    if (state.deadFlashT > 0) {
      const a = Math.min(0.7, state.deadFlashT * 2.8);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "12px sans-serif";
    ctx.fillText(
      `WASD/Arrow 이동 | 클릭 이동 | Space=칼 공격(전방 60° 즉사) | 💰 획득=+1 | 🏦 BANK=입금(💰→DB) | Agen 충돌=죽음(💰 0 리셋) | 화면 끝=다음 청크`,
      12,
      18
    );
  }

  // =========================================
  // loop
  // =========================================
  function loop(t) {
    if (!state.running) return;
    const now = t || 0;
    const dt = state.lastT ? Math.min(0.033, (now - state.lastT) / 1000) : 0;
    state.lastT = now;

    step(dt);
    draw();

    state.raf = requestAnimationFrame(loop);
  }

  function start() {
    if (state.running) return;
    if (!state.canvas) ensureCanvas();

    state.running = true;
    state.enabled = true;
    state.lastT = 0;
    state.raf = requestAnimationFrame(loop);
  }

  function stop() {
    state.running = false;
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = null;
  }

  function init() {
    ensureCanvas();
    bindKeys();

    syncWorldSizeFromCanvas();

    loadChunk(0, 0);

    const p = findSafeVillageSpawn();
    state.x = p.x;
    state.y = p.y;

    start();
  }

  return { init, start, stop };
}