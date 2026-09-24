# Contract: companion.json Schema (schemaVersion 1 & 2)

**Versions**: 1, 2
**Location**: `~/.codex/pets/<id>/companion.json` (alongside `pet.json`)
**Purpose**: Optional enhancement configuration for the companion animation engine

---

## Schema Examples

### Schema Version 1 (Individual Frame Files & Fixed Width Sizing)

```json
{
  "schemaVersion": 1,
  "petId": "example-pet",
  "render": {
    "smallWidth": 84,
    "restWidth": 360,
    "anchor": "pet-bottom-center",
    "interpolation": "nearest"
  },
  "clips": {
    "enter": {
      "frames": ["enter/0001.png", "enter/0002.png", "enter/0003.png"],
      "fps": 10,
      "loop": false
    },
    "rest": {
      "frames": ["rest/0001.png", "rest/0002.png", "rest/0003.png", "rest/0004.png"],
      "fps": 8,
      "loop": true
    },
    "exit": {
      "frames": ["exit/0001.png", "exit/0002.png", "exit/0003.png"],
      "fps": 12,
      "loop": false
    }
  }
}
```

### Schema Version 2 (Atlas Coordinate Frames & Relative Height Ratio Sizing)

```json
{
  "schemaVersion": 2,
  "petId": "example-pet",
  "render": {
    "restHeightRatio": 0.75,
    "anchor": "pet-bottom-center",
    "interpolation": "nearest"
  },
  "clips": {
    "rest": {
      "atlasFrames": [
        { "row": 0, "column": 0 },
        { "row": 0, "column": 1 },
        { "row": 0, "column": 2 }
      ],
      "fps": 8,
      "loop": true
    }
  }
}
```

---

## Field Definitions

| Field | Type | Required | Default | Constraints & Version Scope |
|-------|------|----------|---------|-----------------------------|
| `schemaVersion` | integer | yes | — | Must equal `1` or `2`. |
| `petId` | string | yes | — | Must match the `id` field in the accompanying `pet.json`. |
| `render` | object | no | See defaults | Render sizing and anchor configuration. |
| `render.smallWidth` | integer | no | `84` | CSS-width equivalent in small state. Range: [32, 256]. |
| `render.restWidth` | integer | no | `360` | CSS-width equivalent in resting state (schema v1 `fixedWidth` mode). Range: [96, 768]. Must be ≥ `smallWidth`. |
| `render.restHeightRatio` | number | no | `0.72` | Relative target height ratio in resting state (schema v2). Finite number in range [0.4, 0.9]. **v2-only** (rejected in v1). |
| `render.anchor` | string | no | `"pet-bottom-center"` | In schema v1, must be `"pet-bottom-center"`. |
| `render.interpolation` | string | no | `"nearest"` | Image interpolation mode (`"nearest"` or `"linear"`). |
| `clips` | object | no | — | Per-state clip definitions (`enter`, `rest`, `exit`). |
| `clips.<name>.frames` | string[] | no* | — | Relative paths to PNG/WebP frame files. Must define exactly one of `frames` or `atlasFrames`. |
| `clips.<name>.atlasFrames` | object[] | no* | — | Array of `{ "row": integer >= 0, "column": integer [0, 7] }`. **v2-only** (rejected in v1). Must define exactly one of `frames` or `atlasFrames`. |
| `clips.<name>.fps` | integer | yes* | — | Playback frame rate. Range: [1, 12]. |
| `clips.<name>.loop` | boolean | no | `false` (enter/exit), `true` (rest) | Loop animation. |

*Required only when the parent clip object is present.

---

## Sizing Policy Summary

- **Missing `companion.json`**: Uses `restHeightRatio` mode at default `0.72`.
- **`schemaVersion 1`**: Uses `fixedWidth` / `restWidth` mode by default.
- **`schemaVersion 2`**: Uses `restHeightRatio` mode by default.
- **User Config Override**: An explicit valid user `restHeightRatio` / `targetHeightRatio` override forces ratio mode regardless of package schema version.

---

## Validation Rules (for `codex-pet-companion validate-pet`)

1. If `companion.json` exists, it MUST parse as valid JSON.
2. `schemaVersion` MUST equal `1` or `2`.
3. `petId` MUST equal the `id` field in the accompanying `pet.json`.
4. Schema v1 files containing `render.restHeightRatio` or clip `atlasFrames` MUST fail validation.
5. In schema v2, `atlasFrames` row indices must be within range `[0, atlasRows - 1]`. `atlasFrames` bypass individual image file checks (`validateFrames`).
6. For clip `frames`, all image files MUST exist relative to package root, decode as PNG/WebP with an alpha channel, and share identical dimensions.
7. No path field may contain absolute paths (`/`) or directory traversal (`..`).
