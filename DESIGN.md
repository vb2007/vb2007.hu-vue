---
name: vb2007.hu
description: A personal tools hub drawn as a metro line diagram. Open stops work today, dashed stops are planned.
colors:
  field: "oklch(0.915 0.075 138)"
  field-deep: "oklch(0.855 0.105 140)"
  panel: "oklch(0.988 0.012 130)"
  panel-sunk: "oklch(0.955 0.03 134)"
  ink: "oklch(0.24 0.045 152)"
  ink-soft: "oklch(0.38 0.05 152)"
  hairline: "oklch(0.24 0.045 152 / 0.2)"
  line: "oklch(0.6 0.16 148)"
  action: "oklch(0.45 0.115 152)"
  action-deep: "oklch(0.33 0.09 152)"
  on-action: "oklch(0.99 0.01 130)"
  deep: "oklch(0.24 0.045 152)"
  on-deep: "oklch(0.97 0.02 135)"
  works-amber: "oklch(0.84 0.15 88)"
  on-works: "oklch(0.25 0.05 88)"
  danger: "oklch(0.5 0.18 27)"
  danger-wash: "oklch(0.95 0.035 27)"
  ok-wash: "oklch(0.94 0.06 140)"
  syn-string: "oklch(0.48 0.13 38)"
  syn-number: "oklch(0.47 0.13 255)"
  syn-title: "oklch(0.46 0.15 330)"
  syn-type: "oklch(0.47 0.09 205)"
  syn-attr: "oklch(0.49 0.1 75)"
typography:
  display:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "clamp(3rem, 1.5rem + 7vw, 6rem)"
    fontWeight: 700
    lineHeight: 0.92
  headline:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 1.6rem + 3.6vw, 4.25rem)"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "0.005em"
  title:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.1
  body:
    fontFamily: "Barlow, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    letterSpacing: "0.04em"
  code:
    fontFamily: "JetBrains Mono Variable, ui-monospace, Menlo, monospace"
    fontSize: "0.95rem"
    fontWeight: 500
rounded:
  sm: "0.5rem"
  md: "0.875rem"
  lg: "1.25rem"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.5rem"
  "6": "2rem"
  "7": "3rem"
  "8": "4.5rem"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.on-action}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 1.5rem"
    height: "2.875rem"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 1.5rem"
    height: "2.875rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
  input:
    backgroundColor: "{colors.panel-sunk}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 1rem"
    height: "2.875rem"
  station-board:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "1.5rem"
  navbar:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    height: "4.25rem"
  footer:
    backgroundColor: "{colors.deep}"
    textColor: "{colors.on-deep}"
  ticket-slip:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "1.5rem"
  ticket-slip-compact:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.5rem 0.5rem 1rem"
  segment-key:
    backgroundColor: "{colors.panel-sunk}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.sm}"
    padding: "0 0.75rem"
    height: "2.625rem"
  segment-key-chosen:
    backgroundColor: "{colors.action}"
    textColor: "{colors.on-action}"
  select:
    backgroundColor: "{colors.panel-sunk}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 2.5rem 0 1rem"
    height: "2.875rem"
  drop-target:
    backgroundColor: "{colors.panel-sunk}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "2rem 1.5rem"
  badge-private:
    backgroundColor: "{colors.panel-sunk}"
    textColor: "{colors.ink-soft}"
    padding: "0.125rem 0.5rem"
  badge-public:
    backgroundColor: "{colors.ok-wash}"
    textColor: "{colors.action}"
    padding: "0.125rem 0.5rem"
---

# Design System: vb2007.hu

## Overview

**Creative North Star: "The Route Board"**

The site is a metro line diagram. A light green field is the ground; white enamel sign panels carry content in dark green ink behind a 2px edge; one mid-green route line ties the pieces together. Tools that exist are solid stops on the line, tools that are coming are dashed stops with an amber hatch. The mood is civic, legible, tactile and cheerful, like station wayfinding rather than a developer dashboard.

Density is moderate: a 78rem page, generous 3rem section gaps, large condensed uppercase headings, and body copy at 17px. Depth comes from physical metaphors (enamel thickness, pressable keys), not from blur or glow. Rejected by the direction: the dark-terminal homelab dashboard and the rounded-card SaaS page.

All tokens are declared once with CSS `light-dark()`; the `light-theme` / `dark-theme` class on `<html>` only switches `color-scheme`. Dark theme keeps the same hue family (about 152) with a deep green field and the same panel-on-field relationship.

**Key Characteristics:**
- Green-tinted everything: every neutral carries hue 130-152, there is no gray.
- Condensed uppercase station-board headings against humanist Barlow body.
- Hard-offset, pressable buttons; 2px ink edges on panels and fields.
- Solid line = open, dashed line + amber hatch = planned.
- Reduced-motion collapses all animation and transition durations.
- Icons are stroked 24px line glyphs; brand marks (GitHub) are the one filled exception, drawn on their own grid.

## Colors

A restrained-plus palette: a light green field dominates, white-green panels sit on it, and a single mid-green line plus a deep green action colour do all the accenting. Amber appears only as the "works in progress" hatch.

### Primary
- **Route Green** (`line`): the line itself. Strip connectors, stop-marker rings, focus outlines, link underlines in tickets, the navbar underline bar, footer-less route accents. Never used as text on the field (contrast), only as stroke.
- **Signal Forest** (`action`): action and link colour. Primary button fill, board header, current-stop fill, text links, success text, selection. Deeper variant `action-deep` is the button's hard-offset underside.

### Secondary
- **Works Amber** (`works-amber` with `on-works` ink): paired amber and dark-amber diagonal hatch, used only for the kerb stripe under board headers and planned-stop signalling.

### Syntax
Code in a paste is coloured like the lines on a metro map: each kind of token rides its own line colour, restrained like signage ink. Every syntax colour keeps at least 5:1 on Enamel White and Sunk Enamel in both themes (`--c-syn-*` in `src/styles/tokens.css`).
- **Keywords** take Signal Forest at weight 650; **comments** take Soft Ink in italic.
- **String Clay** (`syn-string`): strings, regexes, links.
- **Number Blue** (`syn-number`): numbers and literals.
- **Title Plum** (`syn-title`, weight 600): function, class and section names.
- **Type Teal** (`syn-type`): types, built-ins, `this`/`self`.
- **Attribute Ochre** (`syn-attr`): attributes, properties, meta (decorators, preprocessor). A dark text ochre, never the amber hatch.
- Diffs: added lines in Signal Forest on Confirm Wash, removed lines in Fault Red on its wash.

### Neutral
- **Meadow Field** (`field`): page background and ticket-slip fill. Dominant surface.
- **Deep Meadow** (`field-deep`): hover wash on ghost buttons and strip stops, and the enamel-thickness underside of panels.
- **Enamel White** (`panel`): sign panels, navbar, secondary buttons, focused inputs.
- **Sunk Enamel** (`panel-sunk`): input fill, disabled buttons, info messages.
- **Board Ink** (`ink`): body text, panel edges (the 2px `edge`), the footer band in light theme.
- **Soft Ink** (`ink-soft`): hints, placeholders, planned-stop labels and dashes.
- **Hairline** (`hairline`, ink at 20%): row dividers inside boards, the empty rail of progress tracks and meters, the edge of disabled buttons.
- **Terminal Band** (`deep` / `on-deep`): footer, deep green in both themes, with the line recoloured bright green on it.
- **Fault Red** (`danger`, `danger-wash`) and **Confirm Wash** (`ok-wash`): error and success message tints only.

Dark-theme counterparts live in `src/styles/tokens.css` and the sidecar; frontmatter records the light values.

### Named Rules
**The One Line Rule.** There is one route colour. It is a stroke (lines, rings, focus), not a fill for large areas; large fills belong to the field or panel.
**The Green Neutral Rule.** Neutrals are tinted toward hue 130-152. Pure white, black and gray are not used.
**The Hatch Means Planned Rule.** The amber diagonal hatch and dashed strokes mean "not built yet" or "work in progress", and nothing else.
**The Route Measure Rule.** Anything that measures (upload progress, storage, a share of a total) is a stretch of line: a hairline rail, a route-green run along it, stop rings at the ends. Fault Red marks a failed run or a full terminus; Soft Ink a cancelled one.
**The Line Colours Rule.** Syntax colours are metro line colours, one per kind of token, kept at 5:1 or more on enamel and sunk enamel in both themes. They colour code only, never UI.

## Typography

**Display / Headline / Label Font:** Barlow Condensed (600, 700) with Barlow, system-ui
**Body Font:** Barlow (400, 500, 600) with system-ui
**Code Font:** JetBrains Mono Variable, for URLs and the mono input variant

**Character:** Condensed uppercase signage over a friendly humanist text face; the mono is reserved for literal strings the user will copy.

### Hierarchy
- **Display** (700, `clamp(3rem, 1.5rem + 7vw, 6rem)`, 0.92): the home hero title only.
- **Headline** (700, `clamp(2.5rem, 1.6rem + 3.6vw, 4.25rem)`, 1.02, uppercase): h1 on inner pages.
- **Title** (700, 1.75rem, 1.02-1.1, uppercase): h2, board titles, footer name. h3 is 1.25rem, not uppercase.
- **Body** (400, 1.0625rem, 1.55): copy, capped at 62ch with balanced/pretty wrapping.
- **Label** (700, 1.25rem condensed, 0.04em, uppercase): buttons. Strip stops are 1.125rem at 600/700; field labels are Barlow 600 at 0.875rem.
- **Code** (500, about 0.9-1.06rem): short links and mono inputs.

### Named Rules
**The Board Voice Rule.** Condensed uppercase is for headings, buttons and route labels. Running text and form labels stay in Barlow sentence case.

## Layout

Single column, centred, max width 78rem (`--page-max`) with a fluid gutter `clamp(1rem, 4vw, 2.5rem)`. Narrow form pages cap at 34rem (Register keeps its confirmation code step on the same board); reading pages such as a single paste cap at 60rem (`medium`); there the meta line sits left with the view controls (language select for the owner, Rendered / Source for Markdown, Line numbers) right, wrapping under it when narrow. Page sections start 3rem from the navbar. Spacing is a 4px-based rem scale (0.25 to 4.5rem, steps 1-8); gaps inside panels are 1.5rem (2rem from 40rem up). The home hero is one column, then two columns (1.05fr / 1fr, headline left, Shorten board right) from 62rem. The logged-in Pastebin is a wide two-column workspace from 62rem (composer left and sticky, list right); logged out it is a single narrow board. The logged-in Upload page follows the same workspace from 62rem (columns 1fr / 1.35fr, 2rem gap): the Upload board with the Storage board under it on the left, sticky below the navbar, and the "Your uploads" board on the right; below 62rem everything is one column, and logged out it is a narrow gate board. Rows inside the uploads board lay out by container query on the board (one line from 36rem of board width), not by viewport. The superuser's Admin page is one wide board ("Upload quotas") holding the account list; visitors and other users get a narrow gate board instead. An account's uploads open from its row ("Browse uploads") on a medium-width page: a ghost "All users" key above the same uploads board used on the Upload page, titled with the account's name ("anna's uploads"), with the same rows and details; who can open a private file reads "Only <name> and the admin". Its rows also lay out by container query: name and tags over the meter until 40rem of board width, then name, tags and meter on one line. On the admin page no route stop is current, so the navbar's Admin key (ghost, superuser only) takes the Deep Meadow wash as "you are here". The Account page (`/account`) is one narrow board ("Your account", with Delete account last), with a narrow gate board for visitors. Resetting a password (`/reset-password`) is one narrow board ("Reset password") whose two steps replace each other in place. The navbar's e-mail is its link: Soft Ink with a hairline underline at rest that turns route green on hover, the Deep Meadow wash on the Account page (like the Admin key), and a 2.75rem tap row in the drawer. The navbar sticks at 4.25rem and collapses into a drawer below 75rem, where the horizontal strip turns vertical. The home tools directory puts each row on one line from 46rem. Footer sits 4.5rem below content.

## Elevation & Depth

Depth is material, not atmospheric. Panels get a hard 0.4rem underside in `field-deep` (enamel thickness) plus a soft, offset cast shadow and a faint inset top highlight. Buttons carry a hard 0.25rem (0.1875rem small) underside in `action-deep` that compresses on press. The navbar rests on a 0.3rem solid route-green bar. There are no blurs, glows or translucent glass.

### Shadow Vocabulary
- **Enamel panel** (`0 0.4rem 0 var(--c-field-deep), 0 1.25rem 2rem -1.25rem <green cast>`): station boards.
- **Key underside** (`0 0.25rem 0 var(--btn-depth)`, hover `+2px`, active `0`): buttons.
- **Line bar** (`0 0.3rem 0 var(--c-line)`): navbar and open drawer.
- **Focus halo** (`0 0 0 4px line at 45%`): focused inputs.

### Named Rules
**The Thickness Rule.** Raised means a hard offset in a solid colour. A blurred shadow alone never signals elevation; only the panel's soft cast accompanies the hard edge.

## Shapes

Softly squared signage: 0.5rem on controls and thumbnails, 0.875rem on tickets, drop targets and inline detail panels, 1.25rem on boards, circles for stops, full pills only for small status chips and badges. Every panel and field has a 2px solid ink edge (`--edge`). Planned things use dashed strokes. The ticket slip has semicircular perforation notches. Boards clip to their radius and end their header in a diagonal kerb hatch.

## Components

### Buttons
- **Shape:** 0.5rem radius, 2.875rem tall (2.25rem small), condensed uppercase 700 label, nowrap.
- **Primary:** Signal Forest fill, enamel text, hard Deep Forest underside.
- **Secondary:** enamel fill, ink text, 2px ink border and ink underside. **Ghost:** transparent, no underside, Deep Meadow wash on hover.
- **Hover / Active:** lifts 2px with a longer underside; active presses down by the underside height in 60ms. Ghost does not lift.
- **States:** disabled is sunk enamel with hairline edge; loading shows a spinning ring in the label; error turns danger red with a 360ms shake.

### Inputs / Fields
Sunk-enamel fill, 2px ink border, 0.5rem radius, 2.875rem tall; Barlow 600 label above at 0.875rem, hint and error in 0.875rem. Hover and focus lift the fill to enamel; focus turns the border Signal Forest and adds the 4px line halo. Invalid state turns the border red with a bold red message. A mono variant is used for URL fields and the e-mailed confirmation code.

### Segmented Control
Joined keys for a one-of-few choice (a radio group). One sunk-enamel strip with a 2px ink edge and a 0.1875rem hard ink underside; keys are separated by 2px ink rules, labels in condensed uppercase 700 (1.125rem, 1.0625rem small) in Soft Ink, with an optional icon. Hover lifts a key to enamel and ink. The chosen key is Signal Forest with enamel text, like the current stop. Focus is the standard route-green outline. Legend above in Barlow 600 at 0.875rem.

### Select
A sunk field like the text input: sunk-enamel fill, 2px ink border, 0.5rem radius, 2.875rem tall (2.375rem small), native appearance removed and a chevron glyph on the right. Hover and focus behave like inputs (enamel fill; focus adds Signal Forest border and the 4px line halo).

### Drop Target
A sunk-enamel panel (0.875rem radius, 2px ink edge, centred content) holding a stop: a 3.5rem route-green ring (5px) on enamel with the upload glyph in Signal Forest, a condensed uppercase title, a secondary "Choose files" key and a soft-ink hint. On drag-over the panel lifts to enamel with a Signal Forest border and the 4px line halo, and the ring fills Signal Forest, scales 1.12 and rises 0.25rem.

### Route Track (upload progress)
Each file's journey as a stretch of line: a departure ring, a 4px hairline rail, an arrival ring (0.875rem, 3px route green). The route-green run is full width and slides in by `transform` only. While uploading, a Signal Forest head rides the end of the run; waiting, finished and stopped tracks have no head. Done fills both rings Signal Forest; failed turns the run and arrival ring Fault Red; cancelled turns run and rings Soft Ink. A rejected file gets no track, only its red message.

### Upload Ticket
A finished upload in the queue gets a compact ticket slip: Meadow Field fill, 2px dashed ink border, 0.875rem radius, the one-line Upload Link and a primary "Copy link" key. It prints in with the same 720ms clip-path reveal as the full ticket.

### Upload Link
A link on one line in the code face (500, 0.875rem). Shown without the protocol. The host and folders shrink first with an ellipsis (never below 4ch); the file part never shrinks, and a file name over 12 characters is shortened in the middle to its first and last four, as `6712…a3f1.png`. The full URL is the tooltip.

### Storage Gauge
The quota as a stretch of line: a filled Signal Forest departure ring, a 5px hairline rail, a route-green run true to scale (at least 0.25rem once anything is used), a "here" ring (Signal Forest, 4px) at the run's end, and a larger terminus ring at the quota that turns Fault Red when full. The used figure sits above in condensed 700 with tabular numbers; percentage and space left sit below in soft ink. The run travels in and the here ring arrives over 640ms.

### Per-type Split
Under the gauge, one row per file type on hairline dividers: Signal Forest category icon, name, file count and size, then a 3px hairline rail with a route-green run for that type's share, ending in a small stop ring. Empty types go Soft Ink and show no run.

### Upload Row
A row on a hairline divider: a 3.25rem thumbnail (image, or the category icon in Signal Forest on sunk enamel, 0.5rem radius, 2px edge), a name button with a chevron and the date below, a visibility badge, then Copy link (secondary) and Open (ghost). The badge is a 2px pill in condensed uppercase with a lock or globe icon: Private on sunk enamel in Soft Ink, Public on Confirm Wash in Signal Forest. The name button opens the row's own details panel in place (Own Details Rule): a sunk-enamel panel, 0.875rem radius, with a preview (image, video, audio, or a large icon), a facts list, and one action line (Rename, Make public/private, Delete) with Delete pushed to the far end. Delete arms first, turning solid red as "Confirm delete".

### Account Row (admin)
The Upload Row's sibling for the admin list: a name button with a chevron, file count and join date below in soft ink, tags, and a compact quota meter. Tags reuse the badge pill: Admin on Confirm Wash in Signal Forest, Custom quota on sunk enamel in Soft Ink. The meter follows the Route Measure Rule: used-of-quota figure above (used in ink 700), a 3px hairline rail, a route-green run ending in a small ring (true to scale, but at least 0.25rem once anything is used, and stopping short of the terminus so the two rings never merge), and a soft-ink terminus ring at the quota; at or over the quota (or a quota of 0) the run reaches the terminus and both turn Fault Red. The figures stay in ink: the line carries the warning. The name opens the row's own details panel (Own Details Rule): facts (e-mail, used with exact bytes, quota and whether it's the default, how far over), a secondary "Browse uploads" key under them, and the quota editor: an amount field with an MB/GB/TB select, Save quota (primary) and Use default (secondary, disabled while on the default). Save quota stays disabled until the amount changes. A quota below current use gets a field hint (announced with the field) that nothing is deleted.

### Station Board (signature)
White enamel panel, 1.25rem radius, 2px edge, enamel-thickness shadow. Header is a Signal Forest bar with title in condensed uppercase and the amber kerb hatch along its bottom. Body padding 1.5rem, 2rem from 40rem. Hosts tool UI (Shorten, Pastebin, Upload) and auth forms.

### Route Strip and Stop Marker (signature, navigation)
The navbar is a horizontal strip of stops joined by connectors. Open stops: ring in route green, solid 5px connector, link text. Planned stops: dashed soft-ink ring and connector, soft-ink non-link label. Current page: filled Signal Forest marker scaled 1.2 with a pulsing outer ring, bold label. Hover scales marker 1.25 and washes the stop. Below 75rem the strip turns vertical in a drawer that wipes open via clip-path.

### Tools Directory (home)
The home page's list of destinations, one enamel board with a row per stop from `stops.ts` (Home excluded). Each row carries everything about its stop: marker, condensed uppercase name, one-line description, and for open stops a Signal Forest arrow key with a hard underside. The whole open row is the link; hover washes it Sunk Enamel, scales the marker and slides the arrow. Planned rows are not links: soft-ink name and the amber-hatched "Planned" chip. Rows stack name over description on phones and sit on one line from 46rem. Rows draw in left to right, staggered.

**The Own Details Rule.** A destination's description and way in live in its own row. Never show details in a shared panel driven by hover: pointing at one thing must not change another.

### Ticket Slip
Result of a shortened link or a new paste: Meadow Field fill, 2px dashed ink border, perforation notches, mono link (shown without the protocol for pastes, copied in full), actions row below. It "prints" in with a 720ms clip-path reveal.

### Code Sheet (paste content)
A paste's text on Sunk Enamel inside a 2px ink edge, 0.5rem radius, at most 70vh tall with its own scroll. Code face at 0.95rem / 1.6, highlighted in the syntax colours. Multi-line pastes get a line-number gutter (Soft Ink, right-aligned, sticky on horizontal scroll, hairline rule) and stop wrapping; single lines wrap. The gutter is `aria-hidden`, so copying and screen readers get the text alone.

### Markdown Page
A Markdown paste renders as a page of its own: Enamel White inside a 2px ink edge, 0.5rem radius, 1.5rem padding (1.5rem / 2rem from 40rem), text capped at 70ch. The author's headings use Barlow Condensed 700 in their own case, never forced uppercase (it's their text, not signage): h1 1.75rem, h2 1.25rem, the rest 1.0625rem. Links are Signal Forest 600 with a 2px route-green underline. Bullets are stops (small route-green rings); ordered numbers are condensed Soft Ink. A quote is a stretch of line leaving a stop: a 3px route-green line under a ring, text in Soft Ink. A rule is a 3px route-green line. Inline code is a small Sunk Enamel chip with a hairline edge; fenced code sits on Sunk Enamel with a 2px hairline edge, highlighted. Tables scroll on their own, rows on hairlines under a condensed header on an ink rule. Images fit the width with the 2px ink edge. Raw HTML in a paste stays text; links open in a new tab with `nofollow noopener noreferrer`, images load lazily without a referrer. Route lines here, like the meters' rails, end in round caps (`999px`).

### Paste Language
The composer has a Language select under the text: its first option reads "Auto" (empty) or "Auto: Python", following the detection as the user pastes or types; any other pick sticks until the paste is created. On the paste page the language is named in the meta line in ink ("Added … · Python · 13 lines · 394 characters"), and the list rows carry it too. A Markdown paste gets a small Rendered / Source segmented control, and Line numbers only shows for source. The paste's owner (or the admin) gets a small Language select in the toolbar that saves on change, shows the pick while saving, falls back with a red Status Message if it fails, and announces "Language changed to …".

### GitHub Login
Under the password form on Log in and Register: an "or" rule (condensed uppercase Soft Ink "or" between two 2px hairlines, full board width), then a full-width secondary key with the filled GitHub mark ("Log in with GitHub", "Register with GitHub"). It's a link to the API, not a form button. A failed GitHub login arrives as `?oauthError=`: its message is the first thing in the board, as an error Status Message, and the code is dropped from the URL.

### Register Form
A problem with one field shows under that field as its own error (red border and bold red message, announced with the field) and focus moves there: the local checks, and the API's refusals of the address (taken, disposable, can't receive mail), the username (taken) or the password. Editing that field drops the error. Anything else (a mail or rate limit failure, an unreachable API) shows as an error Status Message above the Register key, which gets focus back. A failed submit shakes the key; "Already have a code? Enter it" without a valid address only shows the E-mail field's error.

### Register Code Step
Registering is two steps on the same "Register" board (vb2007/vb2007.hu-api#28). Once the form is sent, the board swaps the form, GitHub key and the lines under it for the code step: an info Status Message naming the address the code went to in ink 600 ("A 6-digit code is on its way to **anna@example.com**. Enter it to finish registering; it works for 15 minutes."), which the code field also points at for screen readers; the "Confirmation code" field in the mono variant (numeric keyboard, one-time-code autofill) with a Soft Ink hint about the spam folder; a code that isn't 6 digits or that the API refuses (wrong, expired or used) as the field's own error, as on the form, and other failures (limits, mail, network) as an error Status Message above the key, which flashes red either way; a full-width primary "Confirm code"; and under it a row with a small secondary "Resend code" key on the left and a small ghost "Change address" key on the right. The address moves to the next line whole when it fits there, and only a longer one breaks, before a dot or the @.

After each send the resend key is disabled and counts down in its label ("Resend in 42 s"), for a minute or as long as the API's `retryAfter` says, and focus moves to the code field. The countdown is kept for the address for the rest of the browser session, so after a reload "Enter it" for that address picks it up instead of offering a resend the API would refuse. A refused resend's message names no seconds (the label already counts them) and goes when the countdown ends; any error also goes once the user types a new code. The info message follows the code: "A new code is on its way to … The previous one no longer works." after a resend, and "A new code couldn't be mailed to …, and the one before no longer works. Send a new one below." when the new one couldn't be mailed.

There are two more ways in. Under the form, next to "Already registered? Log in", "Already have a code? Enter it" (a button set like the link) opens the step for the typed address without sending anything (without a valid address it only marks the E-mail field), e.g. after a reload: "Enter the code that was mailed to … It works for 15 minutes after sending, and keeps the username and password you registered with then." Registering the same address again within the minute opens it too, with the countdown the API gives: "Less than a minute ago, a code went to … It still works: enter it to finish registering, with the username and password you sent then."

Focus moves to the code field when the step opens and back to the e-mail field when "Change address" returns to the form, which keeps what was typed. A wrong code keeps focus in the code field. A name or address taken meanwhile also returns to the form, with the API's message under the username or e-mail field it's about, which takes focus. A confirmed code shows "Registration successful!" with a "Go to Shorten" key, and focus moves to that message (clear of the sticky navbar). If the account was created but the browser didn't keep the session cookie, the board instead shows an error Status Message ("Your account was created, but your browser didn't keep the session. Please check that cookies are enabled, then log in.") over a primary "Log in" key, focused the same way. Either way the form forgets what was typed, passwords included, and logging out (including from the navbar while on the page) brings back an empty form, never the finished code step.

### Password Reset
"Forgot password?" sits under the Log in password field as a small right-aligned link, before the submit key. It leads to the "Reset password" board, two steps on the same narrow board, each step's first field focused when it appears:
- **E-mail step:** one line of running text ("Enter your account's e-mail address to get a code for a new password."), the E-mail field, an error Status Message above the full-width primary "Send code" key, and two alt lines under the form: "Already have a code? Enter it" (a button drawn as a link, which opens the code step for the typed address without sending anything, e.g. after a reload) and "Remembered it? Log in" like Register's.
- **Code step:** the API's answer as an info Status Message first (it reads the same whether or not an account uses the address), then the address it went to as a fact (Soft Ink "E-mail" label over the address in ink 600, breaking anywhere rather than overflowing) with a small ghost "Change" key beside it (disabled while a code is being sent) that goes back to the e-mail step with the address kept, on a hairline divider. Then the Code field (mono, numeric keypad, one-time-code autofill, described by the message above and the hint "The 6-digit code from the e-mail. It works for 30 minutes."), New password with its "8 to 128 characters." hint, errors (a too short password, a wrong code, the mail limit) in one error Status Message above the full-width primary "Reset password" key. Under the form, Soft Ink "No code yet?" beside a small secondary key that reads "Send again in 1:00" and counts down (tabular numbers, disabled meanwhile) after each code, then "Send again". A resend changes the message to "If an account uses this address, a new code is on its way, unless one was sent in the last minute: then the one before still works." (the API answers the same either way), clears the Code field and puts the cursor back in it. The countdown belongs to its address and survives "Change" and a reload (kept in sessionStorage): sending to that address again before it ends returns to the code step without asking the API, saying "If an account uses this address, a code was sent to it in the last minute and still works." when there's no earlier message to show, and "Enter it" picks the countdown up too.
- **Done:** the user lands on Log in with the API's message as a success Status Message at the top of the form, once. A user logged in as another account stays logged in: the board shows the message, then "You're still logged in as <address>. Log out to log in with the new password." (address in ink 600) over a primary "Log out" key, which brings back the form with the message still on top.

### Account Board
"Your account" holds a facts list (Soft Ink Barlow 600 labels over ink values, on hairline dividers), then two sections, "Log-in details" and "Linked accounts", each a heading in condensed uppercase (1.25rem) over one row per item, on a hairline divider like the facts and the Upload Row. A row has a 3.25rem tile like the upload thumbnail (sunk enamel, 0.5rem radius, 2px edge) with its mark in Signal Forest (a lock for Password, an envelope for E-mail, the GitHub mark for GitHub). Next to it sit the name in condensed uppercase (1.125rem), with a status badge beside it on the GitHub row, a Soft Ink note, and a small key.

The Password row's note says changing it logs out other devices; its secondary "Change password" key opens a form in place under the note, stretched to the row's width, and hides while it's open. The form is a 1rem grid of three password fields (current, new with the hint "8 to 128 characters.", confirm) and a wrapping row of a primary "Save password" (reading "Saving" while it works) and a ghost "Cancel"; Escape cancels too, clearing the fields and returning focus to the key. Field problems show under their field on submit and focus the first one; the API's refusal shows as an error Status Message above the keys. On success the form closes and the API's message shows as a success Status Message under the note until the form opens again. An account without a password gets no key there, and a note pointing to the Password section below.

The E-mail row below it works the same way: its secondary "Change e-mail" key opens a New e-mail and a Current password field over a primary "Send code" and a ghost "Cancel", with the same field errors, API error message, Escape and focus handling. The address is trimmed and checked with the API's rule, and the current address is refused as a field error without asking the API. An account without a password gets no key there, only a note that changing it needs a password; the superuser gets none either, with a note that its address is set on the API. A confirmed address gets a "Confirmed" badge beside the row's name (the GitHub row's Linked pill); an unconfirmed one gets none, since older accounts were never asked to confirm, and it steps aside while a change waits, so it can't be read as being about the new address.

Sending the form doesn't change the address: the API mails a code to the new one. The form closes and the row shows, under the note and stretched to its width, an info Status Message "Waiting for confirmation:" with the new address in ink 600 (it moves to the next line whole, and only an address wider than the line breaks), then a code form: a mono "Confirmation code" field (numeric keypad, one-time-code autofill) with the hint "The code works for 15 minutes from when it was sent. Nothing yet? Check your spam folder, or get a new one with Change e-mail.", and a wrapping row of a primary "Confirm code" (reading "Confirming") and the secondary "Change e-mail" key. The field takes focus, and the waiting line describes it ahead of its hint, so a screen reader hears the address on arrival. The same state comes back on every load while the API has the change waiting. A code that isn't 6 digits (spaces are dropped) and a code the API refuses are both the field's own error, so the field is marked invalid and keeps the code and the focus; other failures (too many tries, no connection) show as an error Status Message above the keys. Once confirmed, the waiting line and code form go, the facts and the navbar show the new address, and the API's message shows as a success Status Message under the note, with focus on the key. A refusal that takes the waiting change away (the address got taken meanwhile, or the code expired with the page open) shows as an error Status Message in that same place instead, naming the address: "new@example.com wasn't confirmed." and the API's reason, or for an expired code "new@example.com wasn't confirmed: its code expired. Send a new one with Change e-mail."

There's no cancelling or resending on its own: a waiting change expires, and a new code is asked for with the form again. While a change waits, the form starts from its address with the hint "A new code replaces the one already sent." and focuses the password; Cancel or Escape goes back to the code. The API mails one code a minute per account, so after sending, and after a 429, the key is disabled as "Send code in 42 s", counting down to the API's `retryAfter`; the count is kept for the session, so a reload doesn't spend a try. The cooldown's 429 reads "A code was sent just now. You can send another once the countdown ends." and clears with the count; it also refreshes the account, so a code asked for elsewhere (another tab) shows its waiting line. A rate limiter's 429 has no wait to count, so the key waits a minute while the API's message stays. A confirmed or dropped change ends the count, since the API then takes a new address at once. When the mail can't be sent, the form keeps the API's error and the row shows the change the API stored anyway.

The GitHub note names a linked account by its GitHub login in ink 600 ("You can log in with GitHub as @octocat."); the login moves to the next line whole rather than breaking at a hyphen. While GitHub isn't linked the key is a primary "Link GitHub"; once it is, a secondary "Unlink GitHub" that arms first like an upload's Delete, turning solid red as "Confirm unlink". An account made with GitHub has no password, so it gets no key and the note says GitHub stays linked while it's the only way to log in (the Password row above already says there's no password). Such an account gets a "Password" section under the logins (same condensed heading): a Soft Ink note on why to set one, New password (hint "8 to 128 characters.") and Confirm password fields, and a primary "Set password" key, left-aligned. Length and match are checked on submit as field errors that clear once the field is edited and are checked again on the next submit; API errors show as an error Status Message above the key. When the API wants GitHub to confirm it's them first, that's an expected step, not a fault: its message shows as an info Status Message and the key becomes a primary "Confirm with GitHub" link (GitHub mark) to the relink, which takes focus; the password is never kept, so it's typed again on return. Once set, the section goes, focus moves to the success message at the top, the Password and E-mail rows offer their keys and the GitHub row offers Unlink. A success Status Message at the top of the board confirms a link (the API returns with `?github=linked`, dropped from the URL like `?oauthError=`; for an account without a password it reads as the GitHub confirmation instead), a password set, or an unlink; a failed unlink shows as an error there. The badge reuses the upload badge pill: Linked on Confirm Wash in Signal Forest with a check, Not linked on sunk enamel in Soft Ink with a cross.

The board ends with a "Delete account" heading (same style as "Linked accounts"), a Soft Ink note naming what goes with it (pastes, short links and uploads; it can't be undone) and a small secondary "Delete account" key with the trash glyph. The key opens the confirmation in place, as a sunk-enamel panel like an upload's details (0.875rem radius, 2px edge): the password field, or for an account made with GitHub a username field with the hint 'Type "name" to confirm.' (no autocapitalisation, matched exactly). Its "Delete account" key stays disabled until the password is typed or the username matches, then turns solid red like an armed Delete; a ghost Cancel (or Escape) closes the panel, forgets the input and returns focus to the key. A refusal shows as an error Status Message inside the panel, announced with the field, and brings focus back to the field if it had left the panel (a clicked key disables while it works), so Escape still cancels; a deleted account goes to the home page, logged out.

### Status Message
Tinted 2px-bordered strip with icon: success (Confirm Wash, forest text), error (Fault Red wash and text), info (sunk enamel, soft ink). Arrives with a short 280ms drop-in.

### Footer
Deep green band with a route line arriving from the left and ending in a terminus ring on the right edge, name in condensed uppercase, links in on-deep colour that brighten to bright route green on hover.

## Do's and Don'ts

### Do:
- **Do** put content on enamel panels over the green field, with a 2px ink edge and the hard thickness shadow.
- **Do** mark tools that do not exist yet with dashed strokes, soft-ink labels and the amber hatch; add a tool by appending a stop in `src/constants/stops.ts`.
- **Do** use condensed uppercase for headings, buttons and route labels, and Barlow sentence case for everything read in running text.
- **Do** write colour as tokens only; each is a single `light-dark()` declaration.
- **Do** keep focus visible: 3px route-green outline with 3px offset on everything focusable.
- **Do** honour reduced motion; animations here are decorative.
- **Do** draw progress and meters as route lines with stop rings (The Route Measure Rule).

### Don't:
- **Don't** build a dark-terminal homelab dashboard or a rounded-card SaaS page; both are rejected directions.
- **Don't** use gray or pure white/black; neutrals stay green-tinted.
- **Don't** use blur, glow or glass for elevation; depth is a hard offset in a solid colour.
- **Don't** use route green as text colour on the field; text is ink or Signal Forest.
- **Don't** use the amber hatch for anything but planned/in-progress.
- **Don't** draw progress or meters as filled capsule bars; they are route lines with stop rings.
