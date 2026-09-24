#!/bin/zsh
set -e

TIMER_LABEL="io.github.codex-ultradian-rhythm"
COMPANION_LABEL="io.github.codex-pet-companion"
INSTALL_DIR="$HOME/.local/share/codex-ultradian-rhythm"
STATE_DIR="$HOME/.codex/ultradian-rhythm"
BIN_DIR="$HOME/.local/bin"
SKILL_DIR="$HOME/.codex/skills/ultradian-rhythm"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
TIMER_PLIST="$LAUNCH_AGENTS_DIR/$TIMER_LABEL.plist"
COMPANION_PLIST="$LAUNCH_AGENTS_DIR/$COMPANION_LABEL.plist"

SCRIPT_DIR="${0:A:h}"
REPO_ROOT="${SCRIPT_DIR:h}"

LAUNCHCTL_BIN="${LAUNCHCTL_BIN:-/bin/launchctl}"
PYTHON_BIN="${PYTHON_BIN:-$(command -v python3 2>/dev/null || true)}"
NODE_BIN="${NODE_BIN:-}"
XCRUN_BIN="${XCRUN_BIN:-/usr/bin/xcrun}"
CHATGPT_NODE_BIN_CANDIDATE="${CHATGPT_NODE_BIN_CANDIDATE:-/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node}"
CODEX_NODE_BIN_CANDIDATE="${CODEX_NODE_BIN_CANDIDATE:-/Applications/Codex.app/Contents/Resources/cua_node/bin/node}"
VERIFY_ATTEMPTS="${VERIFY_ATTEMPTS:-200}"
VERIFY_DELAY="${VERIFY_DELAY:-0.2}"

resolve_system_home() {
    local username
    username="$(/usr/bin/id -un)"
    /usr/bin/dscl . -read "/Users/$username" NFSHomeDirectory 2>/dev/null | /usr/bin/awk '{print $2}'
}

REAL_HOME="${CODEX_INSTALL_REAL_HOME:-$(resolve_system_home)}"
if [ -z "$REAL_HOME" ]; then
    echo "Error: unable to determine the current UID system home." >&2
    exit 1
fi
if [ "$HOME" != "$REAL_HOME" ] && [ "${ALLOW_NONSTANDARD_HOME:-0}" != "1" ]; then
    echo "Error: HOME ($HOME) does not match the current UID system home ($REAL_HOME)." >&2
    exit 1
fi

case "$VERIFY_ATTEMPTS" in
    ''|*[!0-9]*|0) echo "Error: VERIFY_ATTEMPTS must be a positive integer." >&2; exit 1 ;;
esac
if [[ "$VERIFY_DELAY" != <-> && "$VERIFY_DELAY" != <->.<-> ]]; then
    echo "Error: VERIFY_DELAY must be a non-negative number." >&2
    exit 1
fi

if [ -z "$NODE_BIN" ]; then
    for candidate in "$CHATGPT_NODE_BIN_CANDIDATE" "$CODEX_NODE_BIN_CANDIDATE"; do
        if [ -x "$candidate" ]; then
            NODE_BIN="$candidate"
            break
        fi
    done
fi
if [ -z "$NODE_BIN" ]; then
    NODE_BIN="$(command -v node 2>/dev/null || true)"
fi

require_executable() {
    local name="$1"
    local value="$2"
    if [ -z "$value" ] || [ ! -x "$value" ]; then
        echo "Error: $name must be an executable absolute path: $value" >&2
        exit 1
    fi
    case "$value" in
        /*) ;;
        *) echo "Error: $name must be absolute: $value" >&2; exit 1 ;;
    esac
}

require_executable LAUNCHCTL_BIN "$LAUNCHCTL_BIN"
require_executable PYTHON_BIN "$PYTHON_BIN"
require_executable NODE_BIN "$NODE_BIN"
require_executable XCRUN_BIN "$XCRUN_BIN"

if ! PYTHON_VERSION_OUTPUT="$("$PYTHON_BIN" -V 2>&1)" || [ -z "$PYTHON_VERSION_OUTPUT" ]; then
    echo "Error: PYTHON_BIN must be Python 3.11 or newer: failed to obtain version from $PYTHON_BIN" >&2
    exit 1
fi
if [[ "$PYTHON_VERSION_OUTPUT" =~ ^[[:space:]]*(Python[[:space:]]+)?([0-9]+)\.([0-9]+) ]]; then
    python_major="${match[2]}"
    python_minor="${match[3]}"
    if ! (( python_major > 3 || (python_major == 3 && python_minor >= 11) )); then
        echo "Error: PYTHON_BIN must be Python 3.11 or newer (found Python $python_major.$python_minor at $PYTHON_BIN)." >&2
        exit 1
    fi
else
    echo "Error: PYTHON_BIN must be Python 3.11 or newer: unable to parse version output from $PYTHON_BIN ($PYTHON_VERSION_OUTPUT)." >&2
    exit 1
fi

LEGACY_CONFIGURED=0
if [ -n "${LEGACY_TIMER_LABEL:-}" ] || [ -n "${LEGACY_TIMER_PLIST:-}" ]; then
    if [ -z "${LEGACY_TIMER_LABEL:-}" ] || [ -z "${LEGACY_TIMER_PLIST:-}" ]; then
        echo "Error: LEGACY_TIMER_LABEL and LEGACY_TIMER_PLIST must be provided together." >&2
        exit 1
    fi
    case "$LEGACY_TIMER_LABEL" in
        *[!A-Za-z0-9._-]*) echo "Error: LEGACY_TIMER_LABEL contains unsafe characters." >&2; exit 1 ;;
    esac
    if [ ! -f "$LEGACY_TIMER_PLIST" ] || [ -L "$LEGACY_TIMER_PLIST" ]; then
        echo "Error: LEGACY_TIMER_PLIST must be a regular, non-symlink plist file." >&2
        exit 1
    fi
    case "$LEGACY_TIMER_PLIST" in
        *.plist) ;;
        *) echo "Error: LEGACY_TIMER_PLIST must end in .plist." >&2; exit 1 ;;
    esac
    LEGACY_TIMER_PLIST="${LEGACY_TIMER_PLIST:A}"
    LEGACY_PARENT="$(/usr/bin/dirname "$LEGACY_TIMER_PLIST")"
    LAUNCH_AGENTS_REAL="${LAUNCH_AGENTS_DIR:A}"
    if [ "$LEGACY_PARENT" != "$LAUNCH_AGENTS_REAL" ]; then
        echo "Error: LEGACY_TIMER_PLIST must be directly inside $LAUNCH_AGENTS_DIR." >&2
        exit 1
    fi
    LEGACY_CONFIGURED=1
fi

LEGACY_OVERLAY_CONFIGURED=0
if [ -n "${LEGACY_OVERLAY_LABEL:-}" ] || [ -n "${LEGACY_OVERLAY_PLIST:-}" ] || [ -n "${LEGACY_OVERLAY_PAYLOAD:-}" ]; then
    if [ -z "${LEGACY_OVERLAY_LABEL:-}" ] || [ -z "${LEGACY_OVERLAY_PLIST:-}" ]; then
        echo "Error: LEGACY_OVERLAY_LABEL and LEGACY_OVERLAY_PLIST must be provided together." >&2
        exit 1
    fi
    case "$LEGACY_OVERLAY_LABEL" in
        *[!A-Za-z0-9._-]*) echo "Error: LEGACY_OVERLAY_LABEL contains unsafe characters." >&2; exit 1 ;;
    esac
    if [ ! -f "$LEGACY_OVERLAY_PLIST" ] || [ -L "$LEGACY_OVERLAY_PLIST" ]; then
        echo "Error: LEGACY_OVERLAY_PLIST must be a regular, non-symlink plist file." >&2
        exit 1
    fi
    case "$LEGACY_OVERLAY_PLIST" in
        *.plist) ;;
        *) echo "Error: LEGACY_OVERLAY_PLIST must end in .plist." >&2; exit 1 ;;
    esac
    LEGACY_OVERLAY_PLIST="${LEGACY_OVERLAY_PLIST:A}"
    LEGACY_OVERLAY_PARENT="$(/usr/bin/dirname "$LEGACY_OVERLAY_PLIST")"
    LAUNCH_AGENTS_REAL="${LAUNCH_AGENTS_DIR:A}"
    if [ "$LEGACY_OVERLAY_PARENT" != "$LAUNCH_AGENTS_REAL" ]; then
        echo "Error: LEGACY_OVERLAY_PLIST must be directly inside $LAUNCH_AGENTS_DIR." >&2
        exit 1
    fi
    if [ -n "${LEGACY_OVERLAY_PAYLOAD:-}" ]; then
        if [ -L "$LEGACY_OVERLAY_PAYLOAD" ]; then
            echo "Error: LEGACY_OVERLAY_PAYLOAD must not be a symlink." >&2
            exit 1
        fi
        LEGACY_OVERLAY_PAYLOAD="${LEGACY_OVERLAY_PAYLOAD:A}"
        legacy_overlay_share_canon="$HOME/.local/share"
        legacy_overlay_share_canon="${legacy_overlay_share_canon:A}"
        case "$LEGACY_OVERLAY_PAYLOAD" in
            "$legacy_overlay_share_canon/"*) ;;
            *) echo "Error: LEGACY_OVERLAY_PAYLOAD must be under ~/.local/share." >&2; exit 1 ;;
        esac
        if [ ! -d "$LEGACY_OVERLAY_PAYLOAD" ]; then
            echo "Error: LEGACY_OVERLAY_PAYLOAD does not exist or is not a directory." >&2
            exit 1
        fi
    fi
    LEGACY_OVERLAY_CONFIGURED=1
fi

STAGE_DIR="$INSTALL_DIR/.stage.$$"
BACKUP_DIR="$INSTALL_DIR/.backup.$$"
PAYLOAD_TRANSACTION_ACTIVE=0
NEW_SRC_ACTIVE=0
NEW_BIN_ACTIVE=0
OLD_SRC_BACKED_UP=0
OLD_BIN_BACKED_UP=0

remove_transaction_path() {
    local target="$1"
    case "$target" in
        "$STAGE_DIR"|"$BACKUP_DIR"|"$INSTALL_DIR/src"|"$INSTALL_DIR/bin") ;;
        *) echo "Error: unauthorized transaction cleanup: $target" >&2; return 1 ;;
    esac
    if [ -d "$target" ]; then
        /bin/rm -r "$target"
    elif [ -e "$target" ] || [ -L "$target" ]; then
        /bin/rm "$target"
    fi
}

cleanup_install() {
    local exit_code="$1"
    local restore_failed=0
    trap - EXIT

    if [ "$PAYLOAD_TRANSACTION_ACTIVE" -eq 1 ]; then
        if [ "$NEW_SRC_ACTIVE" -eq 1 ]; then
            remove_transaction_path "$INSTALL_DIR/src" >/dev/null 2>&1 || restore_failed=1
        fi
        if [ "$NEW_BIN_ACTIVE" -eq 1 ]; then
            remove_transaction_path "$INSTALL_DIR/bin" >/dev/null 2>&1 || restore_failed=1
        fi
        if [ "$OLD_SRC_BACKED_UP" -eq 1 ] && [ -e "$BACKUP_DIR/src" ]; then
            /bin/mv "$BACKUP_DIR/src" "$INSTALL_DIR/src" >/dev/null 2>&1 || restore_failed=1
        fi
        if [ "$OLD_BIN_BACKED_UP" -eq 1 ] && [ -e "$BACKUP_DIR/bin" ]; then
            /bin/mv "$BACKUP_DIR/bin" "$INSTALL_DIR/bin" >/dev/null 2>&1 || restore_failed=1
        fi
    fi

    remove_transaction_path "$STAGE_DIR" >/dev/null 2>&1 || true
    if [ "$restore_failed" -eq 0 ]; then
        remove_transaction_path "$BACKUP_DIR" >/dev/null 2>&1 || true
    else
        echo "Error: payload restoration was incomplete; preserved backup at $BACKUP_DIR." >&2
    fi
    exit "$exit_code"
}
trap 'cleanup_install $?' EXIT

safe_rm_file() {
    local target="$1"
    case "$target" in
        "$BIN_DIR/ultradian"|"$BIN_DIR/codex-pet-companion"|"$TIMER_PLIST"|"$COMPANION_PLIST") ;;
        *) echo "Error: unauthorized file removal: $target" >&2; exit 1 ;;
    esac
    if [ -e "$target" ] || [ -L "$target" ]; then
        /bin/rm "$target"
    fi
}

render_plist() {
    local template="$1"
    local output="$2"
    /usr/bin/sed \
        -e "s|{{HOME}}|$HOME|g" \
        -e "s|{{INSTALL_DIR}}|$INSTALL_DIR|g" \
        -e "s|{{PYTHON_BIN}}|$PYTHON_BIN|g" \
        -e "s|{{NODE_BIN}}|$NODE_BIN|g" \
        "$template" > "$output"
    /bin/chmod 644 "$output"
}

launch_bootout_plist() {
    local plist="$1"
    "$LAUNCHCTL_BIN" bootout "gui/$UID" "$plist" >/dev/null 2>&1 || true
}

launch_bootstrap_plist() {
    local plist="$1"
    "$LAUNCHCTL_BIN" bootstrap "gui/$UID" "$plist"
}

launch_kickstart_label() {
    local label="$1"
    "$LAUNCHCTL_BIN" kickstart -k "gui/$UID/$label"
}

verify_timer() {
    local attempt=1
    while [ "$attempt" -le "$VERIFY_ATTEMPTS" ]; do
        if "$BIN_DIR/ultradian" status --json >/dev/null 2>&1; then
            return 0
        fi
        if [ "$attempt" -lt "$VERIFY_ATTEMPTS" ] && [ "$VERIFY_DELAY" != "0" ]; then
            /bin/sleep "$VERIFY_DELAY"
        fi
        attempt=$((attempt + 1))
    done
    return 1
}

verify_companion() {
    local attempt=1
    local status_json
    while [ "$attempt" -le "$VERIFY_ATTEMPTS" ]; do
        if status_json="$("$BIN_DIR/codex-pet-companion" status --json 2>/dev/null)"; then
            if echo "$status_json" | "$NODE_BIN" -e 'const fs=require("fs"); try { const d=JSON.parse(fs.readFileSync(0,"utf-8")); process.exit(["small","entering","resting","exiting"].includes(d.engineState) && d.error === null ? 0 : 1); } catch(e) { process.exit(1); }' >/dev/null 2>&1; then
                return 0
            fi
        fi
        if [ "$attempt" -lt "$VERIFY_ATTEMPTS" ] && [ "$VERIFY_DELAY" != "0" ]; then
            /bin/sleep "$VERIFY_DELAY"
        fi
        attempt=$((attempt + 1))
    done
    return 1
}

rollback_legacy() {
    if [ "$LEGACY_CONFIGURED" -eq 1 ] && [ -f "$LEGACY_TIMER_PLIST" ]; then
        "$LAUNCHCTL_BIN" bootstrap "gui/$UID" "$LEGACY_TIMER_PLIST" >/dev/null 2>&1 || true
        "$LAUNCHCTL_BIN" kickstart -k "gui/$UID/$LEGACY_TIMER_LABEL" >/dev/null 2>&1 || true
    fi
}

fail_timer_startup() {
    local message="$1"
    launch_bootout_plist "$TIMER_PLIST"
    rollback_legacy
    echo "Error: $message" >&2
    exit 1
}

fail_companion_startup() {
    local message="$1"
    launch_bootout_plist "$COMPANION_PLIST"
    echo "Error: $message" >&2
    exit 1
}

/bin/mkdir -p "$INSTALL_DIR" "$BIN_DIR" "$SKILL_DIR" "$LAUNCH_AGENTS_DIR" "$STATE_DIR"
/bin/chmod 700 "$STATE_DIR"
for private_file in "$STATE_DIR"/state.json "$STATE_DIR"/state.json.tmp "$STATE_DIR"/sessions.sqlite "$STATE_DIR"/sessions.sqlite-wal "$STATE_DIR"/sessions.sqlite-shm "$STATE_DIR"/state.json.corrupt.*(N); do
    if [ -f "$private_file" ] && [ ! -L "$private_file" ]; then
        /bin/chmod 600 "$private_file"
    fi
done
remove_transaction_path "$STAGE_DIR"
remove_transaction_path "$BACKUP_DIR"
/bin/mkdir -p "$STAGE_DIR"

/bin/cp -R "$REPO_ROOT/src" "$STAGE_DIR/src"
/bin/mkdir -p "$STAGE_DIR/bin"
/bin/cp "$REPO_ROOT/bin/codex-pet-companion.js" "$STAGE_DIR/bin/codex-pet-companion.js"
/bin/chmod +x "$STAGE_DIR/bin/codex-pet-companion.js"
"$XCRUN_BIN" swiftc -O -o "$STAGE_DIR/bin/companion_renderer" "$REPO_ROOT/src/companion_renderer.swift" "$REPO_ROOT/src/timer_panel.swift"

launch_bootout_plist "$COMPANION_PLIST"
if [ -x "$BIN_DIR/codex-pet-companion" ]; then
    if ! "$BIN_DIR/codex-pet-companion" stop; then
        fail_companion_startup "companion stop failed."
    fi
else
    if ! "$NODE_BIN" "$STAGE_DIR/bin/codex-pet-companion.js" stop; then
        fail_companion_startup "companion stop failed."
    fi
fi

/bin/mkdir -p "$BACKUP_DIR"
PAYLOAD_TRANSACTION_ACTIVE=1
if [ -e "$INSTALL_DIR/src" ] || [ -L "$INSTALL_DIR/src" ]; then
    /bin/mv "$INSTALL_DIR/src" "$BACKUP_DIR/src"
    OLD_SRC_BACKED_UP=1
fi
if [ -e "$INSTALL_DIR/bin" ] || [ -L "$INSTALL_DIR/bin" ]; then
    /bin/mv "$INSTALL_DIR/bin" "$BACKUP_DIR/bin"
    OLD_BIN_BACKED_UP=1
fi
/bin/mv "$STAGE_DIR/src" "$INSTALL_DIR/src"
NEW_SRC_ACTIVE=1
/bin/mv "$STAGE_DIR/bin" "$INSTALL_DIR/bin"
NEW_BIN_ACTIVE=1
PAYLOAD_TRANSACTION_ACTIVE=0
remove_transaction_path "$BACKUP_DIR"
/bin/rmdir "$STAGE_DIR"

/bin/cat > "$BIN_DIR/ultradian" <<EOF
#!/bin/zsh
export HOME="$HOME"
export PYTHONPATH="$INSTALL_DIR/src"
exec "$PYTHON_BIN" -m ultradian_rhythm.cli "\$@"
EOF
/bin/chmod +x "$BIN_DIR/ultradian"

/bin/cat > "$BIN_DIR/codex-pet-companion" <<EOF
#!/bin/zsh
export HOME="$HOME"
exec "$NODE_BIN" "$INSTALL_DIR/bin/codex-pet-companion.js" "\$@"
EOF
/bin/chmod +x "$BIN_DIR/codex-pet-companion"

/bin/cp "$REPO_ROOT/packaging/skill/SKILL.md" "$SKILL_DIR/SKILL.md"
render_plist "$REPO_ROOT/packaging/io.github.codex-ultradian-rhythm.plist" "$TIMER_PLIST"
render_plist "$REPO_ROOT/packaging/io.github.codex-pet-companion.plist" "$COMPANION_PLIST"

if [ "$LEGACY_CONFIGURED" -eq 1 ]; then
    "$LAUNCHCTL_BIN" bootout "gui/$UID" "$LEGACY_TIMER_PLIST" >/dev/null 2>&1 || true
fi

launch_bootout_plist "$TIMER_PLIST"
if ! launch_bootstrap_plist "$TIMER_PLIST"; then
    fail_timer_startup "timer service bootstrap failed."
fi
if ! launch_kickstart_label "$TIMER_LABEL"; then
    fail_timer_startup "timer service kickstart failed."
fi
if ! verify_timer; then
    fail_timer_startup "timer service status verification failed."
fi

if [ "$LEGACY_CONFIGURED" -eq 1 ]; then
    /bin/rm "$LEGACY_TIMER_PLIST"
fi

if ! launch_bootstrap_plist "$COMPANION_PLIST"; then
    fail_companion_startup "companion service bootstrap failed."
fi
if ! launch_kickstart_label "$COMPANION_LABEL"; then
    fail_companion_startup "companion service kickstart failed."
fi
if ! verify_companion; then
    fail_companion_startup "companion service status verification failed."
fi

if [ "$LEGACY_OVERLAY_CONFIGURED" -eq 1 ]; then
    overlay_backup_dir="$STATE_DIR/legacy-overlay-backups"
    /bin/mkdir -p "$overlay_backup_dir"
    overlay_backup_file="${overlay_backup_dir}/${LEGACY_OVERLAY_LABEL}.$(/bin/date +%s).$$.plist"
    if ! /bin/cp "$LEGACY_OVERLAY_PLIST" "$overlay_backup_file"; then
        echo "Error: failed to backup legacy overlay plist." >&2
        exit 1
    fi
    if "$LAUNCHCTL_BIN" print "gui/$UID/$LEGACY_OVERLAY_LABEL" >/dev/null 2>&1; then
        if ! "$LAUNCHCTL_BIN" bootout "gui/$UID" "$LEGACY_OVERLAY_PLIST"; then
            echo "Error: failed to bootout legacy overlay." >&2
            exit 1
        fi
    fi
    /bin/rm "$LEGACY_OVERLAY_PLIST"
fi

echo "Installed $TIMER_LABEL and $COMPANION_LABEL."
