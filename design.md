# Paper Mache & Hand-Drawn Grid Design System

## Overview & Philosophy
The **"Paper Mache & Hand-Drawn Grid"** design language is an organic, tactile, editorial aesthetic inspired by physical notebook journals, hand-cut cardstock, engineering grid paper, and rubber ink stamps. It replaces cold, clinical digital interfaces with a warm, human, academic atmosphere.

---

## 1. Color Palette

All colors are strictly codified as CSS custom properties (`:root`):

| Token | Hex Value | Purpose / Role |
| :--- | :--- | :--- |
| `--paper-bg` | `#f4f1ea` | Warm vintage parchment / paper mâché background |
| `--paper-card` | `#fcfbf8` | Creamy lifted cardstock surface for cards & modals |
| `--paper-surface` | `#efece4` | Layered recessed paper, section backgrounds, input fills |
| `--ink-main` | `#2c2416` | Deep charcoal-sepia ink for primary headings & typography |
| `--ink-muted` | `#6e6456` | Muted graphite / aged ink for subtitles, metadata & hints |
| `--ink-faint` | `#a89f91` | Faint sketch pencil tone for disabled states & grid guides |
| `--stamp-accent` | `#c86d51` | Terracotta / coral ink stamp for primary CTA, focus, active tabs |
| `--stamp-accent-hover`| `#b15b41` | Deepened terracotta stamp on hover / active press |
| `--moss-accent` | `#5b7055` | Botanical moss green for completions, mastered habits, streaks |
| `--moss-accent-hover` | `#4a5c45` | Deep moss green on hover |
| `--clay-accent` | `#d4a373` | Warm clay amber for intermediate progress & warning notes |
| `--border-grid` | `#d3cbbd` | Organic dashed graphite border (`2px dashed #d3cbbd`) |
| `--border-ink` | `#2c2416` | Hand-inked solid or dashed accent boundary |

---

## 2. Hand-Drawn Grid & Borders

### Dashed Boundary Rule
All project layouts, tables, cards, sections, and container boundaries utilize organic dashed lines:
```css
border: 2px dashed var(--border-grid, #d3cbbd);
```
Digital solid hairline borders (`1px solid #e2e8f0`) are strictly avoided in favor of organic graphite dashes that feel physically sketched.

### Subtle Engineering Coordinate Grid
The primary canvas features a subtle 24px coordinate grid pattern simulating drafted notebook pages:
```css
background-color: var(--paper-bg);
background-image: 
  linear-gradient(to right, rgba(211, 203, 189, 0.35) 1px, transparent 1px),
  linear-gradient(to bottom, rgba(211, 203, 189, 0.35) 1px, transparent 1px);
background-size: 24px 24px;
```

---

## 3. Tactile Cardstock & Shadows

### Cardstock Box-Shadows
Cards, modals, and containers simulate stacked paper stock with physical offset depth rather than diffuse digital blurs:
```css
box-shadow: 2px 3px 0px rgba(44, 36, 22, 0.08), 0 6px 16px rgba(44, 36, 22, 0.04);
```

### Organic Hand-Cut Radii
Slightly asymmetrical border radii provide an authentic, hand-trimmed cardstock look:
```css
border-radius: 8px 10px 9px 7px / 9px 7px 10px 8px;
```

---

## 4. Typography

- **Headings & Titles**: Classic editorial serif (`'Newsreader'`, `'Georgia'`, `'Charter'`, serif) with warm letter spacing.
- **Body & Controls**: Humanist, clean technical sans (`'Inter'`, `-apple-system`, `'Segoe UI'`, sans-serif).
- **Metrics & Streaks**: Monospace coordinate typography (`Consolas`, `'Courier New'`, monospace) for counters and days.

---

## 5. Ink-Stamp UI Elements

- **Buttons**: Rendered with ink-stamp dashed borders and tactile pressed micro-interactions (`transform: translate(1px, 2px); box-shadow: none;`).
- **Badges & Pills**: Letterpress-styled ink stamp badges with uppercase tracking and subtle dashed borders (`border: 1.5px dashed var(--stamp-accent)`).
- **Checkboxes & Steppers**: Hand-drawn ink box aesthetic with custom vector SVG checkmarks and physical tactile clicks.
- **Activity Heatmap**: Earthy organic tones (parchment blank, soft sage, moss green, deep forest ink).

---

## 6. Strict Zero-Emoji Policy

- **Absolute Prohibition**: Never use unicode emojis (such as smiley faces, fire icons, trophies, checkmarks, etc.) in UI copy, buttons, badges, modals, empty states, toasts, or console logs.
- **Standard Alternatives**:
  - Crisp, hand-drawn vector SVG icons with `stroke: currentColor`.
  - Structured academic text tags (e.g., `[FOCUS]`, `[COMPLETED]`, `[PENDING]`, `[STREAK]`, `[JAVA]`, `[PASS]`).
- **Goal**: Maintain an uncompromising, professional, tactile, and non-AI academic aesthetic.
