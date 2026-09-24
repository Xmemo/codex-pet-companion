from dataclasses import dataclass, asdict
from typing import Optional, Literal, Dict

@dataclass
class Preset:
    key: str
    label: str
    work_seconds: int
    rest_seconds: int

    def to_dict(self) -> dict:
        return asdict(self)

PRESETS: Dict[str, Preset] = {
    "start": Preset("start", "Start 25/5", 1500, 300),
    "flow": Preset("flow", "Flow 50/10", 3000, 600),
    "deep": Preset("deep", "Deep 90/20", 5400, 1200),
}

@dataclass
class TimerState:
    schema_version: int = 2
    cycle_id: Optional[str] = None
    preset: Optional[str] = None
    status: Literal["idle", "running", "paused", "completed"] = "idle"
    phase: Literal["work", "rest", "none"] = "none"
    started_at: Optional[float] = None
    deadline: Optional[float] = None
    remaining_seconds: Optional[float] = None
    closure_notified: bool = False
    work_end_notified: bool = False
    rest_end_notified: bool = False
    last_error: Optional[str] = None
    # v2 fields
    intention_text: Optional[str] = None
    midpoint_notified: bool = False
    review_pending: bool = False

    def validate(self) -> None:
        """Validates state invariants. Raises ValueError if any invariant is violated."""
        if self.status == "idle":
            if self.phase != "none":
                raise ValueError("Idle state must have phase 'none'")
            if self.deadline is not None:
                raise ValueError("Idle state must not have a deadline")
            if self.remaining_seconds is not None:
                raise ValueError("Idle state must not have remaining_seconds")
        elif self.status == "running":
            if self.cycle_id is None:
                raise ValueError("Running state must have a cycle_id")
            if self.preset not in PRESETS:
                raise ValueError(f"Running state must have a valid preset, got {self.preset}")
            if self.phase not in ("work", "rest"):
                raise ValueError("Running state phase must be 'work' or 'rest'")
            if self.deadline is None:
                raise ValueError("Running state must have an absolute deadline")
            if self.remaining_seconds is not None:
                raise ValueError("Running state must not have remaining_seconds")
        elif self.status == "paused":
            if self.cycle_id is None:
                raise ValueError("Paused state must have a cycle_id")
            if self.preset not in PRESETS:
                raise ValueError(f"Paused state must have a valid preset, got {self.preset}")
            if self.phase not in ("work", "rest"):
                raise ValueError("Paused state phase must be 'work' or 'rest'")
            if self.remaining_seconds is None or self.remaining_seconds < 0:
                raise ValueError("Paused state must have non-negative remaining_seconds")
            if self.deadline is not None:
                raise ValueError("Paused state must not have a deadline")
        elif self.status == "completed":
            if self.phase != "none":
                raise ValueError("Completed state must have phase 'none'")
            if self.deadline is not None:
                raise ValueError("Completed state must not have a deadline")
            if self.remaining_seconds is not None:
                raise ValueError("Completed state must not have remaining_seconds")

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "TimerState":
        # Extract fields matching Dataclass fields, handle missing keys with defaults
        fields_dict = {}
        for f in cls.__dataclass_fields__.values():
            if f.name in data:
                fields_dict[f.name] = data[f.name]
        state = cls(**fields_dict)
        if state.schema_version < 2:
            state.schema_version = 2
        return state
