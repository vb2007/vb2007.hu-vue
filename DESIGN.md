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

## Colors

A restrained-plus palette: a light green field dominates, white-green panels sit on it, and a single mid-green line plus a deep green action colour do all the accenting. Amber appears only as the "works in progress" hatch.

### Primary
- **Route Green** (`line`): the line itself. Strip connectors, stop-marker rings, focus outlines, link underlines in tickets, the navbar underline bar, footer-less route accents. Never used as text on the field (contrast), only as stroke.
- **Signal Forest** (`action`): action and link colour. Primary button fill, board header, current-stop fill, text links, success text, selection. Deeper variant `action-deep` is the button's hard-offset underside.

### Secondary
- **Works Amber** (`works-amber` with `on-works` ink): paired amber and dark-amber diagonal hatch, used only for the kerb stripe under board headers and planned-stop signalling.

### Neutral
- **Meadow Field** (`field`): page background and ticket-slip fill. Dominant surface.
- **Deep Meadow** (`field-deep`): hover wash on ghost buttons and strip stops, and the enamel-thickness underside of panels.
- **Enamel White** (`panel`): sign panels, navbar, secondary buttons, focused inputs.
- **Sunk Enamel** (`panel-sunk`): input fill, disabled buttons, info messages.
- **Board Ink** (`ink`): body text, panel edges (the 2px `edge`), the footer band in light theme.
- **Soft Ink** (`ink-soft`): hints, placeholders, planned-stop labels and dashes.
- **Terminal Band** (`deep` / `on-deep`): footer, deep green in both themes, with the line recoloured bright green on it.
- **Fault Red** (`danger`, `danger-wash`) and **Confirm Wash** (`ok-wash`): error and success message tints only.

Dark-theme counterparts live in `src/styles/tokens.css` and the sidecar; frontmatter records the light values.

### Named Rules
**The One Line Rule.** There is one route colour. It is a stroke (lines, rings, focus), not a fill for large areas; large fills belong to the field or panel.
**The Green Neutral Rule.** Neutrals are tinted toward hue 130-152. Pure white, black and gray are not used.
**The Hatch Means Planned Rule.** The amber diagonal hatch and dashed strokes mean "not built yet" or "work in progress", and nothing else.

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

Single column, centred, max width 78rem (`--page-max`) with a fluid gutter `clamp(1rem, 4vw, 2.5rem)`. Narrow form pages cap at 34rem. Page sections start 3rem from the navbar. Spacing is a 4px-based rem scale (0.25 to 4.5rem, steps 1-8); gaps inside panels are 1.5rem (2rem from 40rem up). The home hero is one column, then two columns (1.05fr / 1fr, headline left, Shorten board right) from 62rem. The navbar sticks at 4.25rem and collapses into a drawer below 75rem, where the horizontal strip turns vertical. The route map switches layout at 52rem. Footer sits 4.5rem below content.

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

Softly squared signage: 0.5rem on controls, 0.875rem on tickets, 1.25rem on boards, circles for stops. Every panel and field has a 2px solid ink edge (`--edge`). Planned things use dashed strokes. The ticket slip has semicircular perforation notches. Boards clip to their radius and end their header in a diagonal kerb hatch.

## Components

### Buttons
- **Shape:** 0.5rem radius, 2.875rem tall (2.25rem small), condensed uppercase 700 label, nowrap.
- **Primary:** Signal Forest fill, enamel text, hard Deep Forest underside.
- **Secondary:** enamel fill, ink text, 2px ink border and ink underside. **Ghost:** transparent, no underside, Deep Meadow wash on hover.
- **Hover / Active:** lifts 2px with a longer underside; active presses down by the underside height in 60ms. Ghost does not lift.
- **States:** disabled is sunk enamel with hairline edge; loading shows a spinning ring in the label; error turns danger red with a 360ms shake.

### Inputs / Fields
Sunk-enamel fill, 2px ink border, 0.5rem radius, 2.875rem tall; Barlow 600 label above at 0.875rem, hint and error in 0.875rem. Hover and focus lift the fill to enamel; focus turns the border Signal Forest and adds the 4px line halo. Invalid state turns the border red with a bold red message. A mono variant is used for URL fields.

### Station Board (signature)
White enamel panel, 1.25rem radius, 2px edge, enamel-thickness shadow. Header is a Signal Forest bar with title in condensed uppercase and the amber kerb hatch along its bottom. Body padding 1.5rem, 2rem from 40rem. Hosts tool UI (Shorten) and auth forms.

### Route Strip and Stop Marker (signature, navigation)
The navbar is a horizontal strip of stops joined by connectors. Open stops: ring in route green, solid 5px connector, link text. Planned stops: dashed soft-ink ring and connector, soft-ink non-link label. Current page: filled Signal Forest marker scaled 1.2 with a pulsing outer ring, bold label. Hover scales marker 1.25 and washes the stop. Below 75rem the strip turns vertical in a drawer that wipes open via clip-path.

### Ticket Slip
Result of a shortened link: Meadow Field fill, 2px dashed ink border, perforation notches, mono link, actions row below. It "prints" in with a 720ms clip-path reveal.

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

### Don't:
- **Don't** build a dark-terminal homelab dashboard or a rounded-card SaaS page; both are rejected directions.
- **Don't** use gray or pure white/black; neutrals stay green-tinted.
- **Don't** use blur, glow or glass for elevation; depth is a hard offset in a solid colour.
- **Don't** use route green as text colour on the field; text is ink or Signal Forest.
- **Don't** use the amber hatch for anything but planned/in-progress.
