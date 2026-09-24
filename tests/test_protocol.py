import unittest
import socket
from unittest.mock import MagicMock
from src.ultradian_rhythm import protocol
from src.ultradian_rhythm.daemon import TimerDaemon

class TestProtocol(unittest.TestCase):
    def test_rejects_oversized_request(self) -> None:
        sock = MagicMock()
        sock.recv.return_value = b"x" * (protocol.MAX_MESSAGE_BYTES + 1)
        with self.assertRaisesRegex(protocol.ProtocolError, "maximum size"):
            protocol.recv_message(sock, bytearray())

    def test_silent_client_does_not_block_daemon_forever(self) -> None:
        sock = MagicMock()
        sock.recv.side_effect = socket.timeout()
        daemon = TimerDaemon.__new__(TimerDaemon)
        daemon.handle_connection(sock)
        sock.settimeout.assert_called_once_with(1.0)
        sock.close.assert_called_once()

    def test_send_message(self) -> None:
        sock = MagicMock()
        payload = {"ok": True, "value": "test"}
        protocol.send_message(sock, payload)
        sock.sendall.assert_called_once_with(b'{"ok": true, "value": "test"}\n')

    def test_receive_multiple_messages_in_buffer(self) -> None:
        buffer = bytearray(b'{"command":"status"}\n{"command":"pause"}\n')
        sock = MagicMock()
        
        # Parse first message
        msg1 = protocol.recv_message(sock, buffer)
        self.assertEqual(msg1, {"command": "status"})
        self.assertEqual(buffer, bytearray(b'{"command":"pause"}\n'))
        
        # Parse second message
        msg2 = protocol.recv_message(sock, buffer)
        self.assertEqual(msg2, {"command": "pause"})
        self.assertEqual(buffer, bytearray())

    def test_receive_split_packets(self) -> None:
        buffer = bytearray(b'{"command"')
        sock = MagicMock()
        # Mock socket.recv to deliver the rest of the message in the next call
        sock.recv.return_value = b':"stop"}\n'
        
        msg = protocol.recv_message(sock, buffer)
        self.assertEqual(msg, {"command": "stop"})
        self.assertEqual(buffer, bytearray())
        sock.recv.assert_called_once()

    def test_receive_eof_no_newline(self) -> None:
        buffer = bytearray(b'{"command":"resume"}')
        sock = MagicMock()
        # EOF returns empty chunk
        sock.recv.return_value = b''
        
        msg = protocol.recv_message(sock, buffer)
        self.assertEqual(msg, {"command": "resume"})
        self.assertEqual(buffer, bytearray())
