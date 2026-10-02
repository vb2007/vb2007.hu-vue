<script setup lang="ts">
import { RouterLink } from "vue-router";
import { getCurrentYear } from "@/scripts/utility/dateUtil";

const currentYear = getCurrentYear();
</script>

<template>
  <footer class="foot">
    <div class="foot__inner">
      <div class="foot__board">
        <RouterLink to="/" class="foot__name">vb2007.hu</RouterLink>
        <p class="foot__meta">Built by VB2007 &middot; 2023 &ndash; {{ currentYear }}</p>
      </div>
      <nav class="foot__links" aria-label="Footer">
        <RouterLink to="/shorten">Shorten</RouterLink>
        <RouterLink to="/login">Log in</RouterLink>
        <RouterLink to="/register">Register</RouterLink>
      </nav>
    </div>
  </footer>
</template>

<style scoped>
.foot {
  position: relative;
  margin-top: var(--sp-8);
  background: var(--c-deep);
  color: var(--c-on-deep);
}

/* The route line arrives from the left edge and ends in a terminus ring */
.foot {
  --ring: 1.75rem;
  --ring-right: max(var(--page-gutter), calc((100% - var(--page-max)) / 2 + var(--page-gutter)));
}

.foot::before {
  content: "";
  position: absolute;
  top: -1.0625rem;
  right: var(--ring-right);
  z-index: 1;
  width: var(--ring);
  height: var(--ring);
  border: 5px solid var(--c-line-on-deep);
  border-radius: 50%;
  background: var(--c-deep);
}

.foot::after {
  content: "";
  position: absolute;
  top: -0.3375rem;
  left: 0;
  width: calc(100% - var(--ring-right) - var(--ring) / 2);
  height: 0.3rem;
  background: var(--c-line-on-deep);
}

.foot__inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-5);
  max-width: var(--page-max);
  margin: 0 auto;
  padding: var(--sp-6) var(--page-gutter);
}

.foot__name {
  font-family: var(--font-board);
  font-size: var(--fs-lg);
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: inherit;
  text-decoration: none;
}

.foot__meta {
  margin-top: var(--sp-2);
  font-size: var(--fs-sm);
  opacity: 0.8;
}

.foot__links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-5);
}

.foot__links a {
  color: inherit;
  font-weight: 500;
  text-underline-offset: 0.25em;
}

.foot__links a:hover {
  color: var(--c-line-on-deep);
}
</style>
