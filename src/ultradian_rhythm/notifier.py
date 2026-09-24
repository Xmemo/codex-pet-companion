import subprocess
import sys
from typing import Optional, List, Dict, Any

class BaseNotifier:
    def notify(self, title: str, subtitle: str, message: str, sound: Optional[str] = "Glass") -> bool:
        """Sends a notification. Returns True if successful, False otherwise."""
        raise NotImplementedError()

class MacNotifier(BaseNotifier):
    def notify(self, title: str, subtitle: str, message: str, sound: Optional[str] = "Glass") -> bool:
        """Uses osascript to display a macOS system notification with sound."""
        escaped_title = title.replace('"', '\\"')
        escaped_subtitle = subtitle.replace('"', '\\"')
        escaped_message = message.replace('"', '\\"')
        
        script = f'display notification "{escaped_message}" with title "{escaped_title}"'
        if escaped_subtitle:
            script += f' subtitle "{escaped_subtitle}"'
        if sound:
            script += f' sound name "{sound}"'
            
        cmd = ["osascript", "-e", script]
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
            if res.returncode == 0:
                return True
            else:
                sys.stderr.write(f"MacNotifier osascript failure: {res.stderr.strip()}\n")
                return False
        except Exception as e:
            sys.stderr.write(f"MacNotifier exception: {e}\n")
            return False

class FakeNotifier(BaseNotifier):
    def __init__(self) -> None:
        self.notifications: List[Dict[str, Any]] = []

    def notify(self, title: str, subtitle: str, message: str, sound: Optional[str] = "Glass") -> bool:
        """Appends notification to an in-memory list for testing."""
        self.notifications.append({
            "title": title,
            "subtitle": subtitle,
            "message": message,
            "sound": sound
        })
        return True
