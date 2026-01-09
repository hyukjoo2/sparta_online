// /src/ui/menu.js
export function createMenuUI({ root = document } = {}) {
  let bound = false;

  function closeAllMenus() {
    root.querySelectorAll(".menu-panel.show").forEach((p) => p.classList.remove("show"));
  }

  function toggleMenu(panel) {
    const isOpen = panel.classList.contains("show");
    closeAllMenus();
    if (!isOpen) panel.classList.add("show");
  }

  function bindOnce() {
    if (bound) return;
    bound = true;

    root.querySelectorAll(".menu").forEach((menu) => {
      const btn = menu.querySelector(".menu-btn");
      const panel = menu.querySelector(".menu-panel");
      if (!btn || !panel) return;

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleMenu(panel);
      });

      panel.addEventListener("click", (e) => e.stopPropagation());
    });

    root.addEventListener("click", () => closeAllMenus());
  }

  // main.js에서 기존에 쓰던 closeAllMenus2() 호환용 alias
  function closeAllMenus2() {
    closeAllMenus();
  }

  return { closeAllMenus, closeAllMenus2, toggleMenu, bindOnce };
}