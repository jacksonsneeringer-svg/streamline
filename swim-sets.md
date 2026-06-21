---
name: swim-sets
description: Coaching framework Streamline uses to program the daily swim set for each of the four levels (Beginner, Intermediate, Advanced, Pro). This is the single source of truth for the daily-set generator — edit this file to change how today's sets are written.
---

# Daily Swim Set Programming

This skill defines how Streamline writes the daily swim set that is pushed onto
each of the four levels on the **Swim Sets** page. The set generator reads this
file at run time and follows the level-specific guidance below for the level it
is currently writing. Keep the structure and headings stable so the generator
can rely on them.

## How a set is built

Every daily set, regardless of level, follows the same shape:

1. **Title** — descriptive, based on the day's stroke focus, the intensity, and
   the theme (e.g. "Backstroke Threshold Builders", "IM Turn & Tempo").
2. **Sections, in order** — each section has a purpose and a yardage. The exact
   section list depends on the level (see below).
3. **Pieces** — each line is written exactly as a coach would put it on a
   whiteboard, using the interval conventions below.
4. **Coaching notes** — short, purposeful notes on individual pieces explaining
   what the swimmer should focus on (breath work, turns, head position, race
   pace, tempo, etc.).
5. **Focus cue** — a 2–3 sentence cue the coach would say at the start of
   practice, written in language appropriate to the level.

## Weekly stroke / theme schedule

The day of the week sets the stroke or theme focus. Honor it.

| Day | Focus |
| --- | --- |
| Monday | Distance Freestyle |
| Tuesday | Breaststroke |
| Wednesday | Backstroke |
| Thursday | Butterfly |
| Friday | IM |
| Saturday | Sprints & Dives |
| Sunday | Mid-Distance Choice Stroke |

## Interval & notation conventions

- Repeats: `4x 200 free @2:45`, `8x 50 fly @:55 w/ :15 rest`
- Single pieces: `200 back @1:30`
- Compound pieces: `4x (100 free + 50 back) @2:30`
- Stroke abbreviations: `free`, `back`, `fly`, `breast`, `IM`, `choice`
- Beginners do **not** get pace-clock intervals — use plain rest like
  "30 sec rest" instead of `@` send-offs.

## Classification tags

Every set is tagged so it can be filed in the archive and filtered later:

- **strokeFocus**: `freestyle` | `backstroke` | `butterfly` | `breaststroke` | `im` | `choice`
- **intensity**: `aerobic` | `threshold` | `sprint` | `recovery`
- **setType**: `drill` | `kick` | `pull` | `race` | `endurance` | `technique`
- **distanceCategory**: `short` | `mid` | `long` | `ultra`

Pick the tags that genuinely describe the set you wrote — they drive the
archive filters, so they need to be accurate.

## Level guidance

### Beginner — ~1,000 yards

- **Sections (in order):** Warm-Up, Drill Set, Main Set, Cool-Down
- **Swimmer profile:** Knows basic freestyle, maybe backstroke. No flip turns.
  Still building comfort and breathing rhythm.
- **Language:** Plain English only. No jargon — no "hypoxic", no "descend", no
  "negative split". Explain focus in everyday words.
- **Pieces:** Max single piece is 100 yards. Use plain rest ("30 sec rest"),
  never pace-clock send-offs.
- **Intent:** Build water comfort, stroke basics, and breathing. Keep the main
  set genuinely aerobic and unintimidating.

### Intermediate — ~2,500 yards

- **Sections (in order):** Warm-Up, Pre-Main, Main Set, Cool-Down
- **Swimmer profile:** Swims all four strokes, does flip turns, reads a pace
  clock. Comfortable up to 200 yards per piece.
- **Language:** Basic coaching terms are fine — descend, build,
  easy/moderate/fast.
- **Pieces:** Use pace-clock intervals such as `@1:30`. Mix strokes and add
  light structure (descends, builds, negative-split awareness).
- **Intent:** Develop aerobic base, turn quality, and pacing awareness.

### Advanced — ~4,500 yards

- **Sections (in order):** Warm-Up, Pre-Main, Main Set, Second Main, Cool-Down
- **Swimmer profile:** Race-trained. Knows hypoxic sets, descend, negative
  split, lactate threshold. Comfortable up to 400+ yards per piece.
- **Language:** All standard coaching terminology is fine.
- **Pieces:** Two distinct main sets with complementary purposes (e.g. a
  threshold block then a race-pace block). Use precise intervals.
- **Intent:** Threshold development, race-specific work, and volume with
  intent.

### Pro — ~7,000 yards

- **Sections (in order):** Warm-Up, Pre-Main, Main Set, Second Main, Third Main, Cool-Down
- **Swimmer profile:** Elite / professional. Uses every technical concept
  freely.
- **Language:** Full technical vocabulary — VO2, threshold blocks, race pace,
  breakout distance, underwaters, tempo sets.
- **Pieces:** Pieces up to 1,000 yards. Three main sets that build a coherent
  session with precise pace targets.
- **Intent:** High-volume, high-precision training with clearly periodized
  energy-system work and exacting pace control.
