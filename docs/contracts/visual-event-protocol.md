# Contract: Visual Event Protocol (Node Bridge → Swift Renderer)

**schemaVersion**: 1
**Transport**: NDJSON over stdio (parent Node process → child Swift process stdin)
**Direction**: Unidirectional (bridge → renderer)

---

## Message Format

Each message is a single JSON object followed by a newline (`\n`). The renderer reads stdin line-by-line and parses each line as JSON.

```json
{"schemaVersion":1,"event":"companion.activate","eventId":"evt-rest-1721500000","reason":"Timer entered rest phase","deadline":1721500600}
```

## Fields

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `schemaVersion` | integer | yes | Must be `1`. Messages with unknown versions are silently ignored. |
| `event` | string | yes | Must be one of: `companion.activate`, `companion.deactivate`, `companion.pause`. Unknown events are silently ignored. |
| `eventId` | string | no | Opaque unique identifier. If a previously-seen `eventId` is received, the message is treated as a no-op (idempotent). |
| `reason` | string | no | Human-readable diagnostic string. Not parsed by renderer. |
| `deadline` | number | no | Unix timestamp (seconds). Used for optional rest-phase deadline display. |

## Event Semantics

| Event | State Machine Effect |
|-------|---------------------|
| `companion.activate` | If `small` → begin `entering` transition. If `resting` with `isPaused=true` → set `isPaused=false`, resume from frozen frame. If already `resting`/`entering` → no-op. |
| `companion.deactivate` | If `entering`/`resting` → begin `exiting` transition. If already `small`/`exiting` → no-op. |
| `companion.pause` | If `resting` → set `isPaused=true`, freeze current frame. All other states → no-op. |

## Engine Status (isPaused)

The `isPaused` boolean is engine status output, not an event field. The renderer reports it in status responses to indicate the animation is frozen while the engine state remains `resting`.

## Error Handling

- Malformed JSON lines are silently discarded.
- Unknown fields are silently ignored (forward compatibility).
- If stdin closes (EOF), the renderer process terminates gracefully.

## Backward Compatibility

This protocol is new in 004. It is independent of and does not replace the existing 002/003 timer-state NDJSON protocol used by `fallback_panel.swift`. The existing protocol continues to operate for the tomato badge. The companion renderer uses a separate process with its own stdio channel.
