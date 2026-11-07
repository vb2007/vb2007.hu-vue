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
        <!--
          Each link is named "Label: address". A wide footer shows the address too, since mailto does
          nothing without a mail app and a Matrix ID can be pasted into any client; a narrower one
          shows only the label, so the line takes no more room than the name.
        -->
        <address class="foot__contact">
          <a :href="CONTACT_MAILTO" class="foot__reach">
            <span class="foot__label">E-mail<span class="foot__colon">:</span></span>
            <span class="foot__address">{{ CONTACT_EMAIL }}</span>
          </a>
          <a :href="MATRIX_URL" class="foot__reach" target="_blank" rel="noopener">
            <span class="foot__label">Matrix<span class="foot__colon">:</span></span>
            <span class="foot__address">{{ MATRIX_ID }}</span>
            <span class="visually-hidden">(opens in a new tab)</span>
          </a>
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
  container: foot / inline-size;
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
  /* The links share the contact line's baseline, not the middle of the name and the line */
  align-items: end;
  align-items: last baseline;
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

/*
  One row under the name. Each link's line is 1.5rem tall, so it is a 24px target, and the line sits
  close enough to the name that the band is no taller than the name and one line of text.
*/
.foot__contact {
  display: flex;
  flex-wrap: wrap;
  column-gap: var(--sp-5);
  margin-top: var(--sp-1);
  font-size: var(--fs-sm);
  font-style: normal;
  line-height: 1.5rem;
}

.foot__reach {
  position: relative;
  display: inline-flex;
  align-items: baseline;
  gap: var(--sp-2);
  white-space: nowrap;
  text-decoration: none;
}

/* A wider hit area to the sides only: the name sits just above */
.foot__reach::after {
  content: "";
  position: absolute;
  inset: 0 calc(-1 * var(--sp-2));
}

/* With the address shown, the label is its quiet caption and the address is what's underlined */
.foot__label {
  opacity: 0.8;
}

/*
  Heard, not seen: it makes the name "E-mail: address". It stays inline and in the text, since a
  positioned (visually-hidden) colon would be split off with a space ("E-mail : address").
*/
.foot__colon {
  font-size: 0;
  line-height: 0;
}

.foot__address {
  text-decoration: underline;
  text-decoration-thickness: 0.09em;
}

.foot__reach:hover .foot__address {
  text-decoration-thickness: 0.16em;
}

/* Too narrow for the addresses beside the links: the label is the link, the address only in its name */
@container foot (width < 54rem) {
  .foot__label {
    opacity: 1;
    text-decoration: underline;
    text-decoration-thickness: 0.09em;
  }

  .foot__reach:hover .foot__label {
    text-decoration-thickness: 0.16em;
  }

  .foot__address {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    border: 0;
  }
}

/* Tools and account links are two groups, so a narrow footer wraps between them, never inside a group */
.foot__links,
.foot__group {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-5);
}

.foot__reach,
.foot__links a {
  color: inherit;
  font-weight: 500;
  text-underline-offset: 0.25em;
}

.foot__reach:hover,
.foot__links a:hover {
  color: var(--c-line-on-deep);
}
</style>
