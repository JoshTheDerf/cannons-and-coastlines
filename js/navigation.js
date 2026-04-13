export function initNavigation() {
    initMobileToggle();
    initSmoothScroll();
    initScrollEffects();
}

function initMobileToggle() {
    const navToggle = document.querySelector('.nav-toggle');
    const navLinks = document.querySelector('.nav-links');
    const navOverlay = document.querySelector('.nav-overlay');

    if (!navToggle) return;

    navToggle.addEventListener('click', () => {
        const isOpen = navLinks?.classList.toggle('active');
        navToggle.classList.toggle('active', isOpen);
        navOverlay?.classList.toggle('active', isOpen);
        document.body.classList.toggle('nav-open', isOpen);
        navToggle.setAttribute('aria-expanded', String(isOpen));
    });

    navOverlay?.addEventListener('click', closeMenu);

    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', closeMenu);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && navLinks?.classList.contains('active')) {
            closeMenu();
        }
    });

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (window.innerWidth > 768 && navLinks?.classList.contains('active')) {
                closeMenu();
            }
        }, 150);
    });

    function closeMenu() {
        navLinks?.classList.remove('active');
        navToggle.classList.remove('active');
        navOverlay?.classList.remove('active');
        document.body.classList.remove('nav-open');
        navToggle.setAttribute('aria-expanded', 'false');
    }
}

function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href === '#' || href === '#!') return;
            const target = document.querySelector(href);
            if (!target) return;
            e.preventDefault();
            const top = target.getBoundingClientRect().top + window.pageYOffset - 70;
            window.scrollTo({ top, behavior: 'smooth' });
        });
    });
}

/**
 * Single scroll handler for both nav background and active link tracking.
 * Uses one RAF guard instead of two separate scroll listeners.
 */
function initScrollEffects() {
    const nav = document.querySelector('.nav');
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-links a[href^="#"]');

    if (!nav && sections.length === 0) return;

    let ticking = false;
    let lastActive = null;

    function update() {
        const scrollY = window.scrollY;

        // Nav background
        if (nav) {
            nav.classList.toggle('scrolled', scrollY > 50);
        }

        // Active section tracking
        if (sections.length > 0 && navLinks.length > 0) {
            let current = '';
            sections.forEach(section => {
                if (scrollY >= section.offsetTop - 150) {
                    current = section.getAttribute('id');
                }
            });

            if (current !== lastActive) {
                lastActive = current;
                navLinks.forEach(link => {
                    link.classList.toggle('active', link.getAttribute('href') === `#${current}`);
                });
            }
        }

        ticking = false;
    }

    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(update);
            ticking = true;
        }
    }, { passive: true });
}
