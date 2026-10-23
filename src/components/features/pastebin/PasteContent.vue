<script setup lang="ts">
import { computed } from "vue";
import { highlightCode } from "@/scripts/pastebin/highlight";
import { renderMarkdown } from "@/scripts/pastebin/markdown";

/** A paste's text: highlighted code (optionally numbered), or Markdown rendered as a page. */
const props = defineProps<{
  content: string;
  language: string;
  rendered?: boolean;
  numbered?: boolean;
}>();

// Both escape the paste's own text, so they're safe for v-html (see highlight.ts and markdown.ts).
const html = computed(() =>
  props.rendered ? renderMarkdown(props.content) : highlightCode(props.content, props.language)
);
const lineNumbers = computed(() =>
  Array.from({ length: props.content.split("\n").length }, (_, i) => i + 1).join("\n")
);
</script>

<template>
  <article v-if="rendered" class="prose" aria-label="Paste content" v-html="html" />

  <div v-else class="sheet" :class="{ 'sheet--numbered': numbered }">
    <pre v-if="numbered" class="sheet__gutter" aria-hidden="true">{{ lineNumbers }}</pre>
    <pre
      class="sheet__content"
      tabindex="0"
      aria-label="Paste content"
    ><code class="hljs" :data-language="language" v-html="html" /></pre>
  </div>
</template>

<style scoped>
/* One scroll box for gutter and text, so numbers stay level with their lines. */
.sheet {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  max-height: 70vh;
  overflow: auto;
  border: var(--edge) solid var(--c-edge);
  border-radius: var(--radius-sm);
  background: var(--c-panel-sunk);
}

.sheet--numbered {
  grid-template-columns: auto minmax(0, 1fr);
}

.sheet__gutter,
.sheet__content {
  margin: 0;
  padding: var(--sp-4);
  font-family: var(--font-code);
  font-size: 0.95rem;
  line-height: 1.6;
}

.sheet__gutter {
  position: sticky;
  left: 0;
  padding-right: var(--sp-3);
  border-right: var(--edge) solid var(--c-hairline);
  background: var(--c-panel-sunk);
  color: var(--c-ink-soft);
  text-align: right;
  user-select: none;
}

.sheet__content {
  color: var(--c-ink);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.sheet--numbered .sheet__content {
  width: max-content;
  min-width: 100%;
  white-space: pre;
  overflow-wrap: normal;
}

.sheet__content:focus-visible {
  outline: 3px solid var(--c-line);
  outline-offset: -3px;
}

/* Rendered Markdown: a page of the author's own, on enamel inside the board. */
.prose {
  padding: var(--sp-5);
  border: var(--edge) solid var(--c-edge);
  border-radius: var(--radius-sm);
  background: var(--c-panel);
  color: var(--c-ink);
  overflow-wrap: anywhere;
}

@media (min-width: 40rem) {
  .prose {
    padding: var(--sp-5) var(--sp-6);
  }
}

.prose :deep(> :first-child) {
  margin-top: 0;
}

.prose :deep(> :last-child) {
  margin-bottom: 0;
}

.prose :deep(:is(p, ul, ol, blockquote, pre, table, hr, img)) {
  margin: 0 0 var(--sp-4);
}

.prose :deep(:is(p, li, blockquote)) {
  max-width: 70ch;
  text-wrap: pretty;
}

/* The author's headings, in the board face but in their own case: it's their text, not signage. */
.prose :deep(:is(h1, h2, h3, h4, h5, h6)) {
  margin: var(--sp-6) 0 var(--sp-3);
  font-family: var(--font-board);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: 0.005em;
  text-transform: none;
  text-wrap: balance;
}

.prose :deep(h1) {
  font-size: var(--fs-lg);
}

.prose :deep(h2) {
  font-size: var(--fs-md);
}

.prose :deep(:is(h3, h4, h5, h6)) {
  font-size: var(--fs-base);
}

.prose :deep(a) {
  color: var(--c-action);
  font-weight: 600;
  text-decoration-color: var(--c-line);
  text-decoration-thickness: 2px;
  text-underline-offset: 0.18em;
}

.prose :deep(a:hover) {
  text-decoration-thickness: 3px;
}

.prose :deep(a:focus-visible) {
  outline: 3px solid var(--c-line);
  outline-offset: 3px;
}

/* Bullets are stops: small route-green rings. */
.prose :deep(ul) {
  padding-left: var(--sp-5);
  list-style: none;
}

.prose :deep(ul > li) {
  position: relative;
}

.prose :deep(ul > li::before) {
  content: "";
  position: absolute;
  left: calc(-1 * var(--sp-5) + 0.15rem);
  top: 0.5em;
  width: 0.6rem;
  height: 0.6rem;
  border: 2px solid var(--c-line);
  border-radius: 50%;
}

.prose :deep(ol) {
  padding-left: var(--sp-5);
}

.prose :deep(ol > li::marker) {
  font-family: var(--font-board);
  font-weight: 700;
  color: var(--c-ink-soft);
  font-variant-numeric: tabular-nums;
}

.prose :deep(li + li),
.prose :deep(li > :is(ul, ol)) {
  margin-top: var(--sp-1);
}

.prose :deep(li > :is(ul, ol)) {
  margin-bottom: 0;
}

/* A quote is a stretch of line leaving a stop. */
.prose :deep(blockquote) {
  position: relative;
  padding-left: var(--sp-5);
  color: var(--c-ink-soft);
}

.prose :deep(blockquote::before) {
  content: "";
  position: absolute;
  left: 0.3rem;
  top: 0.7rem;
  bottom: 0.2rem;
  width: 3px;
  border-radius: 999px;
  background: var(--c-line);
}

.prose :deep(blockquote::after) {
  content: "";
  position: absolute;
  left: 0;
  top: 0.15rem;
  width: 0.55rem;
  height: 0.55rem;
  border: 3px solid var(--c-line);
  border-radius: 50%;
  background: var(--c-panel);
}

.prose :deep(blockquote > :last-child) {
  margin-bottom: 0;
}

.prose :deep(hr) {
  height: 3px;
  border: 0;
  border-radius: 999px;
  background: var(--c-line);
}

.prose :deep(:not(pre) > code) {
  padding: 0.1em 0.35em;
  border: 1px solid var(--c-hairline);
  border-radius: var(--radius-sm);
  background: var(--c-panel-sunk);
  font-family: var(--font-code);
  font-size: 0.88em;
}

.prose :deep(pre) {
  padding: var(--sp-4);
  overflow-x: auto;
  border: var(--edge) solid var(--c-hairline);
  border-radius: var(--radius-sm);
  background: var(--c-panel-sunk);
  font-family: var(--font-code);
  font-size: 0.95rem;
  line-height: 1.6;
}

/* Wide tables scroll on their own instead of pushing the page sideways. */
.prose :deep(table) {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}

.prose :deep(:is(th, td)) {
  padding: var(--sp-2) var(--sp-4) var(--sp-2) 0;
  border-bottom: var(--edge) solid var(--c-hairline);
  text-align: left;
  vertical-align: top;
}

.prose :deep(th) {
  border-bottom-color: var(--c-edge);
  font-family: var(--font-board);
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.prose :deep(img) {
  display: block;
  max-width: 100%;
  height: auto;
  border: var(--edge) solid var(--c-edge);
  border-radius: var(--radius-sm);
}

/* The browser gives <code> its own monospace; keep the sheet's face and size. */
.sheet__content code,
.prose :deep(pre code) {
  font: inherit;
}

/* Syntax colours, one line colour per kind of token (tokens.css). */
.sheet :deep(.hljs),
.prose :deep(pre code) {
  color: var(--c-ink);
}

:is(.sheet, .prose) :deep(:is(.hljs-keyword, .hljs-selector-tag, .hljs-doctag, .hljs-name)) {
  color: var(--c-syn-keyword);
  font-weight: 650;
}

:is(.sheet, .prose) :deep(:is(.hljs-string, .hljs-regexp, .hljs-symbol, .hljs-link, .hljs-char)) {
  color: var(--c-syn-string);
}

:is(.sheet, .prose)
  :deep(:is(.hljs-number, .hljs-literal, .hljs-bullet, .hljs-variable.constant_)) {
  color: var(--c-syn-number);
}

:is(.sheet, .prose) :deep(:is(.hljs-title, .hljs-section)) {
  color: var(--c-syn-title);
  font-weight: 600;
}

:is(.sheet, .prose)
  :deep(
    :is(
      .hljs-type,
      .hljs-built_in,
      .hljs-selector-class,
      .hljs-selector-id,
      .hljs-variable.language_
    )
  ) {
  color: var(--c-syn-type);
}

:is(.sheet, .prose)
  :deep(:is(.hljs-attr, .hljs-attribute, .hljs-property, .hljs-selector-pseudo, .hljs-meta)) {
  color: var(--c-syn-attr);
}

:is(.sheet, .prose) :deep(:is(.hljs-comment, .hljs-quote)) {
  color: var(--c-syn-comment);
  font-style: italic;
}

:is(.sheet, .prose) :deep(.hljs-emphasis) {
  font-style: italic;
}

:is(.sheet, .prose) :deep(.hljs-strong) {
  font-weight: 700;
}

:is(.sheet, .prose) :deep(.hljs-addition) {
  background: var(--c-ok-wash);
  color: var(--c-syn-keyword);
}

:is(.sheet, .prose) :deep(.hljs-deletion) {
  background: var(--c-danger-wash);
  color: var(--c-danger);
}
</style>
