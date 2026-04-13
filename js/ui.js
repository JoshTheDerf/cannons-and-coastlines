export function initUI() {
    const yearEl = document.querySelector('.current-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    console.log('%c⚓ Cannons & Coastlines ⚓', 'font-size: 24px; color: #c9a227; font-weight: bold;');
    console.log('%cJoin the fleet: https://discord.gg/DMuFEWJtZq', 'font-size: 14px; color: #1a3a52;');
}
