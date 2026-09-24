import os
import json
import time
from typing import Tuple
from .models import TimerState, Preset, PRESETS

STATE_DIR = os.path.expanduser("~/.codex/ultradian-rhythm")
STATE_PATH = os.path.join(STATE_DIR, "state.json")


def ensure_private_dir(directory: str) -> None:
    existed = os.path.isdir(directory)
    os.makedirs(directory, mode=0o700, exist_ok=True)
    if not existed or os.path.abspath(directory) == os.path.abspath(STATE_DIR):
        os.chmod(directory, 0o700)

class Storage:
    def __init__(self, path: str = STATE_PATH):
        self.path = path
        self.dir = os.path.dirname(self.path)

    def save(self, state: TimerState) -> None:
        """Saves the state atomically to the file, first validating it."""
        state.validate()
        if self.dir:
            ensure_private_dir(self.dir)
        temp_path = self.path + ".tmp"
        try:
            fd = os.open(temp_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
            os.fchmod(fd, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(state.to_dict(), f, indent=2, ensure_ascii=False)
            os.replace(temp_path, self.path)
        except Exception as e:
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass
            raise RuntimeError(f"Failed to save state atomically: {e}") from e

    def load(self) -> TimerState:
        """Loads state from the file. If corrupt or invalid, quarantines it and returns a clean idle state."""
        if not os.path.exists(self.path):
            return TimerState()

        try:
            with open(self.path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if not isinstance(data, dict):
                raise ValueError("State data must be a JSON object")
            state = TimerState.from_dict(data)
            state.validate()
            return state
        except Exception as e:
            # Quarantine the corrupt file
            corrupt_path = f"{self.path}.corrupt.{int(time.time())}"
            try:
                os.rename(self.path, corrupt_path)
            except Exception:
                # If rename fails, try to remove or leave it
                pass
            
            # Create a clean idle state with error details
            idle_state = TimerState()
            idle_state.last_error = f"Quarantined corrupt state: {str(e)}"
            try:
                self.save(idle_state)
            except Exception:
                pass
            return idle_state
