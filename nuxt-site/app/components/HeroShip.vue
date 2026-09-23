<script setup lang="ts">
// One square-rigged sailing ship for the hero scene, drawn side-on and facing
// right (bow at +x). Local units: waterline at y = 0, stern at x ≈ 0, bow tip
// at x ≈ 370, main truck at y ≈ -252. Place and scale it with a parent <g>.
//
// `masts: 3` is a ship of the line (mizzen, main, fore); `masts: 2` is a brig.
// `fire` draws a rippling broadside from the upper gun ports; its timing is
// the CSS variable --fire-delay on the parent (see HeroScene).
const props = withDefaults(defineProps<{
  id: string
  flag?: string
  hull?: string
  masts?: 2 | 3
  fire?: boolean
}>(), { flag: '#b3261e', hull: '#4a3222', masts: 3, fire: false })

type Sail = { x: number, top: number, bot: number, wt: number, wb: number }

// Square sails: x = mast, top/bot = yard heights, wt/wb = half-widths.
const mainSails: Sail[] = [
  { x: 148, top: -120, bot: -62, wt: 44, wb: 52 },
  { x: 148, top: -178, bot: -128, wt: 34, wb: 42 },
  { x: 148, top: -222, bot: -184, wt: 24, wb: 31 },
]
const foreSails: Sail[] = [
  { x: 226, top: -114, bot: -66, wt: 38, wb: 46 },
  { x: 226, top: -166, bot: -120, wt: 30, wb: 37 },
  { x: 226, top: -202, bot: -172, wt: 21, wb: 27 },
]
const mizzenSails: Sail[] = [
  { x: 62, top: -160, bot: -122, wt: 24, wb: 29 },
]

const sails = computed(() => props.masts === 3
  ? [...mainSails, ...foreSails, ...mizzenSails]
  : [...mainSails.map(s => ({ ...s, x: 110 })), ...foreSails.map(s => ({ ...s, x: 214 }))])

const masts = computed(() => props.masts === 3
  ? [{ x: 62, deck: -58, top: -192 }, { x: 148, deck: -50, top: -252 }, { x: 226, deck: -58, top: -228 }]
  : [{ x: 110, deck: -52, top: -252 }, { x: 214, deck: -56, top: -228 }])

function sailPath(s: Sail) {
  const mid = (s.top + s.bot) / 2
  return `M${s.x - s.wt} ${s.top} L${s.x + s.wt} ${s.top}`
    + ` Q${s.x + s.wb + 7} ${mid} ${s.x + s.wb} ${s.bot}`
    + ` Q${s.x} ${s.bot + 9} ${s.x - s.wb} ${s.bot}`
    + ` Q${s.x - s.wb - 4} ${mid} ${s.x - s.wt} ${s.top} Z`
}

// The waist sags a little, so ports follow the sheer rather than a ruler.
const sheer = (x: number) => 6 * Math.sin(Math.PI * Math.min(1, Math.max(0, (x - 30) / 250)))
const upperPorts = [66, 88, 110, 132, 154, 176, 198, 220, 242].map(x => ({ x, y: -40 + sheer(x) }))
const lowerPorts = [76, 100, 124, 148, 172, 196, 220].map(x => ({ x, y: -22 + sheer(x) * 0.6 }))
</script>

<template>
  <g class="ship">
    <defs>
      <linearGradient :id="`${id}-hull`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" :stop-color="hull" />
        <stop offset="100%" stop-color="#1f140c" />
      </linearGradient>
      <linearGradient :id="`${id}-sail`" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#d9caa6" />
        <stop offset="45%" stop-color="#f3ead3" />
        <stop offset="100%" stop-color="#cbb98f" />
      </linearGradient>
    </defs>

    <!-- Wake and bow wave, under the hull -->
    <path class="ship-wake" d="M18 6 Q-40 4 -120 10 Q-40 12 18 12 Z" fill="#e8f2f2" opacity="0.35" />
    <path class="ship-bow-wave" d="M262 4 Q284 -6 300 2 Q312 10 330 8 Q300 16 262 12 Z" fill="#f2f8f8" opacity="0.7" />

    <!-- Standing rigging behind the sails -->
    <g stroke="#2a1d14" stroke-width="0.9" opacity="0.55" fill="none">
      <template v-if="masts.length === 3">
        <line x1="148" y1="-250" x2="226" y2="-122" />
        <line x1="62" y1="-190" x2="148" y2="-150" />
        <line x1="148" y1="-250" x2="96" y2="-52" />
        <line x1="62" y1="-190" x2="22" y2="-68" />
      </template>
      <template v-else>
        <line x1="110" y1="-250" x2="214" y2="-122" />
        <line x1="110" y1="-250" x2="40" y2="-60" />
      </template>
      <line :x1="masts[masts.length - 1]!.x" :y1="masts[masts.length - 1]!.top + 2" x2="368" y2="-96" />
      <line :x1="masts[masts.length - 1]!.x" y1="-150" x2="340" y2="-86" />
      <line :x1="masts[masts.length - 1]!.x" :y1="masts[masts.length - 1]!.top + 2" x2="182" y2="-54" />
    </g>

    <!-- Masts -->
    <g stroke="#3a2718" stroke-linecap="round">
      <template v-for="m in masts" :key="m.x">
        <line :x1="m.x" :y1="m.deck" :x2="m.x" :y2="(m.top + m.deck) / 2" stroke-width="5" />
        <line :x1="m.x" :y1="(m.top + m.deck) / 2" :x2="m.x" :y2="m.top" stroke-width="3" />
        <rect :x="m.x - 9" :y="-124" width="18" height="4" fill="#3a2718" stroke="none" />
      </template>
    </g>

    <!-- Spanker (fore-and-aft sail on the mizzen) -->
    <g v-if="masts.length === 3">
      <line x1="62" y1="-112" x2="14" y2="-98" stroke="#3a2718" stroke-width="2.5" />
      <line x1="62" y1="-64" x2="-8" y2="-70" stroke="#3a2718" stroke-width="2.5" />
      <path class="sail" d="M60 -110 L16 -97 Q2 -84 -4 -71 L60 -66 Q64 -88 60 -110 Z" :fill="`url(#${id}-sail)`" stroke="#b7a57e" stroke-width="0.8" />
    </g>

    <!-- Square sails, each hung from a yard -->
    <g v-for="(s, i) in sails" :key="i">
      <path class="sail" :d="sailPath(s)" :fill="`url(#${id}-sail)`" stroke="#b7a57e" stroke-width="0.8" />
      <path :d="`M${s.x - s.wt * 0.55} ${s.top + 2} Q${s.x - s.wb * 0.5} ${(s.top + s.bot) / 2} ${s.x - s.wb * 0.62} ${s.bot + 2}`" stroke="#c2b089" stroke-width="0.7" fill="none" opacity="0.7" />
      <line :x1="s.x - s.wt - 5" :y1="s.top" :x2="s.x + s.wt + 5" :y2="s.top" stroke="#3a2718" stroke-width="2.4" stroke-linecap="round" />
    </g>

    <!-- Headsails and bowsprit -->
    <line x1="286" y1="-62" x2="370" y2="-97" stroke="#3a2718" stroke-width="3.5" stroke-linecap="round" />
    <path class="sail" :d="`M${masts[masts.length - 1]!.x + 4} ${masts[masts.length - 1]!.top + 30} L364 -95 Q330 -80 300 -74 Q268 -130 ${masts[masts.length - 1]!.x + 4} ${masts[masts.length - 1]!.top + 30} Z`" :fill="`url(#${id}-sail)`" stroke="#b7a57e" stroke-width="0.8" />
    <path class="sail" :d="`M${masts[masts.length - 1]!.x + 4} -146 L336 -86 Q300 -74 272 -66 Q250 -104 ${masts[masts.length - 1]!.x + 4} -146 Z`" :fill="`url(#${id}-sail)`" stroke="#b7a57e" stroke-width="0.8" opacity="0.95" />

    <!-- Hull -->
    <path
      d="M6 -72 L40 -72 L44 -60 L80 -58 Q150 -46 216 -54 L222 -62 L262 -64 Q290 -62 300 -68 L303 -60 Q292 -32 272 -6 Q262 8 238 10 L42 10 Q24 8 18 -6 L10 -42 Q4 -58 6 -72 Z"
      :fill="`url(#${id}-hull)`"
      stroke="#150d07"
      stroke-width="1"
    />
    <!-- Rails, wales and the gold stripe along the gun deck -->
    <path d="M8 -66 L42 -66 M46 -54 L80 -52 Q150 -40 216 -48 L262 -58" stroke="#c89b3c" stroke-width="1.4" fill="none" opacity="0.8" />
    <path d="M12 -32 Q150 -16 286 -34" stroke="#c89b3c" stroke-width="3" fill="none" opacity="0.75" />
    <path d="M16 -14 Q150 0 276 -16" stroke="#120b06" stroke-width="3" fill="none" opacity="0.6" />
    <!-- Stern gallery windows -->
    <g fill="#e2b95a" opacity="0.8">
      <rect x="10" y="-64" width="4" height="5" /><rect x="17" y="-64" width="4" height="5" /><rect x="24" y="-64" width="4" height="5" />
      <rect x="11" y="-52" width="4" height="5" /><rect x="18" y="-52" width="4" height="5" />
    </g>
    <!-- Figurehead -->
    <path d="M300 -66 Q312 -64 314 -56 Q306 -58 302 -58 Z" fill="#c89b3c" opacity="0.85" />
    <!-- Gun ports -->
    <g fill="#120b06">
      <rect v-for="p in upperPorts" :key="`u${p.x}`" :x="p.x - 3" :y="p.y - 3" width="6" height="6" rx="0.5" />
      <rect v-for="p in lowerPorts" :key="`l${p.x}`" :x="p.x - 3" :y="p.y - 3" width="6" height="6" rx="0.5" />
    </g>

    <!-- Ensign at the stern and a pennant streaming from the main truck -->
    <line x1="6" y1="-72" x2="-6" y2="-104" stroke="#3a2718" stroke-width="1.8" />
    <path class="flag" d="M-6 -104 Q6 -108 18 -103 Q28 -99 36 -102 L34 -86 Q24 -83 14 -87 Q4 -91 -4 -88 Z" :fill="flag" />
    <path
      class="pennant"
      :transform="`translate(${masts[masts.length === 3 ? 1 : 0]!.x} ${masts[masts.length === 3 ? 1 : 0]!.top})`"
      d="M0 0 Q16 -4 30 1 Q44 6 60 2 L0 6 Z"
      :fill="flag"
    >
      <animate attributeName="d" dur="2.4s" repeatCount="indefinite"
        values="M0 0 Q16 -4 30 1 Q44 6 60 2 L0 6 Z;M0 0 Q16 4 30 -1 Q44 -6 60 -2 L0 6 Z;M0 0 Q16 -4 30 1 Q44 6 60 2 L0 6 Z" />
    </path>

    <!-- Broadside: flash + smoke at each upper port, rippling bow to stern -->
    <g v-if="fire" filter="url(#hero-smoke-blur)">
      <g v-for="(p, i) in upperPorts" :key="`f${p.x}`" class="gun" :style="{ '--i': upperPorts.length - 1 - i }" :transform="`translate(${p.x} ${p.y})`">
        <circle class="gun-flash" r="6" fill="#ffd166" />
        <circle class="gun-smoke gun-smoke--a" r="14" fill="#e6e0d2" />
        <circle class="gun-smoke gun-smoke--b" cx="8" cy="-6" r="18" fill="#d8d1c1" />
      </g>
    </g>
  </g>
</template>
