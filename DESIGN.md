# AI Assistant Console — Design System

**Style direction:** Linear.app-inspired dark productivity console with semantic color hierarchy.

## Visual Theme
- Dark-first with light mode support
- Atmospheric radial gradient background (accent bleed)
- Monospace uppercase labels for section headers
- Minimal borders, elevated surfaces with subtle contrast

## Color Palette Tokens

### Core (existing)
| Token | Dark | Light |
|---|---|---|
| `--bg` | `#0a0b0f` | `#ffffff` |
| `--bg-elevated` | `#11131a` | `#f8f9fb` |
| `--bg-muted` | `#171a23` | `#eef1f6` |
| `--border` | `#252a37` | `#d9deea` |
| `--text` | `#e6e9f2` | `#1a1d24` |
| `--text-muted` | `#98a2b8` | `#606b81` |
| `--accent` | `#6ea8fe` | `#3b6bff` |
| `--success` | `#42c9a4` | `#0f9f7a` |
| `--warning` | `#f0b34e` | `#b7791f` |
| `--danger` | `#ff7f8f` | `#c53030` |

### Lane Colors (new)
| Token | Dark | Light | Purpose |
|---|---|---|---|
| `--lane-today` | `#ff6b6b` | `#dc2626` | Urgency, act now |
| `--lane-next` | `#ffa94d` | `#d97706` | Warm upcoming |
| `--lane-backlog` | `#868e96` | `#6b7280` | Deprioritized, cool grey |

## Typography
- **Sans:** Inter (variable `--font-geist-sans`)
- **Mono:** JetBrains Mono (variable `--font-geist-mono`)
- Section headers: `text-xs font-mono uppercase tracking-[0.2em]`
- Lane headers: Same monospace style but in lane-specific color with a 4px colored dot

## Component Rules

### Lane Headers
- Colored dot (4px) + colored label text per lane
- Count badge inherits lane color at 60% opacity
- Sidebar lane buttons show left border accent in lane color

### Cards
- Type badges: blue (todo), purple (link), emerald (note)
- Review flag: amber
- Lane badge on card: inherits lane color

### PWA
- Theme color: `#0a0b0f` (dark bg)
- App name: "AI Assistant"
- Standalone display, portrait orientation
- Service worker: cache-first for static, network-first for API

## Layout & Spacing
- 3-column grid: sidebar (220px) / main / detail (320px)
- `gap-4` between sections
- `p-4` / `p-5` panel padding
- `space-y-3` for card lists

## Motion
- Card entrance: `cardEnter 220ms ease` with stagger delay
- Buttons: `transition 140ms ease` for border/bg/color
- Active press: `scale-95 brightness-90`

## Do / Don't
- DO use CSS custom properties for all colors
- DO keep dark as default theme
- DON'T use hardcoded hex in component JSX
- DON'T mix unrelated color languages
- DO provide accessible focus states (2px accent outline)
