# Workboard Theme Contract

Workboard is OpenWork Hub's shared visual system. It is based on a focused,
professional work-management dashboard: dense enough for daily operations,
quiet enough for long sessions, and consistent across every role.

## Sources of Truth

- Global CSS tokens, local font imports, canvas, card, and featured metric utilities:
  `packages/frontend/src/styles/index.css`
- Tailwind color and font aliases:
  `packages/frontend/tailwind.config.js`
- Shared React primitives:
  `packages/frontend/src/components/ui/`
- Shared feedback states:
  `packages/frontend/src/components/common/`

The `atlas-*` token names remain as a compatibility API. Do not rename them
page-by-page. Their values now implement Workboard. Legacy `sunny-*` CSS
aliases exist only to avoid visual regressions in older extensions; new code
must use `workboard-*`.

## Core Language

- Display: Manrope, 500-700 weights.
- Body and data: Inter, 400-700 weights.
- Ink: near-black `#181C1A`.
- Brand: forest `#0D3B2A` and emerald `#147A50`.
- Canvas: cool neutral `#F3F5F3`.
- Cards: white, 16px radius, thin neutral-green borders, low shadows.
- Status colors: semantic green, amber, and red only.
- Motion: no ambient decoration; transitions communicate interaction.

## Building New Screens

1. Use `workboard-canvas` for large page backgrounds.
2. Use `Panel`, `PageHeader`, `Button`, `Badge`, `StatePanel`, `EmptyState`, and
   `ErrorDisplay` before writing one-off surface styles.
3. Use `workboard-card` only when an existing semantic primitive is not suitable.
4. Use `atlas` and `primary` Tailwind colors. Do not add unrelated hard-coded
   brand colors.
5. Keep status meaning in text/icons as well as color.
6. Keep charts exact, readable, and motion-free.
7. Preserve compact desktop density, readable mobile stacking, and 44px touch targets.
8. Use `workboard-feature` for one focal KPI only, never every card.

## Avoid

- purple or pastel page-local palettes;
- playful symbols, floating bubbles, or oversized pill controls;
- full-green navigation rows; active navigation uses a slim marker;
- more than one featured green KPI per metric group;
- large radii above 16px for normal cards;
- decorative animation or fake controls;
- page-local palettes that make features look like separate apps.
