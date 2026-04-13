import { initNavigation } from './navigation.js';
import { initAnimations } from './animations.js';
import { initUI } from './ui.js';

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

function init() {
    initNavigation();
    initAnimations();
    initUI();
    lucide.createIcons();
}
