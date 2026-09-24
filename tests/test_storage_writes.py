import unittest
from unittest.mock import MagicMock
from src.ultradian_rhythm.engine import TimerEngine
from src.ultradian_rhythm.models import TimerState
from src.ultradian_rhythm.notifier import FakeNotifier

class TestStorageWrites(unittest.TestCase):
    def test_transition_only_persistence(self) -> None:
        # Mock storage to trace and count calls to save()
        import tempfile
        import os
        mock_storage = MagicMock()
        mock_storage.path = os.path.join(tempfile.gettempdir(), "state.json")
        mock_storage.load.return_value = TimerState()

        notifier = FakeNotifier()
        current_time = 1000.0
        engine = TimerEngine(mock_storage, notifier, time_func=lambda: current_time)

        # Initial state should be clean and not saved yet
        self.assertEqual(mock_storage.save.call_count, 0)

        # 1. Starting a cycle -> Must trigger exactly 1 save
        engine.start_cycle("flow", intention_text="Persistence test")
        self.assertEqual(mock_storage.save.call_count, 1)

        # 2. Advance time normally between transitions -> No saves must occur
        # Flow work duration is 3000s, deadline is 4000.0. Midpoint is at 2500.0.
        current_time = 1100.0
        changed = engine.tick(current_time)
        self.assertFalse(changed)
        self.assertEqual(mock_storage.save.call_count, 1)  # Stays 1

        # 3. Crossing midpoint (2500.0) -> Must save midpoint notified state
        current_time = 2500.0
        changed = engine.tick(current_time)
        self.assertTrue(changed)
        self.assertEqual(mock_storage.save.call_count, 2)  # Incremented to 2

        # Advance slightly in work phase -> No saves
        current_time = 3800.0
        changed = engine.tick(current_time)
        self.assertFalse(changed)
        self.assertEqual(mock_storage.save.call_count, 2)  # Stays 2

        # 4. Crossing work deadline (4000.0) -> Must save rest transition
        current_time = 4000.0
        changed = engine.tick(current_time)
        self.assertTrue(changed)
        self.assertEqual(mock_storage.save.call_count, 3)  # Incremented to 3

        # Advance time in rest phase (rest deadline is 4600.0) -> No saves
        current_time = 4200.0
        changed = engine.tick(current_time)
        self.assertFalse(changed)
        self.assertEqual(mock_storage.save.call_count, 3)  # Stays 3

        # 5. Stop cycle -> Must save idle state
        engine.stop_cycle()
        self.assertEqual(mock_storage.save.call_count, 4)  # Incremented to 4

    def test_database_write_failure_isolation(self) -> None:
        import sqlite3
        # Mock history manager to raise an exception on database writes
        mock_storage = MagicMock()
        import tempfile
        import os
        mock_storage.path = os.path.join(tempfile.gettempdir(), "state.json")
        mock_storage.load.return_value = TimerState()

        notifier = FakeNotifier()
        engine = TimerEngine(mock_storage, notifier, time_func=lambda: 1000.0)

        # Override history_mgr functions to raise error
        mock_history = MagicMock()
        mock_history.create_session.side_effect = sqlite3.Error("Disk full / lock conflict")
        mock_history.save_review.side_effect = sqlite3.Error("Disk full / lock conflict")
        engine.history_mgr = mock_history

        # 1. Starting a cycle should raise sqlite3.Error and NOT call storage.save
        with self.assertRaises(sqlite3.Error):
            engine.start_cycle("flow", intention_text="Fail me")

        self.assertEqual(mock_storage.save.call_count, 0)
        self.assertEqual(engine.state.status, "idle")  # Memory state not updated

        # 2. Reviewing a cycle should raise sqlite3.Error and NOT clear review_pending or save
        state = TimerState(
            schema_version=2,
            cycle_id="test-id",
            status="completed",
            review_pending=True
        )
        engine.state = state

        with self.assertRaises(sqlite3.Error):
            engine.review_cycle("done", "Good job")

        self.assertTrue(engine.state.review_pending)  # Memory state not updated
        self.assertEqual(mock_storage.save.call_count, 0)  # No save

    def test_state_save_failure_rollback(self) -> None:
        import sqlite3
        import tempfile
        import os
        from src.ultradian_rhythm.history import HistoryManager

        # 1. Start cycle save failure rollback test
        mock_storage = MagicMock()
        mock_storage.path = os.path.join(tempfile.gettempdir(), "state.json")
        mock_storage.load.return_value = TimerState()

        # Make storage.save raise Exception
        mock_storage.save.side_effect = Exception("Failed to write JSON")

        db_path = os.path.join(tempfile.gettempdir(), "test_rollback.sqlite")
        if os.path.exists(db_path):
            try:
                os.remove(db_path)
            except Exception:
                pass

        history_mgr = HistoryManager(db_path)
        notifier = FakeNotifier()
        engine = TimerEngine(mock_storage, notifier, time_func=lambda: 1000.0, history_mgr=history_mgr)

        # Call start_cycle, it must raise the Exception from storage.save
        with self.assertRaises(Exception) as ctx:
            engine.start_cycle("flow", intention_text="Transaction rollback test")
        self.assertEqual(str(ctx.exception), "Failed to write JSON")

        # Assert in-memory state did NOT advance (remains idle)
        self.assertEqual(engine.state.status, "idle")
        self.assertIsNone(engine.state.cycle_id)

        # Assert SQLite has NO sessions or events written
        sessions = history_mgr.get_history()
        self.assertEqual(len(sessions), 0)

        # Clean up DB for next step
        if os.path.exists(db_path):
            try:
                os.remove(db_path)
            except Exception:
                pass

        # 2. Review cycle save failure rollback test
        # We start a clean engine where saving works first
        mock_storage_ok = MagicMock()
        mock_storage_ok.path = os.path.join(tempfile.gettempdir(), "state_ok.json")
        mock_storage_ok.load.return_value = TimerState()

        engine_ok = TimerEngine(mock_storage_ok, notifier, time_func=lambda: 1000.0, history_mgr=history_mgr)
        state_ok = engine_ok.start_cycle("flow", intention_text="Review rollback test")

        # Manually transition to rest/completed review pending state
        state_ok.review_pending = True
        state_ok.status = "completed"
        engine_ok.state = state_ok

        # Now make save fail
        mock_storage_ok.save.side_effect = Exception("Failed to save review JSON")

        # Call review, it must raise Exception
        with self.assertRaises(Exception) as ctx:
            engine_ok.review_cycle("done", "Save failed review")
        self.assertEqual(str(ctx.exception), "Failed to save review JSON")

        # Assert in-memory state did NOT clear review_pending
        self.assertTrue(engine_ok.state.review_pending)

        # Assert SQLite has NO review outcome set and no review event
        # Let's inspect the DB directly using connection
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT review_outcome, review_text FROM sessions WHERE id = ?", (state_ok.cycle_id,))
        row = cursor.fetchone()
        self.assertIsNone(row[0])  # outcome remains None
        self.assertIsNone(row[1])  # text remains None

        cursor.execute("SELECT event_type FROM session_events WHERE session_id = ?", (state_ok.cycle_id,))
        events = [r[0] for r in cursor.fetchall()]
        self.assertNotIn("review", events)
        conn.close()

        # Clean up
        if os.path.exists(db_path):
            try:
                os.remove(db_path)
            except Exception:
                pass

    def test_state_rollback_on_commit_failure(self) -> None:
        import tempfile
        import os
        import sqlite3
        import contextlib
        from src.ultradian_rhythm.history import HistoryManager

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "commit_fail.sqlite")
            history_mgr = HistoryManager(db_path)
            history_mgr.init_db()

            @contextlib.contextmanager
            def mock_transaction():
                conn = sqlite3.connect(db_path)
                conn.row_factory = sqlite3.Row
                conn.execute("PRAGMA foreign_keys = ON")
                try:
                    conn.execute("BEGIN TRANSACTION")
                    yield conn
                    # Force failure at commit stage
                    raise sqlite3.Error("Mock commit failure")
                except Exception:
                    conn.rollback()
                    raise
                finally:
                    conn.close()

            history_mgr.transaction = mock_transaction

            mock_storage = MagicMock()
            mock_storage.path = os.path.join(tmpdir, "state.json")
            old_state = TimerState(status="idle", phase="none")
            mock_storage.load.return_value = old_state

            saved_states = []
            def mock_save(st):
                saved_states.append(st.to_dict())
            mock_storage.save.side_effect = mock_save

            notifier = FakeNotifier()
            engine = TimerEngine(mock_storage, notifier, time_func=lambda: 1000.0, history_mgr=history_mgr)
            engine.state = old_state

            with self.assertRaises(sqlite3.Error) as ctx:
                engine.start_cycle("flow", intention_text="Rollback test")
            self.assertEqual(str(ctx.exception), "Mock commit failure")

            # Assert in-memory state remains unchanged
            self.assertEqual(engine.state.status, "idle")

            # Assert state.json was restored to old state after new state save failure
            self.assertEqual(len(saved_states), 2)
            self.assertEqual(saved_states[0]["status"], "running")
            self.assertEqual(saved_states[1]["status"], "idle")

            # Assert SQLite has no sessions committed
            history_mgr_read = HistoryManager(db_path)
            self.assertEqual(len(history_mgr_read.get_history()), 0)
