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

    <g class="hero-island hero-island--near" opacity="0.6">
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

    <g class="hero-ship hero-ship--1">
      <g transform="translate(250, 470)">
        <ellipse cx="50" cy="24" rx="42" ry="4" fill="#3a5a5a" opacity="0.15" />
        <path d="M-4 -5 L8 -5 L15 -2 L85 -2 Q100 0 105 6 L100 16 L88 22 L8 22 L-2 18 L-4 14 Z" fill="#5c4033" />
        <path d="M15 -2 L15 2" stroke="#4a3425" stroke-width="1" opacity="0.5" fill="none" />
        <path d="M8 10 L92 8" stroke="#4a3425" stroke-width="0.8" opacity="0.6" />
        <path d="M5 14 L95 12" stroke="#4a3425" stroke-width="0.8" opacity="0.5" />
        <path d="M15 8 L88 6" stroke="#d4a94a" stroke-width="1.5" opacity="0.5" />
        <rect x="22" y="6" width="3" height="3" rx="0.5" fill="#2a1d15" opacity="0.7" />
        <rect x="34" y="5.5" width="3" height="3" rx="0.5" fill="#2a1d15" opacity="0.7" />
        <rect x="46" y="5" width="3" height="3" rx="0.5" fill="#2a1d15" opacity="0.7" />
        <rect x="58" y="4.8" width="3" height="3" rx="0.5" fill="#2a1d15" opacity="0.7" />
        <rect x="70" y="5" width="3" height="3" rx="0.5" fill="#2a1d15" opacity="0.7" />
        <circle cx="0" cy="4" r="1.2" fill="#d4a94a" opacity="0.5" />
        <circle cx="5" cy="4" r="1.2" fill="#d4a94a" opacity="0.5" />
        <line x1="95" y1="2" x2="118" y2="-8" stroke="#5c4033" stroke-width="1.5" />
        <line x1="75" y1="-2" x2="75" y2="-42" stroke="#5c4033" stroke-width="2.5" />
        <path d="M77 -40 Q98 -28 96 -6 L77 -4 Z" fill="#d4c4a8" opacity="0.85" />
        <line x1="45" y1="0" x2="45" y2="-52" stroke="#5c4033" stroke-width="3" />
        <path d="M47 -50 Q72 -35 70 -5 L47 -3 Z" fill="#d4c4a8" opacity="0.9" />
        <rect x="42" y="-52" width="6" height="2" rx="1" fill="#5c4033" />
        <line x1="20" y1="2" x2="20" y2="-32" stroke="#5c4033" stroke-width="2" />
        <path d="M22 -30 Q36 -20 34 0 L22 2 Z" fill="#d4c4a8" opacity="0.8" />
        <path d="M45 -52 L45 -58" stroke="#5c4033" stroke-width="1" />
        <path d="M45 -58 L55 -55 L45 -52 Z" fill="#c44" opacity="0.9" />
      </g>
      <g class="hero-cannon-fire hero-cannon-fire--1" transform="translate(300, 476)">
        <circle cx="0" cy="0" r="5" fill="#ffcc44" />
        <circle cx="0" cy="0" r="8" fill="#ff9922" opacity="0.6" />
        <circle class="cannon-smoke cannon-smoke--1a" cx="4" cy="-2" r="6" fill="#c8c0b0" />
        <circle class="cannon-smoke cannon-smoke--1b" cx="8" cy="-4" r="8" fill="#b8b0a0" />
        <circle class="cannon-smoke cannon-smoke--1c" cx="14" cy="-6" r="10" fill="#a8a090" />
        <circle class="cannonball cannonball--1" cx="3" cy="0" r="2.5" fill="#2a1d15" />
      </g>
    </g>

    <g class="hero-ship hero-ship--2">
      <g transform="translate(1050, 478) scale(-1,1)">
        <ellipse cx="45" cy="22" rx="38" ry="3.5" fill="#3a5a5a" opacity="0.12" />
        <path d="M-6 -8 L6 -8 L14 -2 L75 -2 Q88 0 92 5 L88 14 L78 20 L6 20 L-2 16 L-6 12 Z" fill="#5c4033" />
        <path d="M14 -2 L14 2" stroke="#4a3425" stroke-width="1" opacity="0.5" fill="none" />
        <path d="M8 8 L82 6" stroke="#4a3425" stroke-width="0.7" opacity="0.55" />
        <path d="M5 12 L85 10" stroke="#4a3425" stroke-width="0.7" opacity="0.45" />
        <path d="M14 6 L78 4" stroke="#d4a94a" stroke-width="1.2" opacity="0.45" />
        <rect x="20" y="4.5" width="2.5" height="2.5" rx="0.5" fill="#2a1d15" opacity="0.65" />
        <rect x="32" y="4" width="2.5" height="2.5" rx="0.5" fill="#2a1d15" opacity="0.65" />
        <rect x="44" y="3.5" width="2.5" height="2.5" rx="0.5" fill="#2a1d15" opacity="0.65" />
        <rect x="56" y="3.5" width="2.5" height="2.5" rx="0.5" fill="#2a1d15" opacity="0.65" />
        <circle cx="-2" cy="2" r="1" fill="#d4a94a" opacity="0.45" />
        <circle cx="3" cy="2" r="1" fill="#d4a94a" opacity="0.45" />
        <line x1="82" y1="0" x2="102" y2="-7" stroke="#5c4033" stroke-width="1.5" />
        <line x1="65" y1="-1" x2="65" y2="-38" stroke="#5c4033" stroke-width="2.5" />
        <path d="M67 -36 Q84 -25 82 -5 L67 -3 Z" fill="#d4c4a8" opacity="0.82" />
        <line x1="40" y1="0" x2="40" y2="-46" stroke="#5c4033" stroke-width="2.5" />
        <path d="M42 -44 Q62 -32 60 -4 L42 -2 Z" fill="#d4c4a8" opacity="0.85" />
        <rect x="37" y="-46" width="6" height="2" rx="1" fill="#5c4033" />
        <line x1="18" y1="2" x2="18" y2="-28" stroke="#5c4033" stroke-width="2" />
        <path d="M20 -26 Q32 -18 30 0 L20 2 Z" fill="#d4c4a8" opacity="0.75" />
        <path d="M40 -46 L40 -52" stroke="#5c4033" stroke-width="1" />
        <path d="M40 -52 L50 -49 L40 -46 Z" fill="#2255aa" opacity="0.85" />
      </g>
      <g class="hero-cannon-fire hero-cannon-fire--2" transform="translate(1005, 482)">
        <circle cx="0" cy="0" r="4.5" fill="#ffcc44" />
        <circle cx="0" cy="0" r="7" fill="#ff9922" opacity="0.6" />
        <circle class="cannon-smoke cannon-smoke--2a" cx="-4" cy="-2" r="5.5" fill="#c8c0b0" />
        <circle class="cannon-smoke cannon-smoke--2b" cx="-8" cy="-4" r="7" fill="#b8b0a0" />
        <circle class="cannon-smoke cannon-smoke--2c" cx="-14" cy="-5" r="9" fill="#a8a090" />
        <circle class="cannonball cannonball--2" cx="-3" cy="0" r="2.5" fill="#2a1d15" />
      </g>
    </g>

    <g class="hero-ship hero-ship--3" opacity="0.55">
      <g transform="translate(680, 450)">
        <path d="M-2 7 Q1 1 10 -1 L32 -1 Q38 1 39 5 L37 8 L34 10 L2 10 Z" fill="#5c4033" />
        <path d="M5 4 L34 3" stroke="#d4a94a" stroke-width="0.6" opacity="0.7" />
        <line x1="34" y1="0" x2="44" y2="-4" stroke="#5c4033" stroke-width="1" />
        <line x1="20" y1="0" x2="20" y2="-22" stroke="#5c4033" stroke-width="1.8" />
        <path d="M22 -20 Q34 -13 33 -1 L22 0 Z" fill="#d4c4a8" opacity="0.9" />
        <path d="M22 -18 L38 -2 L22 -1 Z" fill="#d4c4a8" opacity="0.75" />
        <path d="M20 -22 L20 -26" stroke="#5c4033" stroke-width="0.8" />
        <path d="M20 -26 L26 -24 L20 -22 Z" fill="#c44" opacity="0.8" />
      </g>
    </g>

    <g class="hero-splash hero-splash--1" transform="translate(980, 485)">
      <path d="M0 0 Q-3 -12 -1 -18" stroke="#d0e8f0" stroke-width="2" fill="none" />
      <path d="M0 0 Q2 -14 5 -16" stroke="#d0e8f0" stroke-width="1.5" fill="none" />
      <path d="M0 0 Q-5 -8 -7 -12" stroke="#d0e8f0" stroke-width="1.2" fill="none" />
      <ellipse cx="0" cy="2" rx="10" ry="3" fill="#b8dce8" opacity="0.4" />
    </g>
    <g class="hero-splash hero-splash--2" transform="translate(420, 478)">
      <path d="M0 0 Q3 -10 1 -15" stroke="#d0e8f0" stroke-width="1.5" fill="none" />
      <path d="M0 0 Q-2 -12 -4 -14" stroke="#d0e8f0" stroke-width="1.2" fill="none" />
      <path d="M0 0 Q5 -7 6 -10" stroke="#d0e8f0" stroke-width="1" fill="none" />
      <ellipse cx="0" cy="2" rx="8" ry="2.5" fill="#b8dce8" opacity="0.35" />
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

.hero-clouds { animation: cloud-drift 80s linear infinite; }
@keyframes cloud-drift { 0% { transform: translateX(0); } 100% { transform: translateX(60px); } }

.hero-island--far  { animation: island-sway-far 20s ease-in-out infinite; }
.hero-island--mid  { animation: island-sway-mid 16s ease-in-out infinite; }
.hero-island--near { animation: island-sway-near 14s ease-in-out infinite; }
@keyframes island-sway-far  { 0%,100% { transform: translateY(0); } 50% { transform: translateY(2px); } }
@keyframes island-sway-mid  { 0%,100% { transform: translateY(0); } 50% { transform: translateY(3px); } }
@keyframes island-sway-near { 0%,100% { transform: translateY(0); } 50% { transform: translateY(4px); } }

.hero-ship--1 { animation: ship-sail-1 18s ease-in-out infinite; }
.hero-ship--2 { animation: ship-sail-2 22s ease-in-out infinite; }
.hero-ship--3 { animation: ship-sail-3 28s ease-in-out infinite; }
@keyframes ship-sail-1 {
  0%,100% { transform: translate(0,0) rotate(-1deg); }
  25%     { transform: translate(35px,-5px) rotate(1.5deg); }
  50%     { transform: translate(60px,0) rotate(-0.5deg); }
  75%     { transform: translate(35px,-6px) rotate(1deg); }
}
@keyframes ship-sail-2 {
  0%,100% { transform: translate(0,0) rotate(0.5deg); }
  25%     { transform: translate(-30px,-4px) rotate(-1.5deg); }
  50%     { transform: translate(-50px,0) rotate(1deg); }
  75%     { transform: translate(-30px,-5px) rotate(-0.5deg); }
}
@keyframes ship-sail-3 {
  0%,100% { transform: translate(0,0) rotate(-0.3deg); }
  25%     { transform: translate(18px,-2px) rotate(0.5deg); }
  50%     { transform: translate(30px,0) rotate(-0.3deg); }
  75%     { transform: translate(18px,-3px) rotate(0.6deg); }
}

.hero-cannon-fire--1, .hero-cannon-fire--2 { opacity: 0; }
.hero-cannon-fire--1 { animation: cannon-blast 6s ease-out infinite 1s; }
.hero-cannon-fire--2 { animation: cannon-blast 6s ease-out infinite 3.5s; }
@keyframes cannon-blast {
  0%   { opacity: 0; }
  2%   { opacity: 1; }
  6%   { opacity: 0.85; }
  15%  { opacity: 0.3; }
  28%  { opacity: 0; }
  100% { opacity: 0; }
}

.cannon-smoke--1a, .cannon-smoke--2a { opacity: 0; animation: smoke-a 6s ease-out infinite; }
.cannon-smoke--1b, .cannon-smoke--2b { opacity: 0; animation: smoke-b 6s ease-out infinite; }
.cannon-smoke--1c, .cannon-smoke--2c { opacity: 0; animation: smoke-c 6s ease-out infinite; }

.hero-cannon-fire--1 .cannon-smoke--1a,
.hero-cannon-fire--1 .cannon-smoke--1b,
.hero-cannon-fire--1 .cannon-smoke--1c,
.hero-cannon-fire--1 .cannonball--1 { animation-delay: 1s; }
.hero-cannon-fire--2 .cannon-smoke--2a,
.hero-cannon-fire--2 .cannon-smoke--2b,
.hero-cannon-fire--2 .cannon-smoke--2c,
.hero-cannon-fire--2 .cannonball--2 { animation-delay: 3.5s; }

@keyframes smoke-a {
  0% { opacity: 0; transform: translate(0,0); }
  3% { opacity: 0.55; transform: translate(0,0); }
  20% { opacity: 0.25; transform: translate(8px,-14px); }
  40% { opacity: 0; transform: translate(16px,-24px); }
  100% { opacity: 0; }
}
@keyframes smoke-b {
  0% { opacity: 0; transform: translate(0,0); }
  5% { opacity: 0.4; transform: translate(0,0); }
  25% { opacity: 0.18; transform: translate(12px,-18px); }
  45% { opacity: 0; transform: translate(22px,-30px); }
  100% { opacity: 0; }
}
@keyframes smoke-c {
  0% { opacity: 0; transform: translate(0,0); }
  8% { opacity: 0.25; transform: translate(0,0); }
  30% { opacity: 0.1; transform: translate(16px,-22px); }
  50% { opacity: 0; transform: translate(28px,-36px); }
  100% { opacity: 0; }
}

.cannonball--1 { opacity: 0; animation: cannonball-right 6s ease-in infinite; }
.cannonball--2 { opacity: 0; animation: cannonball-left 6s ease-in infinite; }
@keyframes cannonball-right {
  0% { opacity: 0; transform: translate(0,0); }
  2% { opacity: 0.8; transform: translate(0,0); }
  12% { opacity: 0.6; transform: translate(510px,-40px); }
  15% { opacity: 0; transform: translate(680px,9px); }
  100% { opacity: 0; }
}
@keyframes cannonball-left {
  0% { opacity: 0; transform: translate(0,0); }
  2% { opacity: 0.8; transform: translate(0,0); }
  12% { opacity: 0.6; transform: translate(-440px,-35px); }
  15% { opacity: 0; transform: translate(-585px,-4px); }
  100% { opacity: 0; }
}

.hero-splash--1, .hero-splash--2 { opacity: 0; }
.hero-splash--1 { animation: splash 6s ease-out infinite 1.7s; }
.hero-splash--2 { animation: splash 6s ease-out infinite 4.2s; }
@keyframes splash {
  0% { opacity: 0; }
  2% { opacity: 0.8; }
  8% { opacity: 0.5; }
  18% { opacity: 0; }
  100% { opacity: 0; }
}

.hero-wave--1 { animation: wave-shift-1 7s ease-in-out infinite; }
.hero-wave--2 { animation: wave-shift-2 9s ease-in-out infinite; }
.hero-wave--3 { animation: wave-shift-3 11s ease-in-out infinite; }
.hero-wave--4 { animation: wave-shift-4 13s ease-in-out infinite; }
@keyframes wave-shift-1 { 0%,100% { transform: translateX(0); } 50% { transform: translateX(30px); } }
@keyframes wave-shift-2 { 0%,100% { transform: translateX(0); } 50% { transform: translateX(-25px); } }
@keyframes wave-shift-3 { 0%,100% { transform: translateX(0); } 50% { transform: translateX(20px); } }
@keyframes wave-shift-4 { 0%,100% { transform: translateX(0); } 50% { transform: translateX(-18px); } }

@media (prefers-reduced-motion: reduce) {
  .hero-clouds, .hero-island--far, .hero-island--mid, .hero-island--near,
  .hero-ship--1, .hero-ship--2, .hero-ship--3,
  .hero-wave--1, .hero-wave--2, .hero-wave--3, .hero-wave--4,
  .hero-cannon-fire--1, .hero-cannon-fire--2,
  .cannon-smoke--1a, .cannon-smoke--1b, .cannon-smoke--1c,
  .cannon-smoke--2a, .cannon-smoke--2b, .cannon-smoke--2c,
  .cannonball--1, .cannonball--2,
  .hero-splash--1, .hero-splash--2 { animation: none; }
}
</style>
