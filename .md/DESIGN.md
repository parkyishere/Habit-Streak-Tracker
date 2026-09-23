# Design System: Paper Mache & Hand-Drawn Grid

## Aesthetics & Language
Tactile, academic, and editorial design language modeled after paper mache notebook journals, organic dashed gridlines, and pressed ink stamps.

## Color Palette Tokens
- `--paper-bg`: `#f4f1ea` (Warm textured parchment background)
- `--paper-card`: `#fcfbf8` (Creamy lifted cardstock)
- `--paper-surface`: `#efece4` (Recessed paper surface)
- `--ink-main`: `#2c2416` (Deep charcoal-sepia ink for text)
- `--ink-muted`: `#6e6456` (Muted graphite ink for subtitles)
- `--stamp-accent`: `#c86d51` (Terracotta ink-stamp accent for CTA/focus)
- `--moss-accent`: `#5b7055` (Botanical moss green for completions & streaks)
- `--border-grid`: `#d3cbbd` (Organic 2px dashed border)

## Core Stylistic Rules
1. **Hand-Drawn Grid Borders**: All cards, tables, sections, and modals use `border: 2px dashed #d3cbbd`.
2. **Tactile Cardstock Depth**: `box-shadow: 2px 3px 0px rgba(44, 36, 22, 0.08), 0 6px 16px rgba(44, 36, 22, 0.04)`.
3. **Engineering Grid Canvas**: 24px subtle coordinate gridline background.
4. **Organic Typography**: Editorial serif headings paired with clean technical sans and monospace metrics.
5. **Zero-Emoji Policy**: Zero emojis permitted across all UI, buttons, headers, and logs. Vector SVGs and structured academic tags (`[FOCUS]`, `[COMPLETED]`) only.