# Legacy Icon Mapping

This document describes the mapping between legacy "Mein Budget" Android drawable icons and Budget Wise icon keys.

## Icon Key Systems

Budget Wise uses two icon systems. Both are valid values for a category's `icon` field:

1. **SVG preset keys** — short names that resolve to custom SVG files in `/categories/custom-category-icons/`:
   `cash`, `money`, `pig`, `present`, `tool`, `house`, `entertainment`, `party`, `handy`

2. **Lucide keys** — prefixed with `lucide:`, resolved by `getLucideIcon()` in `icon-picker.tsx`:
   `lucide:shopping`, `lucide:food`, `lucide:bus`, `lucide:car`, `lucide:briefcase`, etc.

The migration maps legacy Android drawable names to whichever system has the closest visual match. Values that don't match either system will silently fall through to a first-letter placeholder in the UI.

## Fallback Behavior

Icons not found in the mapping tables fall back to:
- **Expense categories**: `lucide:shopping`
- **Income categories**: `cash` (SVG preset)

## Expense Icons (kategorie_ausgaben_*)

| Legacy Icon | Icon Key | System | German Name | English Translation |
|-------------|----------|--------|-------------|---------------------|
| `kategorie_ausgaben_1` | `cash` | SVG preset | Allgemein | General |
| `kategorie_ausgaben_2` | `house` | SVG preset | Haushalt | Household |
| `kategorie_ausgaben_3` | `lucide:food` | Lucide | Essen | Food |
| `kategorie_ausgaben_4` | `lucide:shopping` | Lucide | Einkaufen | Shopping |
| `kategorie_ausgaben_5` | `lucide:book` | Lucide | Bücher | Books |
| `kategorie_ausgaben_6` | `present` | SVG preset | Geschenk | Gift |
| `kategorie_ausgaben_7` | `lucide:briefcase` | Lucide | Büro | Office |
| `kategorie_ausgaben_8` | `lucide:wifi` | Lucide | Internet | Internet |
| `kategorie_ausgaben_9` | `lucide:heart` | Lucide | Schatz | Darling/Partner |
| `kategorie_ausgaben_10` | `lucide:scissors` | Lucide | Kleidung | Clothing |
| `kategorie_ausgaben_11` | `lucide:star` | Lucide | Hobby | Hobby |
| `kategorie_ausgaben_12` | `handy` | SVG preset | Handy | Mobile |
| `kategorie_ausgaben_13` | `lucide:smile` | Lucide | Ausgehen | Going Out |
| `kategorie_ausgaben_14` | `lucide:bus` | Lucide | Bus | Transport |
| `kategorie_ausgaben_15` | `lucide:plane` | Lucide | Urlaub | Vacation |
| `kategorie_ausgaben_16` | `lucide:car` | Lucide | Auto | Car |
| `kategorie_ausgaben_17` | `pig` | SVG preset | Sparen | Savings |

## Income Icons (kategorie_einnahmen_*)

| Legacy Icon | Icon Key | System | German Name | English Translation |
|-------------|----------|--------|-------------|---------------------|
| `kategorie_einnahmen_1` | `cash` | SVG preset | Allgemein | General |
| `kategorie_einnahmen_2` | `money` | SVG preset | Lohn | Salary |
| `kategorie_einnahmen_3` | `pig` | SVG preset | Taschengeld | Allowance |
| `kategorie_einnahmen_4` | `present` | SVG preset | Geschenk | Gift |
| `kategorie_einnahmen_5` | `lucide:briefcase` | Lucide | Ferienjob | Holiday Job |

## Implementation

Implemented in `packages/core/src/migration/legacy-category-mapping.ts`
and reused by the local readers and online legacy transformer.

SVG preset keys are defined in `packages/core/src/constants/category-mappings.ts` → `PRESET_ICONS`.
Lucide keys are defined in `packages/app/src/components/ui/icon-picker.tsx` → `LUCIDE_ICONS`.
