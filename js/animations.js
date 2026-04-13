export function initAnimations() {
    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                obs.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.feature, .faction-card, .download-card, .product-card, .step, .playtesting-media').forEach(el => {
        el.classList.add('fade-in');
        observer.observe(el);
    });
}
