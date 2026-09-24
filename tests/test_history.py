import unittest
import os
import tempfile
import sqlite3
from src.ultradian_rhythm.history import HistoryManager

class TestHistoryManager(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "sessions.sqlite")
        self.mgr = HistoryManager(self.db_path)
        self.mgr.init_db()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_init_db(self) -> None:
        # Check that tables exist
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]
        self.assertIn("sessions", tables)
        self.assertIn("session_events", tables)
        conn.close()

    def test_database_and_directory_are_private(self) -> None:
        self.mgr.db_path = os.path.join(self.temp_dir.name, "private", "sessions.sqlite")
        self.db_path = self.mgr.db_path
        self.mgr.init_db()
        os.chmod(self.db_path, 0o644)
        self.mgr.init_db()
        self.assertEqual(os.stat(os.path.dirname(self.db_path)).st_mode & 0o777, 0o700)
        self.assertEqual(os.stat(self.db_path).st_mode & 0o777, 0o600)

    def test_session_creation_and_events(self) -> None:
        self.mgr.create_session(
            session_id="cycle-1",
            preset="flow",
            intention_text="Write tests",
            planned_work=3000,
            planned_rest=600,
            timestamp=1000.0
        )

        history = self.mgr.get_history()
        self.assertEqual(len(history), 1)
        session = history[0]
        self.assertEqual(session["id"], "cycle-1")
        self.assertEqual(session["preset"], "flow")
        self.assertEqual(session["intention_text"], "Write tests")
        self.assertEqual(session["planned_work_seconds"], 3000)
        self.assertEqual(session["planned_rest_seconds"], 600)
        self.assertEqual(session["started_at"], 1000.0)
        self.assertIsNone(session["work_ended_at"])

        # Verify the "start" event was written
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT session_id, event_type, timestamp FROM session_events")
        events = cursor.fetchall()
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0], ("cycle-1", "start", 1000.0))
        conn.close()

    def test_log_events_and_updates(self) -> None:
        # Create session
        self.mgr.create_session("cycle-1", "flow", "Write code", 3000, 600, 1000.0)

        # Log pause
        self.mgr.log_event("cycle-1", "pause", 1100.0)

        # Log resume
        self.mgr.log_event("cycle-1", "resume", 1200.0)

        # Log midpoint
        self.mgr.log_event("cycle-1", "midpoint", 2500.0)

        # Update work end
        self.mgr.update_session_work_end("cycle-1", 4000.0)

        # Update rest end
        self.mgr.update_session_rest_end("cycle-1", 4600.0, "completed")

        # Save review
        self.mgr.save_review("cycle-1", "done", "Finished all", 4700.0)

        # Check session row
        history = self.mgr.get_history()
        self.assertEqual(len(history), 1)
        session = history[0]
        self.assertEqual(session["work_ended_at"], 4000.0)
        self.assertEqual(session["rest_ended_at"], 4600.0)
        self.assertEqual(session["terminal_at"], 4600.0)
        self.assertEqual(session["terminal_status"], "completed")
        self.assertEqual(session["review_outcome"], "done")
        self.assertEqual(session["review_text"], "Finished all")
        self.assertEqual(session["review_time"], 4700.0)

        # Check events list in order
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT event_type, timestamp FROM session_events ORDER BY id ASC")
        events = cursor.fetchall()

        expected_events = [
            ("start", 1000.0),
            ("pause", 1100.0),
            ("resume", 1200.0),
            ("midpoint", 2500.0),
            ("work_end", 4000.0),
            ("rest_end", 4600.0),
            ("review", 4700.0)
        ]
        self.assertEqual(events, expected_events)
        conn.close()

    def test_history_limit_and_ordering(self) -> None:
        # Create multiple sessions with different started_at
        for i in range(10):
            self.mgr.create_session(
                session_id=f"cycle-{i}",
                preset="flow",
                intention_text=f"Task {i}",
                planned_work=3000,
                planned_rest=600,
                timestamp=1000.0 + i
            )

        history = self.mgr.get_history(limit=5)
        self.assertEqual(len(history), 5)
        # Newest first
        self.assertEqual(history[0]["id"], "cycle-9")
        self.assertEqual(history[4]["id"], "cycle-5")

    def test_read_only_history_no_file(self) -> None:
        # Create a fresh HistoryManager pointing to a non-existent path
        non_existent_db = os.path.join(self.temp_dir.name, "subdir_not_exist", "non_existent.sqlite")
        mgr_no_file = HistoryManager(non_existent_db)

        # The file and parent directory should not exist yet
        self.assertFalse(os.path.exists(os.path.dirname(non_existent_db)))

        # Reading history must return []
        history = mgr_no_file.get_history()
        self.assertEqual(history, [])

        # Assert the directory and file were NOT created (read-only mode)
        self.assertFalse(os.path.exists(os.path.dirname(non_existent_db)))
        self.assertFalse(os.path.exists(non_existent_db))

    def test_db_schema_migration_v1_to_v2(self) -> None:
        # Create a database with only schema-v1 columns
        db_path = os.path.join(self.temp_dir.name, "migration_v1.sqlite")
        conn = sqlite3.connect(db_path)
        conn.execute("""
            CREATE TABLE sessions (
                id TEXT PRIMARY KEY,
                preset TEXT NOT NULL,
                intention_text TEXT NOT NULL,
                planned_work_seconds INTEGER NOT NULL,
                planned_rest_seconds INTEGER NOT NULL,
                started_at REAL NOT NULL
            )
        """)
        # Insert a v1 style session row
        conn.execute("""
            INSERT INTO sessions (id, preset, intention_text, planned_work_seconds, planned_rest_seconds, started_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, ("v1-session-123", "flow", "V1 task", 3000, 600, 1000.0))
        conn.commit()
        conn.close()

        # Instantiate HistoryManager and call init_db
        mgr = HistoryManager(db_path)
        mgr.init_db()

        # Check user_version is updated to 2
        conn = sqlite3.connect(db_path)
        cursor = conn.execute("PRAGMA user_version")
        self.assertEqual(cursor.fetchone()[0], 2)

        # Inspect column names to check if V2 fields are added
        cursor = conn.execute("PRAGMA table_info(sessions)")
        columns = [row[1] for row in cursor.fetchall()]
        self.assertIn("review_outcome", columns)
        self.assertIn("review_text", columns)
        self.assertIn("review_time", columns)
        self.assertIn("terminal_status", columns)

        # Verify old data is intact
        cursor = conn.execute("SELECT intention_text FROM sessions WHERE id='v1-session-123'")
        self.assertEqual(cursor.fetchone()[0], "V1 task")

        # Verify writing V2 review data succeeds
        mgr.save_review("v1-session-123", "done", "Upgraded OK", 2000.0)
        history = mgr.get_history()
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["review_outcome"], "done")
        self.assertEqual(history[0]["review_text"], "Upgraded OK")
        conn.close()

    def test_history_error_propagation(self) -> None:
        db_path = os.path.join(self.temp_dir.name, "propagate.sqlite")
        mgr = HistoryManager(db_path)
        mgr.init_db()

        # Force a database structural error by dropping table sessions
        conn = sqlite3.connect(db_path)
        conn.execute("DROP TABLE sessions")
        conn.commit()
        conn.close()

        # get_history must raise sqlite3.Error instead of returning []
        with self.assertRaises(sqlite3.Error):
            mgr.get_history()

    def test_session_events_metadata_migration(self) -> None:
        db_path = os.path.join(self.temp_dir.name, "migration_events.sqlite")
        conn = sqlite3.connect(db_path)
        # Create a session_events table missing metadata column
        conn.execute("""
            CREATE TABLE session_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                timestamp REAL NOT NULL
            )
        """)
        # Insert a row without metadata
        conn.execute("""
            INSERT INTO session_events (session_id, event_type, timestamp)
            VALUES (?, ?, ?)
        """, ("dummy-session", "start", 1000.0))
        conn.commit()
        conn.close()

        # Call init_db to perform migration
        mgr = HistoryManager(db_path)
        mgr.init_db()

        # Check metadata column was added
        conn = sqlite3.connect(db_path)
        cursor = conn.execute("PRAGMA table_info(session_events)")
        columns = [row[1] for row in cursor.fetchall()]
        self.assertIn("metadata", columns)

        # Check existing row is preserved
        cursor = conn.execute("SELECT session_id, event_type, timestamp, metadata FROM session_events")
        row = cursor.fetchone()
        self.assertEqual(row[0], "dummy-session")
        self.assertEqual(row[1], "start")
        self.assertEqual(row[2], 1000.0)
        self.assertIsNone(row[3])
        conn.close()
