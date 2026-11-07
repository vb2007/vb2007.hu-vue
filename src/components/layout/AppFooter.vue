<script setup lang="ts">
import { RouterLink } from "vue-router";
import { CONTACT_EMAIL, CONTACT_MAILTO, MATRIX_ID, MATRIX_URL, SITE_NAME } from "@/constants/site";
import { TOOLS_LINE } from "@/constants/stops";
import { isLoggedIn } from "@/scripts/authentication/authState";

// Only tools that exist today: the name already leads home, and planned stops have no page yet.
const tools = TOOLS_LINE.stops.filter((stop) => stop.status === "open" && stop.id !== "home");
</script>

<template>
  <footer class="foot">
    <div class="foot__inner">
      <div class="foot__board">
        <RouterLink to="/" class="foot__name">{{ SITE_NAME }}</RouterLink>
        <!-- The address shows as text too: mailto does nothing without a mail app, and a Matrix ID can be pasted into any client. -->
        <address class="foot__contact">
          <span class="foot__reach">
            <span class="foot__label">E-mail</span>
            <a :href="CONTACT_MAILTO">{{ CONTACT_EMAIL }}</a>
          </span>
          <span class="foot__reach">
            <span class="foot__label">Matrix</span>
            <a :href="MATRIX_URL" target="_blank" rel="noopener"
              >{{ MATRIX_ID }}<span class="visually-hidden"> (opens in a new tab)</span></a
            >
          </span>
        </address>
      </div>
      <nav class="foot__links" aria-label="Footer">
        <div class="foot__group">
          <RouterLink v-for="stop in tools" :key="stop.id" :to="stop.to">{{
            stop.label
          }}</RouterLink>
        </div>
        <div class="foot__group">
          <RouterLink v-if="isLoggedIn" to="/account">Account</RouterLink>
          <template v-else>
            <RouterLink to="/login">Log in</RouterLink>
            <RouterLink to="/register">Register</RouterLink>
          </template>
        </div>
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

/* Each label stays with its address, so a narrow footer wraps between the two, never inside one */
.foot__contact {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2) var(--sp-5);
  margin-top: var(--sp-3);
  font-size: var(--fs-sm);
  font-style: normal;
}

.foot__reach {
  display: inline-flex;
  align-items: baseline;
  gap: var(--sp-2);
  white-space: nowrap;
}

/* Too narrow for one row: the two stack, with the addresses lined up after their labels */
@media (max-width: 26rem) {
  .foot__contact {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: baseline;
    gap: var(--sp-2);
  }

  .foot__reach {
    display: contents;
  }

  .foot__contact a {
    justify-self: start;
  }
}

.foot__label {
  opacity: 0.8;
}

/* Tools and account links are two groups, so a narrow footer wraps between them, never inside a group */
.foot__links,
.foot__group {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-5);
}

.foot__contact a,
.foot__links a {
  color: inherit;
  font-weight: 500;
  text-underline-offset: 0.25em;
}

.foot__contact a:hover,
.foot__links a:hover {
  color: var(--c-line-on-deep);
}
</style>
