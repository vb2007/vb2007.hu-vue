<script setup lang="ts">
import { RouterView } from "vue-router";
import AdminGate from "@/components/features/admin/AdminGate.vue";
</script>

<template>
  <!-- Every admin page is a child route of this one, so the gate stands in front of all of them. -->
  <AdminGate>
    <!--
      This view stays mounted between admin pages, so App's route fade doesn't run there: the same
      fade runs here instead. Entering or leaving the area is App's fade alone, since this one
      neither appears on first render nor runs when the whole area goes.
    -->
    <RouterView v-slot="{ Component }">
      <Transition name="route" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
  </AdminGate>
</template>
