<!-- Generated from .21st/design.json. Keep design decisions in sync with the source file. -->
# docregister design context

## Direction

docregister is a compact clinical workflow. Its interface uses the restraint of Apple platform software and the component proportions of the 21st.dev Geist library, adapted locally for healthcare data entry.

- Light pages are pure `#ffffff`; dark pages are pure `#000000`.
- Grouped surfaces use `#f5f5f7` in light mode and `#1c1c1e` in dark mode.
- Primary actions use `#0071e3` in light mode and `#0a84ff` in dark mode.
- Red, orange, and green remain reserved for destructive, warning, and successful or financial states.
- Typography is system-first with Geist fallbacks. Metadata is never smaller than 12px.
- Desktop controls are compact; touch controls are at least 44px in either dimension.

## Components

The local primitives in `src/components/ui` follow shadcn-compatible APIs and adapt the 21st.dev Geist Button, Input, Tabs, Theme Switcher, Empty State, Table, and Pagination patterns. Select, Switch, SearchField, SegmentedControl, IconButton, and ListRow round out the shared clinical component set.

Radix continues to provide sheet focus trapping, restoration, dismissal, and tab semantics. Native HTML is preferred for selects and switches where it provides a smaller and equally accessible implementation.

## Required behavior

- Theme preference is `system | light | dark`, defaults to `system`, responds to OS changes, and is applied before first paint.
- All structural surfaces are opaque and use hairline separators plus restrained neutral shadows.
- Keyboard focus is always visible, reduced-motion preferences are honored, and information is never communicated by color alone.
- Layout density should prioritize scanning patient records, prescriptions, and accounts over decorative whitespace.

## Avoid

- No gradients, ambient decoration, frosted treatments, colored shadows, or decorative motion.
- No translucent cards, panels, navigation, inputs, or docks.
- No remote runtime assets and no component code loaded from a CDN.
- No metadata below 12px and no touch target below 44px.

## Source of truth

- Tokens and shared surface utilities: `src/app/globals.css`
- Shared primitives: `src/components/ui`
- Registry configuration: `components.json`
- Machine-readable decisions: `.21st/design.json`
