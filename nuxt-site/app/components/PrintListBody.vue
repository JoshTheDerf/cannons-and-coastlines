<script setup lang="ts">
// The tables and CubbySlicer plates of one print list (usePrintList), on
// /print-guide for the base set and /print-list/<set> for the rest.
import type { PrintList, PrintPart } from '~/composables/usePrintList'

const props = defineProps<{ pl: PrintList }>()
const L = computed(() => props.pl.L)
const general = computed(() => ['perPlayer', 'perTable'].map(k => L.value.general[k] as { title: string, parts: PrintPart[] }))
</script>

<template>
  <div>
    <!-- One list per fleet -->
    <section v-for="f in pl.fleets" :id="f.id" :key="f.id" class="pt-10 pb-2 px-4 scroll-mt-20">
      <div class="container mx-auto max-w-4xl">
        <h2 v-if="pl.fleets.length > 1" class="font-display text-2xl text-ink">{{ pl.guideFleet(f.id).name }}</h2>
        <p class="mt-1 mb-4 font-serif text-sm muted">{{ f.ships }} {{ f.shipType }} with {{ f.fittings }}</p>
        <div class="overflow-x-auto">
          <table class="rulebook print-list table-fixed w-full font-serif text-sm">
            <thead>
              <tr><th class="hidden sm:table-cell w-16"><span class="sr-only">Picture</span></th><th>Part</th><th class="w-12 sm:w-20">Qty</th><th class="w-28 sm:w-44">Color</th><th class="w-20 sm:w-24">Supports</th></tr>
            </thead>
            <tbody>
              <tr v-for="p in f.parts" :key="p.file + p.part">
                <td class="hidden sm:table-cell"><img :src="pl.renderOf(p)" alt="" loading="lazy" class="size-12 object-contain"></td>
                <td>
                  <span class="font-semibold">{{ p.part }}</span>
                  <br><span class="text-xs italic text-ink-faint [overflow-wrap:anywhere]">{{ p.file }}<template v-if="p.base && pl.isPaid(f.set)"> from the base set</template></span>
                  <SlicerLink :to="pl.openPart(p, f)" />
                  <RichText v-if="p.note" tag="div" :text="p.note" class="text-xs muted" />
                </td>
                <td class="font-semibold text-base whitespace-nowrap">{{ pl.qtyOf(p, f) }}</td>
                <td><RichText :text="pl.colorOf(p.color, f)" /></td>
                <td>{{ p.supports ? 'Yes' : 'No' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- Shared pieces -->
    <section v-if="pl.hasBase" id="general" class="pt-10 pb-4 px-4 scroll-mt-20">
      <div class="container mx-auto max-w-4xl">
        <h2 class="font-display text-2xl text-ink">{{ L.general.title }}</h2>
        <div v-for="sec in general" :key="sec.title" class="mt-6">
          <h3 class="font-display text-lg text-ink">{{ sec.title }}</h3>
          <div class="overflow-x-auto">
            <table class="rulebook print-list table-fixed w-full font-serif text-sm">
              <thead>
                <tr><th class="hidden sm:table-cell w-16"><span class="sr-only">Picture</span></th><th>Part</th><th class="w-12 sm:w-20">Qty</th><th class="w-28 sm:w-44">Color</th><th class="w-20 sm:w-24">Supports</th></tr>
              </thead>
              <tbody>
                <tr v-for="p in sec.parts" :key="p.file">
                  <td class="hidden sm:table-cell"><img :src="pl.renderOf(p)" alt="" loading="lazy" class="size-12 object-contain"></td>
                  <td>
                    <span class="font-semibold">{{ p.part }}</span>
                    <br><span class="text-xs italic text-ink-faint [overflow-wrap:anywhere]">{{ p.file }}</span>
                    <SlicerLink :to="pl.openPart(p)" />
                    <RichText v-if="p.note" tag="div" :text="p.note" class="text-xs muted" />
                  </td>
                  <td class="font-semibold text-base whitespace-nowrap">{{ pl.qtyOf(p) }}</td>
                  <td><RichText :text="pl.colorOf(p.color)" /></td>
                  <td>{{ p.supports ? 'Yes' : 'No' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>

    <!-- Plate files for CubbySlicer, one per color -->
    <section id="slicer" class="pt-10 pb-14 px-4 scroll-mt-20">
      <div class="container mx-auto max-w-4xl">
        <h2 class="font-display text-2xl text-ink">Print it in CubbySlicer</h2>
        <p class="mt-2 max-w-2xl font-serif text-sm text-ink-soft">
          Each file is one color's parts from this list, laid out on a 256 mm plate with the settings.
          Open one in <a href="https://cubbycad.com/slicer/" target="_blank" rel="noopener" class="underline text-[color:var(--gold)]">CubbySlicer</a>
          (it runs in your browser) or download the .3mf for OrcaSlicer.
          The <UIcon name="i-lucide-square-arrow-out-up-right" class="size-3.5 align-[-2px] text-[color:var(--gold)]" /> by a file name in the tables opens just that file.
        </p>
        <div v-for="sec in pl.plateSections" :key="sec.key" class="mt-6">
          <h3 v-if="pl.plateSections.length > 1" class="font-display text-lg text-ink">{{ sec.title }}</h3>
          <PrintPlates :plates="sec.plates" />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.print-list td { vertical-align: middle; }
</style>
