# Contract: CLI Command Interface (codex-pet-companion)

**Binary**: `codex-pet-companion`
**Version**: 1.0
**Platform**: macOS (primary)

---

## Commands

### `codex-pet-companion validate-pet <path>`

Offline validation of a pet package directory.

| Aspect | Specification |
|--------|---------------|
| **Arguments** | `<path>`: absolute or relative path to a pet package directory |
| **Exit code 0** | Package is valid: `pet.json` parses correctly (id, displayName, description, spritesheetPath), atlas image exists with width 1536, height divisible by 208 and ≥1872, columns=8 and rows≥9 derived, optional `companion.json` passes schema and path security validation |
| **Exit code 1** | Package is invalid: stdout contains structured error report with specific failure reasons |
| **stdout** | JSON: `{"valid": true, "pet": "<id>", "atlasRows": <n>, "companionJson": true|false}` on success; `{"valid": false, "errors": [...]}` on failure |
| **Network** | None |
| **Disk writes** | None |

### `codex-pet-companion preview --pet <id> --state enter|rest|exit`

Standalone preview window for a specific animation state.

| Aspect | Specification |
|--------|---------------|
| **Flags** | `--pet <id>`: pet identifier (loads from `~/.codex/pets/<id>/`); `--state enter|rest|exit`: which clip to preview |
| **Behavior** | Opens a standalone transparent AppKit window showing the requested animation clip. If pet anchor is not found via CGWindowList, enters draggable preview mode. Window closes on Ctrl+C / SIGTERM. |
| **Exit code 0** | Normal termination |
| **Exit code 1** | Pet not found or assets invalid |
| **Network** | None |

### `codex-pet-companion start`

Start the companion animation engine daemon.

| Aspect | Specification |
|--------|---------------|
| **Behavior** | Launches the Node.js bridge process which: reads `selected-avatar-id`, loads pet assets, compiles Swift renderer (if needed), spawns renderer subprocess, connects to existing ultradian daemon via `daemon.sock`, and begins listening for state transitions. |
| **Prerequisites** | Existing ultradian rhythm daemon must be running (`daemon.sock` accessible). |
| **Exit code 0** | Engine started successfully |
| **Exit code 1** | Failed (daemon not running, pet unavailable, Swift compilation failed) |
| **Idempotency** | If already running, reports current status and exits 0. |

### `codex-pet-companion stop`

Stop the companion animation engine.

| Aspect | Specification |
|--------|---------------|
| **Behavior** | Sends SIGTERM to the companion bridge process (identified by PID file). Validates PID ownership before killing. |
| **Exit code 0** | Engine stopped or was not running |
| **Idempotency** | Safe to call multiple times. |

### `codex-pet-companion status`

Query engine status.

| Aspect | Specification |
|--------|---------------|
| **stdout** | Human-readable status summary by default. With `--json` flag: JSON object per data-model §6. |
| **Exit code 0** | Status retrieved (engine may be running or stopped) |

### `codex-pet-companion config set pet auto|<id>`

Override the active pet binding.

| Aspect | Specification |
|--------|---------------|
| **`auto`** | Restore default behavior: read `selected-avatar-id` on next start. |
| **`<id>`** | Force engine to use specific pet ID, overriding auto-detection. Persisted to `~/.codex/ultradian-rhythm/companion-config.json`. |
| **Exit code 0** | Configuration updated |
| **Exit code 1** | Invalid pet ID (not found in `~/.codex/pets/`) |

---

## Common Rules

1. No command establishes network connections.
2. No command reads or modifies `ChatGPT.app` internals.
3. All commands exit with non-zero on unrecoverable errors and print diagnostics to stderr.
4. All commands are safe to run while the existing `ultradian` timer is active — they do not modify timer state or daemon behavior.
