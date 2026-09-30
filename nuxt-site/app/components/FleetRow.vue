<script setup lang="ts">
// One fleet in a list: picture, name, summary and a one-line stat summary,
// linking to the fleet's page (/shop/<id>), which has everything else. A paid
// fleet gets its price and Add to cart; a base fleet links to the free files.
import { fleetPage, statLine, type Fleet } from '#shared/utils/fleets'

const props = defineProps<{ fleet: Fleet }>()
const to = computed(() => fleetPage(props.fleet))
</script>

<template>
  <li class="py-4 grid grid-cols-[5.5rem_1fr] sm:grid-cols-[7rem_1fr_auto] gap-4 items-center">
    <NuxtLink :to="to"><img :src="fleet.image" :alt="fleet.name" loading="lazy" class="w-full aspect-[4/3] object-contain"></NuxtLink>
    <div class="min-w-0">
      <NuxtLink :to="to" class="font-display text-lg text-ink hover:text-[color:var(--heading)]">{{ fleet.name }}</NuxtLink>
      <p class="text-sm text-ink-faint">{{ statLine(fleet) }}</p>
      <p class="mt-1 font-serif text-sm text-ink-soft">{{ fleet.summary }}</p>
    </div>
    <div class="col-start-2 sm:col-start-auto flex sm:justify-end">
      <FilesButtons v-if="fleet.group === 'addon'" :fleet="fleet.id" class="sm:justify-end" />
      <NuxtLink v-else :to="`/print-list/${fleet.set}`" class="text-sm font-semibold text-[color:var(--gold)] hover:underline whitespace-nowrap">
        STL files, free
      </NuxtLink>
    </div>
  </li>
</template>
