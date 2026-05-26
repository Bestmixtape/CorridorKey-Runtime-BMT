---
name: CorridorKey
description: Visual contract for the CorridorKey Tauri GUI and browser POC. Tokens extracted from src/gui/src/index.css (Tailwind v4 `@theme`). Components share zinc-near-black surfaces with a sky-blue accent and Apple-system typography.
tokens:
  color:
    brand:
      $value: "#0ea5e9"
      $type: color
      $description: "Sky-blue accent for primary actions, focus rings, and the CorridorKey wordmark. Source: --color-brand."
    surface:
      $value: "#09090b"
      $type: color
      $description: "Page background. Tailwind zinc-950, applied to body via bg-zinc-950."
    text:
      $value: "#fafafa"
      $type: color
      $description: "Default foreground. Tailwind zinc-50, applied to body via text-zinc-50."
    background:
      $value: "#09090b"
      $type: color
      $description: "Semantic application background. Alias of surface for bg-background."
    foreground:
      $value: "#fafafa"
      $type: color
      $description: "Semantic default foreground. Alias of text for text-foreground."
    card:
      $value: "#18181b"
      $type: color
      $description: "Panel and card surface. Tailwind zinc-900."
    muted-foreground:
      $value: "#a1a1aa"
      $type: color
      $description: "Secondary text. Tailwind zinc-400."
    accent:
      $value: "#27272a"
      $type: color
      $description: "Subtle interactive surface. Tailwind zinc-800."
    accent-foreground:
      $value: "#fafafa"
      $type: color
      $description: "Foreground used on accent surfaces."
    primary:
      $value: "#0ea5e9"
      $type: color
      $description: "Primary action color. Alias of brand."
    primary-foreground:
      $value: "#ffffff"
      $type: color
      $description: "Foreground used on primary action surfaces."
    secondary:
      $value: "#27272a"
      $type: color
      $description: "Secondary action surface. Tailwind zinc-800."
    secondary-foreground:
      $value: "#fafafa"
      $type: color
      $description: "Foreground used on secondary action surfaces."
    destructive:
      $value: "#ef4444"
      $type: color
      $description: "Error and destructive action color. Tailwind red-500."
    destructive-foreground:
      $value: "#ffffff"
      $type: color
      $description: "Foreground used on destructive surfaces."
    ring:
      $value: "#0ea5e9"
      $type: color
      $description: "Focus ring color. Alias of brand."
  font:
    body:
      $value: "-apple-system, system-ui, sans-serif"
      $type: fontFamily
      $description: "Native UI font on every platform. No web fonts loaded."
  radius:
    md:
      $value: "8px"
      $type: dimension
      $description: "Small surfaces (inputs, chips). Source: --radius-md."
    lg:
      $value: "12px"
      $type: dimension
      $description: "Buttons and panels. Source: --radius-lg."
    xl:
      $value: "16px"
      $type: dimension
      $description: "Cards and modal containers. Source: --radius-xl."
  shadow:
    apple:
      $value: "0 10px 15px -3px rgba(0, 0, 0, 0.5)"
      $type: shadow
      $description: "Single elevation token used by floating panels. Source: --shadow-apple."
---

# CorridorKey Visual Contract

Source of truth for the visual surface. Tokens above are the only values the
GUI may reference. Token source file: [`src/gui/src/index.css`](src/gui/src/index.css).
If a category is not declared here, it does not exist in the design system
yet - do not invent it in code.

## Colors

CorridorKey's brand is **sky-blue on zinc-near-black**, not yellow-on-warm-black.
The core identity colors are `brand`, `surface`, and `text`; UI role aliases
map existing components to that same zinc/sky-blue system.

- `brand` (`#0ea5e9`) is reserved for primary action, focus, and the wordmark.
  Do not use it for body text or background.
- `surface` (`#09090b`) is the page background. All overlays sit on top of it.
- `text` (`#fafafa`) is the only default foreground. Disabled and muted variants
  derive from the zinc role aliases.
- `background`, `foreground`, `card`, `muted-foreground`, `accent`,
  `primary`, `secondary`, `destructive`, and `ring` are semantic utility
  aliases used by existing React components. They do not create a second brand
  palette; they bind component roles to zinc, sky-blue, and error red.

The raw Tailwind palette (`zinc-*`, `sky-*`) is available through Tailwind's
default theme. Prefer the semantic tokens above for any role-bearing color;
reach for raw scale values only inside Tailwind utility classes.

## Typography

A single font stack: `-apple-system, system-ui, sans-serif`. No web fonts are
loaded - shipping a native-feeling Tauri desktop and a fast browser POC both
benefit from the platform-provided UI font. A typographic scale (sizes,
weights, line-heights) is not declared; until then, rely on Tailwind's default
type ramp.

## Shapes

Three border radii, increasing with surface size:

- `radius.md` (`8px`) for small interactive controls.
- `radius.lg` (`12px`) for buttons and inline panels.
- `radius.xl` (`16px`) for cards, modals, and full-bleed panels.

Sharp corners (`0px`) are not part of the system. Pill-shapes (`9999px`) are
not part of the system.

## Elevation and Depth

One shadow token: `shadow.apple`. It models the soft, near-black-on-near-black
elevation used in macOS-style desktop UIs and survives on zinc-950 because it
is colored, not just opaque. There is intentionally no shadow ramp; the
single elevation matches the flat, native-feeling surface.

## Derived Surface Utilities

The GUI may define named utility classes when a visual is a reusable composition
of existing tokens rather than a new token value.

- `ck-preview-empty` is the empty media viewer background. It derives from
  `card` and `background`.
- `ck-preview-checkerboard` is the transparent-preview checkerboard. It derives
  from `card` and `background`.
- `ck-wipe-divider` is the comparison divider glow. It derives from `brand`.

## Layout

Spacing scale is not declared; use Tailwind's default spacing utilities until
project-specific tokens are pinned.

## Motion

Easings and durations are not declared; use Tailwind's default transition
utilities (`transition`, `duration-150`, `ease-in-out`) until a motion contract
is pinned.

## Do's and Don'ts

- Do reference tokens through Tailwind v4 `@theme` (`var(--color-brand)`,
  `--radius-lg`) or the matching utility classes.
- Do keep new visual decisions in token form; if a value would be repeated more
  than once across the GUI, it should land here first.
- Don't introduce a second accent color. Sky-blue is the only accent; warm
  tones break the brand split documented in product memory.
- Don't add new shadows or radii ad hoc. Extend the token set in
  `src/gui/src/index.css` and re-run the audit in the same change.
- Don't load external fonts. The Apple-system stack is the design choice.
