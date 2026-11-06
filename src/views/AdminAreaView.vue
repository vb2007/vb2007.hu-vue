<script setup lang="ts">
import { shallowRef, watch } from "vue";
import { RouterView, useRouter } from "vue-router";
import { AdminPaths } from "@/constants/admin";
import AdminGate from "@/components/features/admin/AdminGate.vue";

const { currentRoute } = useRouter();

// The admin page on show. On the way out of the area App's fade takes this whole view away, so it
// keeps the last admin page until then rather than fading that page out on its own as well.
const shown = shallowRef(currentRoute.value);
watch(currentRoute, (route) => {
  if (route.matched[0]?.path === AdminPaths.overview) shown.value = route;
});
</script>

<template>
  <!--
    Every admin page is a child route of this one, so the gate stands in front of all of them.
    The element root takes App's route fade, so the gate swapping in or out (on a log out, say)
    swaps plainly inside it: a component root would hand App's fade on to the gate, never finished.
  -->
  <div>
    <AdminGate>
      <!-- This view stays mounted between admin pages, so the same fade runs here for them. -->
      <RouterView v-slot="{ Component }" :route="shown">
        <Transition name="route" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </AdminGate>
  </div>
</template>
