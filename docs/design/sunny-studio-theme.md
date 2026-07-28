# Sunny Studio Theme Contract

Sunny Studio is OpenWork Hub's shared visual system. It replaces the former
corporate Atlas mood without changing product behavior, routes, or RBAC.

## Sources of Truth

- Global CSS tokens, local font imports, canvas, card, and motion utilities:
  `packages/frontend/src/styles/index.css`
- Tailwind color and font aliases:
  `packages/frontend/tailwind.config.js`
- Shared React primitives:
  `packages/frontend/src/components/ui/`
- Shared feedback states:
  `packages/frontend/src/components/common/`

The `atlas-*` token names remain as a compatibility API. Do not rename them
page-by-page. Their values now implement Sunny Studio.

## Core Language

- Display: Fredoka, used for headings and friendly emphasis.
- Body and utility labels: Nunito Sans.
- Ink: soft blueberry, never pure black.
- Main accent: lavender.
- Support accents: butter yellow, mint, sky blue, and blush.
- Surfaces: warm near-white with rounded corners and low purple shadows.
- Motion: one gentle decorative bob; always disabled for reduced motion.

## Building New Screens

1. Use `sunny-canvas` for large page backgrounds.
2. Use `Panel`, `PageHeader`, `Button`, `Badge`, `StatePanel`, `EmptyState`, and
   `ErrorDisplay` before writing one-off surface styles.
3. Use `sunny-card` only when an existing semantic primitive is not suitable.
4. Use `atlas` and `primary` Tailwind colors. Do not add unrelated hard-coded
   brand colors.
5. Keep status meaning in text/icons as well as color.
6. Keep charts exact, readable, and motion-free.
7. Preserve roomy mobile layouts and 44px touch targets.

## Avoid

- dark corporate navigation blocks;
- all-uppercase mono labels across whole screens;
- sharp white/gray enterprise cards;
- gradients used as decoration;
- extra animation;
- page-local palettes that make features look like separate apps.
