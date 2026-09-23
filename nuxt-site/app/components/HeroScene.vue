<template>
  <svg class="hero-scene" viewBox="0 0 1440 600" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <linearGradient id="ocean" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#5a8a9a" />
        <stop offset="40%" stop-color="#4a7a8a" />
        <stop offset="100%" stop-color="#3a6575" />
      </linearGradient>
      <linearGradient id="islandFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#5a7a5a" />
        <stop offset="100%" stop-color="#4a6a4a" />
      </linearGradient>
      <linearGradient id="fog" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#7a9c9a" stop-opacity="0.5" />
        <stop offset="100%" stop-color="#7a9c9a" stop-opacity="0" />
      </linearGradient>
      <filter id="hero-smoke-blur" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3" />
      </filter>
    </defs>

    <rect width="1440" height="600" fill="url(#ocean)" />

    <g class="hero-clouds" opacity="0.15">
      <ellipse cx="200" cy="180" rx="120" ry="25" fill="#c8d8d8" />
      <ellipse cx="250" cy="175" rx="80" ry="20" fill="#d0e0e0" />
      <ellipse cx="900" cy="150" rx="140" ry="22" fill="#c8d8d8" />
      <ellipse cx="960" cy="145" rx="90" ry="18" fill="#d0e0e0" />
      <ellipse cx="1300" cy="190" rx="100" ry="20" fill="#c8d8d8" />
    </g>

    <g class="hero-island hero-island--far" opacity="0.45">
      <path d="M60 440 Q100 380 160 400 Q200 370 250 395 Q280 365 320 390 Q350 410 360 440 Z" fill="#4a6a5a" />
      <line x1="155" y1="398" x2="155" y2="375" stroke="#3a5a3a" stroke-width="3" />
      <ellipse cx="155" cy="370" rx="12" ry="18" fill="#3a5a3a" />
      <line x1="260" y1="392" x2="260" y2="372" stroke="#3a5a3a" stroke-width="2.5" />
      <ellipse cx="260" cy="368" rx="10" ry="15" fill="#3a5a3a" />
    </g>

    <g class="hero-island hero-island--far" opacity="0.4">
      <path d="M1080 430 Q1120 385 1170 405 Q1210 375 1260 400 Q1300 390 1340 420 Q1360 435 1370 445 Z" fill="#4a6a5a" />
      <line x1="1175" y1="402" x2="1175" y2="378" stroke="#3a5a3a" stroke-width="3" />
      <ellipse cx="1175" cy="373" rx="13" ry="18" fill="#3a5a3a" />
      <line x1="1270" y1="398" x2="1270" y2="380" stroke="#3a5a3a" stroke-width="2" />
      <ellipse cx="1270" cy="376" rx="9" ry="13" fill="#3a5a3a" />
    </g>

    <g class="hero-island hero-island--mid" opacity="0.55">
      <path d="M750 460 Q800 410 860 430 Q910 395 970 420 Q1010 405 1040 435 Q1060 450 1065 465 Z" fill="url(#islandFill)" />
      <path d="M810 445 Q830 425 870 435" stroke="#3a5a3a" stroke-width="1.5" fill="none" opacity="0.5" />
      <line x1="870" y1="428" x2="870" y2="395" stroke="#4a5a4a" stroke-width="4" />
      <ellipse cx="870" cy="388" rx="16" ry="22" fill="#3a5a3a" />
      <ellipse cx="870" cy="393" rx="14" ry="18" fill="#4a6a4a" />
      <line x1="970" y1="418" x2="970" y2="392" stroke="#4a5a4a" stroke-width="3" />
      <ellipse cx="970" cy="387" rx="12" ry="16" fill="#3a5a3a" />
      <line x1="920" y1="430" x2="920" y2="385" stroke="#5c4033" stroke-width="2.5" />
      <path d="M920 385 L945 392 L920 400 Z" fill="#c44" opacity="0.8" />
    </g>

    <g class="hero-island hero-island--near" opacity="0.6" transform="translate(330 0)">
<path d="M280 490 Q330 440 390 460 Q430 425 490 450 Q530 435 570 460 Q590 475 600 495 Z" fill="url(#islandFill)" />
      <path d="M340 478 Q370 455 420 465" stroke="#3a5a3a" stroke-width="1.5" fill="none" opacity="0.5" />
      <line x1="400" y1="458" x2="395" y2="418" stroke="#5a4a3a" stroke-width="3.5" />
      <path d="M395 418 Q375 410 365 420" stroke="#3a6a3a" stroke-width="3" fill="none" />
      <path d="M395 418 Q410 405 425 412" stroke="#3a6a3a" stroke-width="3" fill="none" />
      <path d="M395 418 Q385 400 378 408" stroke="#4a7a4a" stroke-width="2.5" fill="none" />
      <path d="M395 418 Q405 402 415 407" stroke="#4a7a4a" stroke-width="2.5" fill="none" />
      <line x1="500" y1="448" x2="497" y2="415" stroke="#5a4a3a" stroke-width="3" />
      <path d="M497 415 Q480 408 472 418" stroke="#3a6a3a" stroke-width="2.5" fill="none" />
      <path d="M497 415 Q510 405 520 412" stroke="#3a6a3a" stroke-width="2.5" fill="none" />
      <path d="M497 415 Q488 400 482 408" stroke="#4a7a4a" stroke-width="2" fill="none" />
    </g>

    <!-- A brig in the distance -->
    <g class="hero-drift hero-drift--brig" opacity="0.5">
      <g transform="translate(600 486) scale(0.26)">
        <g class="hero-rock hero-rock--slow"><HeroShip id="brig" :masts="2" hull="#5c4033" flag="#3f6b3f" /></g>
      </g>
    </g>

    <!-- Queen's Fleet ship, further off, trading broadsides with the near ship -->
    <g class="hero-drift hero-drift--far" style="--fire-delay: 6s">
      <g transform="translate(1010 508) scale(0.5)">
        <g class="hero-rock hero-rock--b"><HeroShip id="queen" hull="#56606e" flag="#1f3a5f" fire /></g>
      </g>
    </g>
    <g class="hero-splashes" style="--splash-delay: 2.3s" transform="translate(1000 512)">
      <g v-for="(x, i) in [10, 62, 118, 150, 196]" :key="x" class="splash" :style="{ '--i': i }" :transform="`translate(${x} ${i % 2 ? 4 : -2})`">
        <path d="M0 0 Q-3 -12 -1 -20 M0 0 Q2 -14 5 -17 M0 0 Q-5 -8 -7 -12" stroke="#e4f1f4" stroke-width="1.6" fill="none" />
        <ellipse cy="2" rx="9" ry="2.5" fill="#cfe6ec" opacity="0.5" />
      </g>
    </g>

    <!-- Corsair ship in the foreground -->
    <g class="hero-drift hero-drift--near" style="--fire-delay: 1.5s">
      <g transform="translate(190 540) scale(0.72)">
        <g class="hero-rock hero-rock--a"><HeroShip id="corsair" hull="#2e2925" flag="#8b1a1a" fire /></g>
      </g>
    </g>
    <g class="hero-splashes" style="--splash-delay: 6.8s" transform="translate(200 546)">
      <g v-for="(x, i) in [-10, 70, 150, 250, 300]" :key="x" class="splash" :style="{ '--i': i }" :transform="`translate(${x} ${i % 2 ? 6 : 0}) scale(1.5)`">
        <path d="M0 0 Q-3 -12 -1 -20 M0 0 Q2 -14 5 -17 M0 0 Q-5 -8 -7 -12" stroke="#e4f1f4" stroke-width="1.6" fill="none" />
        <ellipse cy="2" rx="9" ry="2.5" fill="#cfe6ec" opacity="0.5" />
      </g>
    </g>

    <g class="hero-waves">
      <path class="hero-wave hero-wave--4" d="M-200 520 Q-100 505 0 515 Q100 525 200 512 Q300 500 400 514 Q500 528 600 515 Q700 502 800 516 Q900 530 1000 516 Q1100 502 1200 518 Q1300 530 1440 515 Q1540 502 1640 518 L1640 600 L-200 600 Z" fill="#4a7a6a" opacity="0.25" />
      <path class="hero-wave hero-wave--3" d="M-200 535 Q-100 522 0 532 Q100 542 200 528 Q300 515 400 530 Q500 544 600 530 Q700 516 800 532 Q900 546 1000 530 Q1100 516 1200 533 Q1300 546 1440 530 Q1540 516 1640 533 L1640 600 L-200 600 Z" fill="#5a8a7a" opacity="0.3" />
      <path class="hero-wave hero-wave--2" d="M-200 550 Q-100 540 0 548 Q100 556 200 545 Q300 534 400 548 Q500 560 600 547 Q700 534 800 549 Q900 562 1000 548 Q1100 534 1200 550 Q1300 563 1440 548 Q1540 534 1640 550 L1640 600 L-200 600 Z" fill="#6a9a8a" opacity="0.35" />
      <path class="hero-wave hero-wave--1" d="M-200 565 Q-100 555 0 563 Q100 571 200 560 Q300 550 400 563 Q500 576 600 562 Q700 550 800 564 Q900 578 1000 562 Q1100 550 1200 565 Q1300 578 1440 563 Q1540 550 1640 565 L1640 600 L-200 600 Z" fill="#1a2a30" opacity="0.5" />
    </g>

    <rect y="560" width="1440" height="40" fill="url(#fog)" opacity="0.3" />
  </svg>
</template>

<style scoped>
.hero-scene {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.hero-clouds { animation: cloud-drift 80s linear infinite alternate; }
@keyframes cloud-drift { 0% { transform: translateX(0); } 100% { transform: translateX(60px); } }

.hero-island--far  { animation: island-sway 20s ease-in-out infinite; }
.hero-island--mid  { animation: island-sway 16s ease-in-out infinite; }
@keyframes island-sway { 0%,100% { transform: translateY(0); } 50% { transform: translateY(2px); } }

.hero-wave--1 { animation: wave-shift-1 7s ease-in-out infinite; }
.hero-wave--2 { animation: wave-shift-2 9s ease-in-out infinite; }
.hero-wave--3 { animation: wave-shift-1 11s ease-in-out infinite; }
.hero-wave--4 { animation: wave-shift-2 13s ease-in-out infinite; }
@keyframes wave-shift-1 { 0%,100% { transform: translateX(0); } 50% { transform: translateX(28px); } }
@keyframes wave-shift-2 { 0%,100% { transform: translateX(0); } 50% { transform: translateX(-22px); } }
</style>

<!-- Ship motion lives in an unscoped block because it styles HeroShip's
     insides. Everything is prefixed with .hero-scene. -->
<style>
/* Ships creep forward and back, and pitch/heave about the waterline. */
.hero-scene .hero-drift--near { animation: hero-drift 34s ease-in-out infinite alternate; }
.hero-scene .hero-drift--far  { animation: hero-drift 40s ease-in-out infinite alternate-reverse; }
.hero-scene .hero-drift--brig { animation: hero-drift 60s ease-in-out infinite alternate; }
@keyframes hero-drift { from { transform: translateX(-12px); } to { transform: translateX(36px); } }

.hero-scene .hero-rock { transform-box: fill-box; transform-origin: 55% 96%; }
.hero-scene .hero-rock--a { animation: hero-rock 6.5s ease-in-out infinite; }
.hero-scene .hero-rock--b { animation: hero-rock 7.5s ease-in-out infinite -2s; }
.hero-scene .hero-rock--slow { animation: hero-rock 9s ease-in-out infinite -4s; }
@keyframes hero-rock {
  0%, 100% { transform: translateY(0) rotate(-0.9deg); }
  50%      { transform: translateY(3px) rotate(1.1deg); }
}

/* Sails fill a little with each gust. */
.hero-scene .sail { transform-box: fill-box; transform-origin: 50% 0%; animation: hero-sail 5s ease-in-out infinite; }
@keyframes hero-sail { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.015, 1.03); } }
.hero-scene .ship-bow-wave { animation: hero-foam 3s ease-in-out infinite; }
@keyframes hero-foam { 0%, 100% { opacity: 0.45; } 50% { opacity: 0.85; } }

/* Broadside: a 10s cycle. Each gun goes off 0.12s after the one ahead of it. */
.hero-scene .gun-flash,
.hero-scene .gun-smoke { opacity: 0; transform-box: fill-box; transform-origin: center; }
.hero-scene .gun-flash { animation: hero-flash 10s linear infinite; animation-delay: calc(var(--fire-delay) + var(--i) * 0.12s); }
.hero-scene .gun-smoke--a { animation: hero-smoke 10s ease-out infinite; animation-delay: calc(var(--fire-delay) + var(--i) * 0.12s); }
.hero-scene .gun-smoke--b { animation: hero-smoke 10s ease-out infinite; animation-delay: calc(var(--fire-delay) + var(--i) * 0.12s + 0.15s); }
@keyframes hero-flash {
  0%   { opacity: 0; transform: scale(0.4); }
  0.8% { opacity: 1; transform: scale(1.3); }
  3%   { opacity: 0; transform: scale(0.8); }
  100% { opacity: 0; }
}
@keyframes hero-smoke {
  0%   { opacity: 0; transform: translate(0, 0) scale(0.3); }
  1.5% { opacity: 0.9; transform: translate(2px, 0) scale(1); }
  22%  { opacity: 0.55; transform: translate(26px, -12px) scale(2.3); }
  48%  { opacity: 0; transform: translate(60px, -28px) scale(3.4); }
  100% { opacity: 0; }
}

/* Shot landing around the other ship. */
.hero-scene .splash { opacity: 0; }
.hero-scene .splash > * { transform-box: fill-box; transform-origin: 50% 100%; }
.hero-scene .splash { animation: hero-splash 10s ease-out infinite; animation-delay: calc(var(--splash-delay) + var(--i) * 0.14s); }
@keyframes hero-splash {
  0%   { opacity: 0; }
  1%   { opacity: 0.95; }
  7%   { opacity: 0.5; }
  14%  { opacity: 0; }
  100% { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .hero-scene *, .hero-scene { animation: none !important; }
  .hero-scene animate { display: none; }
}
</style>
