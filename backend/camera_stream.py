"""RTSP stream reader — one thread per camera."""
import cv2, os, threading, time, logging
from dataclasses import dataclass, field
from typing import Optional
import numpy as np

log = logging.getLogger(__name__)

os.environ.setdefault(
    "OPENCV_FFMPEG_CAPTURE_OPTIONS",
    "rtsp_transport;tcp|timeout;10000000|stimeout;10000000",
)

_OPEN_TIMEOUT_MS  = 10_000
_READ_TIMEOUT_MS  = 15_000
_STALE_THRESHOLD  = 20.0

@dataclass
class Frame:
    camera_id: str
    image: np.ndarray
    timestamp: float = field(default_factory=time.time)

class CameraStream:
    def __init__(self, camera_id: str, rtsp_url: str, reconnect_delay: float = 5.0):
        self.camera_id     = camera_id
        self.rtsp_url      = rtsp_url
        self._frame: Optional[Frame] = None
        self._lock         = threading.Lock()
        self._running      = False
        self._thread: Optional[threading.Thread] = None
        self._reconnect    = reconnect_delay

    def start(self):
        self._running = True
        self._thread  = threading.Thread(target=self._loop, daemon=True, name=f"cam-{self.camera_id}")
        self._thread.start()

    def stop(self):
        self._running = False

    def get_frame(self) -> Optional[Frame]:
        with self._lock:
            return self._frame

    def _open_cap(self) -> cv2.VideoCapture:
        cap = cv2.VideoCapture()
        cap.open(self.rtsp_url, cv2.CAP_FFMPEG, [
            cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, _OPEN_TIMEOUT_MS,
            cv2.CAP_PROP_READ_TIMEOUT_MSEC, _READ_TIMEOUT_MS,
        ])
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 3)
        return cap

    def _loop(self):
        consecutive_fails = 0
        while self._running:
            cap = None
            try:
                cap = self._open_cap()
                if not cap.isOpened():
                    raise ConnectionError(f"Cannot open {self.rtsp_url}")
                log.info(f"[{self.camera_id}] connected (attempt {consecutive_fails + 1})")
                consecutive_fails = 0
                last_frame_ts = time.time()

                while self._running:
                    ok, img = cap.read()
                    if not ok:
                        log.warning(f"[{self.camera_id}] read failed — reconnecting")
                        break
                    last_frame_ts = time.time()
                    with self._lock:
                        self._frame = Frame(self.camera_id, img)

                    if time.time() - last_frame_ts > _STALE_THRESHOLD:
                        log.warning(f"[{self.camera_id}] stale stream ({_STALE_THRESHOLD}s no frames) — reconnecting")
                        break

            except Exception as e:
                consecutive_fails += 1
                delay = min(self._reconnect * consecutive_fails, 60.0)
                log.warning(f"[{self.camera_id}] {e} — retry in {delay:.0f}s (fail #{consecutive_fails})")
                if cap:
                    cap.release()
                    cap = None
                if self._running:
                    time.sleep(delay)
                continue
            finally:
                if cap:
                    cap.release()
            if self._running:
                time.sleep(self._reconnect)

class StreamManager:
    def __init__(self):
        self._streams: dict[str, CameraStream] = {}

    def add(self, camera_id: str, rtsp_url: str):
        s = CameraStream(camera_id, rtsp_url)
        self._streams[camera_id] = s
        s.start()

    def get_frame(self, camera_id: str) -> Optional[Frame]:
        s = self._streams.get(camera_id)
        return s.get_frame() if s else None

    def all_frames(self) -> dict[str, Optional[Frame]]:
        return {cid: s.get_frame() for cid, s in self._streams.items()}

    def stop_all(self):
        for s in self._streams.values():
            s.stop()
        self._streams.clear()
