import unittest
import os
import tempfile
from src.ultradian_rhythm.models import TimerState, PRESETS
from src.ultradian_rhythm.storage import Storage
from src.ultradian_rhythm.notifier import FakeNotifier
from src.ultradian_rhythm.engine import TimerEngine

class TestTimerRecovery(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.state_path = os.path.join(self.temp_dir.name, "state.json")
        self.storage = Storage(self.state_path)
        self.notifier = FakeNotifier()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_recovery_mid_work(self) -> None:
        # Initialize DB and create session first
        db_path = os.path.join(self.temp_dir.name, "sessions.sqlite")
        from src.ultradian_rhythm.history import HistoryManager
        mgr = HistoryManager(db_path)
        mgr.init_db()
        mgr.create_session("test-cycle-123", "flow", "Restore test", 3000, 600, 1000.0)

        # Simulate state saved while running work
        state = TimerState(
            cycle_id="test-cycle-123",
            preset="flow",
            status="running",
            phase="work",
            started_at=1000.0,
            deadline=4000.0,  # 3000s duration
            closure_notified=False,
            work_end_notified=False,
            rest_end_notified=False
        )
        self.storage.save(state)

        # Reboot engine at time 2000 (still in work phase, no events yet)
        engine = TimerEngine(self.storage, self.notifier, time_func=lambda: 2000.0)
        self.assertEqual(engine.state.phase, "work")
        self.assertEqual(engine.state.status, "running")

        # Tick at 2000 -> no transitions, no notifications
        changed = engine.tick(2000.0)
        self.assertFalse(changed)
        self.assertEqual(len(self.notifier.notifications), 0)

    def test_recovery_after_work_deadline(self) -> None:
        # Initialize DB and create session first
        db_path = os.path.join(self.temp_dir.name, "sessions.sqlite")
        from src.ultradian_rhythm.history import HistoryManager
        mgr = HistoryManager(db_path)
        mgr.init_db()
        mgr.create_session("test-cycle-123", "flow", "Restore test", 3000, 600, 1000.0)

        # State saved during work, but service was down when deadline passed
        state = TimerState(
            cycle_id="test-cycle-123",
            preset="flow",
            status="running",
            phase="work",
            started_at=1000.0,
            deadline=4000.0,
            closure_notified=False,
            work_end_notified=False,
            rest_end_notified=False
        )
        self.storage.save(state)

        # Reboot engine at time 4200 (work ends at 4000, rest ends at 4000 + 600 = 4600)
        # So we should recover into rest phase
        engine = TimerEngine(self.storage, self.notifier, time_func=lambda: 4200.0)

        # Initial loaded state is what was in file
        self.assertEqual(engine.state.phase, "work")

        # Calling tick should process the transition
        changed = engine.tick(4200.0)
        self.assertTrue(changed)
        self.assertEqual(engine.state.phase, "rest")
        self.assertEqual(engine.state.deadline, 4600.0)
        self.assertTrue(engine.state.work_end_notified)

        # No notifications sent as they were removed
        self.assertEqual(len(self.notifier.notifications), 0)

        # Further ticks at 4250 should do nothing
        changed = engine.tick(4250.0)
        self.assertFalse(changed)
        self.assertEqual(len(self.notifier.notifications), 0)

    def test_recovery_after_full_cycle_expired(self) -> None:
        # Initialize DB and create session first
        db_path = os.path.join(self.temp_dir.name, "sessions.sqlite")
        from src.ultradian_rhythm.history import HistoryManager
        mgr = HistoryManager(db_path)
        mgr.init_db()
        mgr.create_session("test-cycle-123", "flow", "Restore test", 3000, 600, 1000.0)

        # State saved during work, but service down until after rest ended
        state = TimerState(
            cycle_id="test-cycle-123",
            preset="flow",
            status="running",
            phase="work",
            started_at=1000.0,
            deadline=4000.0,
            closure_notified=False,
            work_end_notified=False,
            rest_end_notified=False
        )
        self.storage.save(state)

        # Reboot at 5000 (both work and rest deadlines exceeded)
        engine = TimerEngine(self.storage, self.notifier, time_func=lambda: 5000.0)
        changed = engine.tick(5000.0)
        self.assertTrue(changed)
        self.assertEqual(engine.state.status, "completed")
        self.assertEqual(engine.state.phase, "none")

        # No notifications sent as they were removed
        self.assertEqual(len(self.notifier.notifications), 0)

    def test_midpoint_derivation_pause_resume(self) -> None:
        # Initialize DB and create session first
        db_path = os.path.join(self.temp_dir.name, "sessions.sqlite")
        from src.ultradian_rhythm.history import HistoryManager
        mgr = HistoryManager(db_path)
        mgr.init_db()
        mgr.create_session("test-cycle-123", "flow", "Restore test", 3000, 600, 1000.0)

        # Start a flow cycle (3000s work, midpoint at 1500s)
        state = TimerState(
            schema_version=2,
            cycle_id="test-cycle-123",
            preset="flow",
            status="running",
            phase="work",
            started_at=1000.0,
            deadline=4000.0,
            intention_text="Write tests",
            midpoint_notified=False,
            work_end_notified=False,
            rest_end_notified=False
        )
        self.storage.save(state)
        engine = TimerEngine(self.storage, self.notifier, time_func=lambda: 1500.0)

        # Pause at time 1500.0 (500s of work elapsed)
        # Remaining work: 2500s. Midpoint should be at remaining = 1500s, i.e., 1000s into the remaining time.
        engine.pause_cycle()
        self.assertEqual(engine.state.remaining_seconds, 2500.0)
        self.assertFalse(engine.state.midpoint_notified)

        # Resume at time 2000.0
        # New deadline: 2000.0 + 2500.0 = 4500.0.
        # Derived midpoint time should be 4500.0 - 1500.0 = 3000.0 (1000s after resume time 2000.0).
        engine.time_func = lambda: 2000.0
        engine.resume_cycle()
        self.assertEqual(engine.state.deadline, 4500.0)
        self.assertEqual(engine.get_next_event_time(), 3000.0)

        # Tick at 2999.0 -> no midpoint yet
        engine.time_func = lambda: 2999.0
        self.assertFalse(engine.tick(2999.0))
        self.assertFalse(engine.state.midpoint_notified)

        # Tick at 3000.0 -> midpoint notified
        engine.time_func = lambda: 3000.0
        self.assertTrue(engine.tick(3000.0))
        self.assertTrue(engine.state.midpoint_notified)
        self.assertEqual(engine.get_next_event_time(), 4500.0)

    def test_midpoint_recovery_sleep_idempotent(self) -> None:
        # Start a flow cycle via engine first so the session exists in DB
        engine = TimerEngine(self.storage, self.notifier, time_func=lambda: 1000.0)
        engine.start_cycle("flow", intention_text="Write tests")

        # Now mock the state to simulate sleeping past work deadline
        state = engine.state
        state.midpoint_notified = False
        state.work_end_notified = False
        state.rest_end_notified = False
        state.deadline = 4000.0
        self.storage.save(state)

        # Wake up at 4200.0. The tick should transition to rest.
        engine = TimerEngine(self.storage, self.notifier, time_func=lambda: 4200.0)
        changed = engine.tick(4200.0)
        self.assertTrue(changed)
        self.assertEqual(engine.state.phase, "rest")
        self.assertFalse(engine.state.midpoint_notified)  # False because we slept past work deadline
        self.assertEqual(engine.state.deadline, 4600.0)

        # Verify the database has the work_end event
        history = engine.history_mgr.get_history(limit=10)
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["id"], state.cycle_id)
        self.assertIsNotNone(history[0]["work_ended_at"])

    def test_legacy_current_session_bootstrap(self) -> None:
        # 1. State contains legacy running session of schema_version 1
        v1_data = {
            "schema_version": 1,
            "cycle_id": "legacy-cycle-pomodoro-123",
            "preset": "start",
            "status": "running",
            "phase": "work",
            "started_at": 1000.0,
            "deadline": 2500.0,
            "closure_notified": False,
            "work_end_notified": False,
            "rest_end_notified": False
        }
        state = TimerState.from_dict(v1_data)
        self.storage.save(state)

        # 2. Engine init succeeds. Legacy session is bootstrapped.
        engine = TimerEngine(self.storage, self.notifier, time_func=lambda: 1200.0)
        self.assertEqual(engine.state.cycle_id, "legacy-cycle-pomodoro-123")
        self.assertEqual(engine.state.preset, "start")
        self.assertEqual(engine.state.status, "running")

        # Verify db has the legacy session
        history = engine.history_mgr.get_history()
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["id"], "legacy-cycle-pomodoro-123")
        self.assertEqual(history[0]["preset"], "start")

        # Verify legacy_import event exists in DB
        conn = engine.history_mgr._get_read_only_conn()
        cursor = conn.execute("SELECT event_type FROM session_events WHERE session_id=?", ("legacy-cycle-pomodoro-123",))
        events = [r[0] for r in cursor.fetchall()]
        self.assertIn("legacy_import", events)
        conn.close()

        # 3. Subsequent pause succeeds
        engine.time_func = lambda: 1200.0
        engine.pause_cycle()
        self.assertEqual(engine.state.status, "paused")

        # 4. Subsequent replacement succeeds
        engine.time_func = lambda: 1300.0
        engine.start_cycle("flow", replace=True, intention_text="New replacement")
        self.assertEqual(engine.state.preset, "flow")
        self.assertEqual(engine.state.status, "running")
        self.assertEqual(engine.state.intention_text, "New replacement")

        # Verify history now has exactly two sessions: the legacy one and the replacement one
        history2 = engine.history_mgr.get_history()
        self.assertEqual(len(history2), 2)
        # Order by started_at DESC, so the replacement one is first
        self.assertEqual(history2[0]["preset"], "flow")
        self.assertEqual(history2[1]["id"], "legacy-cycle-pomodoro-123")

        # 5. Restarting engine does not duplicate import
        engine_restarted = TimerEngine(self.storage, self.notifier, time_func=lambda: 1400.0)
        history3 = engine_restarted.history_mgr.get_history()
        self.assertEqual(len(history3), 2)

        # Verify count of events is correct
        conn = engine_restarted.history_mgr._get_read_only_conn()
        cursor = conn.execute("SELECT count(*) FROM session_events WHERE session_id=? AND event_type='legacy_import'", ("legacy-cycle-pomodoro-123",))
        self.assertEqual(cursor.fetchone()[0], 1)
        conn.close()

    def test_legacy_bootstrap_db_write_failure(self) -> None:
        # Create legacy state
        v1_data = {
            "schema_version": 1,
            "cycle_id": "legacy-cycle-fail-123",
            "preset": "start",
            "status": "running",
            "phase": "work",
            "started_at": 1000.0,
            "deadline": 2500.0,
            "closure_notified": False,
            "work_end_notified": False,
            "rest_end_notified": False
        }
        state = TimerState.from_dict(v1_data)
        self.storage.save(state)

        # Mock history manager to raise exception during bootstrap_legacy_session
        from src.ultradian_rhythm.history import HistoryManager
        from unittest.mock import MagicMock
        db_path = os.path.join(self.temp_dir.name, "fail_bootstrap.sqlite")
        history_mgr = HistoryManager(db_path)

        # Mock bootstrap_legacy_session to raise an exception
        history_mgr.bootstrap_legacy_session = MagicMock(side_effect=Exception("Database locked or disk full"))

        # Engine init must fail visibly
        with self.assertRaises(Exception) as ctx:
            TimerEngine(self.storage, self.notifier, time_func=lambda: 1200.0, history_mgr=history_mgr)
        self.assertEqual(str(ctx.exception), "Database locked or disk full")

        # Verify state.json was NOT mutated
        loaded = self.storage.load()
        self.assertEqual(loaded.cycle_id, "legacy-cycle-fail-123")
