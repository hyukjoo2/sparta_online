// /src/app/historyTool.js
export function createHistoryTool({ closeAllMenus2, openHistory }) {
  function ensureHistoryToolInserted() {
    const toolsMenu = document.querySelector('[data-menu="tools"]');
    if (!toolsMenu) return;

    const panel = toolsMenu.querySelector(".menu-panel");
    if (!panel) return;

    if (panel.querySelector("#historyBtn2")) return;

    const btn = document.createElement("button");
    btn.className = "menu-item";
    btn.type = "button";
    btn.id = "historyBtn2";
    btn.textContent = "History";
    panel.appendChild(btn);
  }

  function bindHistoryToolAction() {
    ensureHistoryToolInserted();

    const btn = document.getElementById("historyBtn2");
    if (!btn) return;
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";

    btn.addEventListener("click", () => {
      closeAllMenus2();
      openHistory();
    });
  }

  return { bindHistoryToolAction };
}