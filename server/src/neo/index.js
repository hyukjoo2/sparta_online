// server/src/neo/index.js
import { createNeoEngine } from "./neoEngine.js";
import { createNeoRouter } from "./neoRouter.js";

export function createNeoModule() {
  const engine = createNeoEngine({
    tickMs: 1000,
    checkpointEveryMin: 1, // 1분마다 스냅샷 저장 (원하면 5로)
  });

  const router = createNeoRouter({ engine });
  return { engine, router };
}