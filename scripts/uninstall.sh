#!/bin/zsh
set -e

TIMER_LABEL="io.github.codex-ultradian-rhythm"
COMPANION_LABEL="io.github.codex-pet-companion"
INSTALL_DIR="$HOME/.local/share/codex-ultradian-rhythm"
STATE_DIR="$HOME/.codex/ultradian-rhythm"
SKILL_DIR="$HOME/.codex/skills/ultradian-rhythm"
BIN_DIR="$HOME/.local/bin"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
TIMER_PLIST="$LAUNCH_AGENTS_DIR/$TIMER_LABEL.plist"
COMPANION_PLIST="$LAUNCH_AGENTS_DIR/$COMPANION_LABEL.plist"
UNINSTALL_STAGE="$HOME/.local/share/.codex-ultradian-rhythm.uninstall.$$"
LAUNCHCTL_BIN="${LAUNCHCTL_BIN:-/bin/launchctl}"

PURGE_STATE=0
for arg in "$@"; do
    case "$arg" in
        --purge-state) PURGE_STATE=1 ;;
        *) echo "Error: unknown argument: $arg" >&2; exit 1 ;;
    esac
done

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

if [ -z "$LAUNCHCTL_BIN" ] || [ ! -x "$LAUNCHCTL_BIN" ]; then
    echo "Error: LAUNCHCTL_BIN must be an executable absolute path: $LAUNCHCTL_BIN" >&2
    exit 1
fi
case "$LAUNCHCTL_BIN" in
    /*) ;;
    *) echo "Error: LAUNCHCTL_BIN must be absolute: $LAUNCHCTL_BIN" >&2; exit 1 ;;
esac

safe_rm_file() {
    local target="$1"
    case "$target" in
        "$COMPANION_PLIST"|"$TIMER_PLIST"|"$BIN_DIR/ultradian"|"$BIN_DIR/codex-pet-companion") ;;
        *) echo "Error: unauthorized file removal: $target" >&2; exit 1 ;;
    esac
    if [ -e "$target" ] || [ -L "$target" ]; then
        /bin/rm "$target"
    fi
}

safe_rm_dir() {
    local target="$1"
    case "$target" in
        "$SKILL_DIR"|"$STATE_DIR"|"$UNINSTALL_STAGE") ;;
        *) echo "Error: unauthorized directory removal: $target" >&2; exit 1 ;;
    esac
    if [ -d "$target" ]; then
        /bin/rm -r "$target"
    elif [ -e "$target" ] || [ -L "$target" ]; then
        /bin/rm "$target"
    fi
}

cleanup_uninstall() {
    local exit_code="$1"
    trap - EXIT
    safe_rm_dir "$UNINSTALL_STAGE" >/dev/null 2>&1 || true
    exit "$exit_code"
}
trap 'cleanup_uninstall $?' EXIT

bootout_plist() {
    local plist="$1"
    if [ -f "$plist" ]; then
        "$LAUNCHCTL_BIN" bootout "gui/$UID" "$plist" >/dev/null 2>&1 || true
    fi
}

if [ -x "$BIN_DIR/codex-pet-companion" ]; then
    "$BIN_DIR/codex-pet-companion" stop >/dev/null 2>&1 || true
fi
bootout_plist "$COMPANION_PLIST"
safe_rm_file "$COMPANION_PLIST"

bootout_plist "$TIMER_PLIST"
safe_rm_file "$TIMER_PLIST"

safe_rm_dir "$UNINSTALL_STAGE"
if [ -e "$INSTALL_DIR" ] || [ -L "$INSTALL_DIR" ]; then
    /bin/mv "$INSTALL_DIR" "$UNINSTALL_STAGE"
fi
safe_rm_dir "$UNINSTALL_STAGE"
safe_rm_file "$BIN_DIR/ultradian"
safe_rm_file "$BIN_DIR/codex-pet-companion"
safe_rm_dir "$SKILL_DIR"

if [ "$PURGE_STATE" -eq 1 ]; then
    safe_rm_dir "$STATE_DIR"
fi

echo "Uninstalled $COMPANION_LABEL and $TIMER_LABEL."
