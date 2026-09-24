import json
import socket
from typing import Optional, Dict, Any

class ProtocolError(Exception):
    pass


MAX_MESSAGE_BYTES = 65536

def send_message(sock: socket.socket, message: Dict[str, Any]) -> None:
    """Encodes message as JSON, appends a newline, and sends it over the socket."""
    try:
        data = (json.dumps(message) + "\n").encode("utf-8")
        sock.sendall(data)
    except Exception as e:
        raise ProtocolError(f"Failed to send message: {e}") from e

def recv_message(sock: socket.socket, buffer: bytearray) -> Optional[Dict[str, Any]]:
    """Reads from socket until a newline character is found, updates buffer, and decodes the JSON object.
    Returns None if the socket is closed without a complete message.
    """
    while b"\n" not in buffer:
        try:
            chunk = sock.recv(4096)
            if not chunk:
                break
            buffer.extend(chunk)
            if len(buffer) > MAX_MESSAGE_BYTES:
                raise ProtocolError("Message exceeds maximum size")
        except socket.timeout:
            return None
        except Exception as e:
            raise ProtocolError(f"Failed to receive message: {e}") from e

    if b"\n" in buffer:
        line, sep, rest = buffer.partition(b"\n")
        if len(line) > MAX_MESSAGE_BYTES:
            raise ProtocolError("Message exceeds maximum size")
        buffer[:] = rest
        try:
            return json.loads(line.decode("utf-8"))
        except Exception as e:
            raise ProtocolError(f"Invalid JSON received: {e}") from e
    elif buffer:
        if len(buffer) > MAX_MESSAGE_BYTES:
            raise ProtocolError("Message exceeds maximum size")
        # Connection closed with some bytes in buffer but no newline
        line = bytes(buffer)
        buffer.clear()
        try:
            return json.loads(line.decode("utf-8"))
        except Exception as e:
            raise ProtocolError(f"Invalid JSON received at EOF: {e}") from e

    return None
