<script setup lang="ts">
import { provide } from "vue";
import { RouterView } from "vue-router";
import AppNavbar from "@/components/layout/AppNavbar.vue";
import AppFooter from "@/components/layout/AppFooter.vue";
import { isLoggedIn, userEmail } from "@/scripts/authentication/authState";

provide("isLoggedIn", isLoggedIn);
provide("userEmail", userEmail);
</script>

<template>
  <div class="shell">
    <a class="shell__skip" href="#main">Skip to content</a>
    <AppNavbar />
    <main id="main" class="shell__main">
      <RouterView v-slot="{ Component }">
        <Transition name="route" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>
    <AppFooter />
  </div>
</template>

<style scoped>
.shell {
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
}

/* Two parallel lines cross the field on the diagonal, like routes behind the signage. */
.shell::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background: linear-gradient(
    135deg,
    transparent 0 58%,
    var(--c-field-deep) 58% 60.5%,
    transparent 60.5% 63.5%,
    var(--c-field-deep) 63.5% 66%,
    transparent 66%
  );
}

.shell__main {
  flex: 1;
}

.shell__skip {
  position: absolute;
  left: var(--sp-4);
  top: -4rem;
  z-index: 100;
  padding: var(--sp-2) var(--sp-4);
  border-radius: var(--radius-sm);
  background: var(--c-action);
  color: var(--c-on-action);
  font-weight: 600;
  transition: top var(--dur-quick) var(--ease-out);
}

.shell__skip:focus {
  top: var(--sp-3);
}

.route-enter-active {
  transition:
    opacity var(--dur-base) var(--ease-out),
    transform var(--dur-base) var(--ease-out);
}

.route-leave-active {
  transition: opacity 120ms ease;
}

.route-enter-from {
  opacity: 0;
  transform: translateX(1.5rem);
}

.route-leave-to {
  opacity: 0;
}
</style>
