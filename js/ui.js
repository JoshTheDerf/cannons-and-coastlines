export function initUI() {
    const yearEl = document.querySelector('.current-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    console.log('%c⚓ Cannons & Coastlines ⚓', 'font-size: 24px; color: #c9a227; font-weight: bold;');
    console.log('%cJoin the fleet: https://discord.gg/DMuFEWJtZq', 'font-size: 14px; color: #1a3a52;');

    initEasterEgg();
    initDownloadModal();
    initLightbox();
}

function initLightbox() {
    const lightbox = document.getElementById('lightbox');
    if (!lightbox) return;

    const img = lightbox.querySelector('.lightbox-img');
    const closeBtn = lightbox.querySelector('.lightbox-close');

    function open(src, alt) {
        img.src = src;
        img.alt = alt || '';
        lightbox.classList.add('active');
        lightbox.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }

    function close() {
        lightbox.classList.remove('active');
        lightbox.setAttribute('aria-hidden', 'true');
        img.src = '';
        document.body.style.overflow = '';
    }

    document.querySelectorAll('[data-lightbox]').forEach(btn => {
        btn.addEventListener('click', () => {
            const src = btn.dataset.lightbox;
            const innerImg = btn.querySelector('img');
            open(src, innerImg ? innerImg.alt : '');
        });
    });

    closeBtn.addEventListener('click', close);
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) close();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && lightbox.classList.contains('active')) close();
    });
}

function initDownloadModal() {
    const modal = document.getElementById('download-modal');
    if (!modal) return;

    const modalFileName = document.getElementById('modal-file-name');
    const modalConfirm = document.getElementById('modal-confirm');
    const modalCancel = document.getElementById('modal-cancel');

    function openModal(name, href) {
        modalFileName.textContent = name || 'this file';
        modalConfirm.href = href;
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        lucide.createIcons({ nodes: [modal] });
    }

    function closeModal() {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
    }

    document.querySelectorAll('.dev-download').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            openModal(link.dataset.downloadName, link.href);
        });
    });

    modalCancel.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) closeModal();
    });
}

function initEasterEgg() {
    // Secret 1: Type "fire" anywhere on the page
    let buffer = '';
    document.addEventListener('keydown', (e) => {
        buffer += e.key.toLowerCase();
        if (buffer.length > 10) buffer = buffer.slice(-10);
        if (buffer.endsWith('fire')) {
            launchEasterEgg();
        }
    });

    // Secret 2: Click any cannon fire element in the hero SVG 3 times
    let cannonClicks = 0;
    let cannonTimer = null;
    document.querySelectorAll('.hero-cannon-fire').forEach(el => {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => {
            cannonClicks++;
            clearTimeout(cannonTimer);
            cannonTimer = setTimeout(() => { cannonClicks = 0; }, 2000);
            if (cannonClicks >= 3) {
                launchEasterEgg();
            }
        });
    });
}

function launchEasterEgg() {
    window.location.href = 'game/index.html';
}
