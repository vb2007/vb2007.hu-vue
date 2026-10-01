<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { isLoggedIn, userEmail } from "@/scripts/authentication/authState";
import { fetchUserDetails, logout, restoreSession } from "@/scripts/authentication/user";
import { TOOLS_LINE } from "@/constants/stops";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BrandMark from "@/components/ui/BrandMark.vue";
import RouteStrip from "@/components/ui/RouteStrip.vue";
import ThemeToggle from "@/components/ui/ThemeToggle.vue";

const route = useRoute();
const isMenuOpen = ref(false);

const closeMenu = () => {
  isMenuOpen.value = false;
};

const handleLogout = () => {
  logout();
  closeMenu();
};

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === "Escape" && isMenuOpen.value) closeMenu();
};

onMounted(() => {
  restoreSession();
  window.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));

watch(isLoggedIn, (loggedIn) => {
  if (loggedIn && !userEmail.value) {
    fetchUserDetails();
  }
});

watch(() => route.fullPath, closeMenu);
</script>

<template>
  <header class="bar">
    <div class="bar__inner">
      <RouterLink to="/" class="bar__brand" aria-label="vb2007.hu, home">
        <BrandMark />
        <span class="bar__name">vb2007.hu</span>
      </RouterLink>

      <button
        class="bar__toggle"
        type="button"
        :aria-expanded="isMenuOpen"
        aria-controls="site-menu"
        @click="isMenuOpen = !isMenuOpen"
      >
        <AppIcon :name="isMenuOpen ? 'close' : 'menu'" :size="24" />
        <span class="visually-hidden">{{ isMenuOpen ? "Close menu" : "Open menu" }}</span>
      </button>

      <div id="site-menu" class="bar__menu" :class="{ 'bar__menu--open': isMenuOpen }">
        <div class="bar__route bar__route--wide">
          <RouteStrip :stops="TOOLS_LINE.stops" label="Tools" />
        </div>
        <div class="bar__route bar__route--narrow">
          <RouteStrip
            :stops="TOOLS_LINE.stops"
            orientation="vertical"
            label="Tools"
            @navigate="closeMenu"
          />
        </div>

        <div class="bar__account">
          <template v-if="isLoggedIn">
            <span v-if="userEmail" class="bar__user" :title="userEmail">{{ userEmail }}</span>
            <BaseButton size="sm" variant="secondary" @click="handleLogout">Log out</BaseButton>
          </template>
          <template v-else>
            <BaseButton size="sm" variant="ghost" to="/login">Log in</BaseButton>
            <BaseButton size="sm" to="/register">Register</BaseButton>
          </template>
          <ThemeToggle />
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.bar {
  position: sticky;
  top: 0;
  z-index: 50;
  background: var(--c-panel);
  border-bottom: var(--edge) solid var(--c-edge);
  /* The line itself runs under the whole bar */
  box-shadow: 0 0.3rem 0 var(--c-line);
}

.bar__inner {
  display: flex;
  align-items: center;
  gap: var(--sp-5);
  max-width: var(--page-max);
  min-height: var(--nav-h);
  margin: 0 auto;
  padding: 0 var(--page-gutter);
}

.bar__brand {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-3);
  color: var(--c-ink);
  text-decoration: none;
}

.bar__name {
  font-family: var(--font-board);
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.bar__brand:hover .bar__name {
  text-decoration: underline;
  text-decoration-thickness: 3px;
  text-decoration-color: var(--c-line);
  text-underline-offset: 0.2em;
}

.bar__toggle {
  display: none;
  margin-left: auto;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  padding: 0;
  border: var(--edge) solid var(--c-edge);
  border-radius: var(--radius-sm);
  background: var(--c-panel);
  cursor: pointer;
}

.bar__menu {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
}

.bar__route--narrow {
  display: none;
}

.bar__account {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}

.bar__user {
  max-width: 8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--fs-sm);
  font-weight: 500;
  color: var(--c-ink-soft);
}

@media (max-width: 75rem) {
  .bar__toggle {
    display: grid;
  }

  .bar__menu {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    flex-direction: column;
    align-items: stretch;
    gap: var(--sp-5);
    padding: var(--sp-5) var(--page-gutter) var(--sp-6);
    border-bottom: var(--edge) solid var(--c-edge);
    background: var(--c-panel);
    box-shadow: 0 0.3rem 0 var(--c-line);
    clip-path: inset(0 0 100% 0);
    visibility: hidden;
    transition:
      clip-path var(--dur-base) var(--ease-out),
      visibility 0s linear var(--dur-base);
  }

  .bar__menu--open {
    clip-path: inset(0 0 -1rem 0);
    visibility: visible;
    transition-delay: 0s;
  }

  .bar__route--wide {
    display: none;
  }

  .bar__route--narrow {
    display: block;
  }

  .bar__account {
    flex-wrap: wrap;
    padding-top: var(--sp-4);
    border-top: var(--edge) dashed var(--c-hairline);
  }

  .bar__user {
    flex-basis: 100%;
    max-width: none;
  }
}
</style>
