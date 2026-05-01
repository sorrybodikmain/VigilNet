"""
ONVIF PTZ controller для iCSee камер.
Credentials беруться з onvif_url (http://user:pass@ip:port/...).
"""
from __future__ import annotations
import logging, threading, urllib.parse
from onvif import ONVIFCamera
from config_loader import CameraConfig

log = logging.getLogger(__name__)

SOFT_LOST = 3


class PTZController:
    def __init__(self, cam: CameraConfig, smoothing: float = 0.3):
        self.cam       = cam
        self.smoothing = smoothing
        self._lock     = threading.Lock()
        self._ptz      = None
        self._media    = None
        self._profile  = None
        self._connect()

    def _connect(self):
        if not self.cam.onvif_url:
            return
        try:
            parsed = urllib.parse.urlparse(self.cam.onvif_url)
            host   = parsed.hostname
            port   = parsed.port or 80
            user   = parsed.username or "admin"
            passwd = parsed.password or "password"

            log.info(f"[{self.cam.name}] ONVIF connecting {host}:{port} as {user}")
            mycam         = ONVIFCamera(host, port, user, passwd)
            self._media   = mycam.create_media_service()
            self._ptz     = mycam.create_ptz_service()
            profiles      = self._media.GetProfiles()
            self._profile = profiles[0]
            log.info(f"[{self.cam.name}] ONVIF OK — profile: {self._profile.Name}")

            try:
                status = self._ptz.GetStatus({"ProfileToken": self._profile.token})
                pos = status.Position
                log.info(
                    f"[{self.cam.name}] PTZ status OK — "
                    f"Pan={pos.PanTilt.x:.3f} Tilt={pos.PanTilt.y:.3f} Zoom={pos.Zoom.x:.3f}"
                )
            except Exception as e:
                log.warning(f"[{self.cam.name}] PTZ GetStatus failed (camera may not support it): {e}")

        except Exception as e:
            log.warning(f"[{self.cam.name}] ONVIF connect failed: {e}")
            log.warning(f"[{self.cam.name}] Перевір onvif_url — порт 80 vs 8000, логін/пароль")

    def move(self, pan: float, tilt: float, zoom: float = 0.0):
        if self._ptz is None:
            return
        try:
            req = self._ptz.create_type("ContinuousMove")
            req.ProfileToken = self._profile.token
            req.Velocity = {
                "PanTilt": {"x": round(pan, 4), "y": round(tilt, 4)},
                "Zoom":    {"x": round(zoom, 4)},
            }
            with self._lock:
                self._ptz.ContinuousMove(req)
        except Exception as e:
            log.warning(f"[{self.cam.name}] PTZ move error: {e}")

    def track_person(self, cx: float, cy: float):
        """cx, cy ∈ [0,1] — позиція людини в кадрі. Центр = 0.5."""
        if self._ptz is None:
            return
        err_x = cx - 0.5
        err_y = cy - 0.5
        if abs(err_x) < 0.04 and abs(err_y) < 0.04:
            self.stop()
            return
        self.move(
            pan  =  round(err_x * (1 - self.smoothing), 4),
            tilt =  round(-err_y * (1 - self.smoothing), 4),
            zoom = 0.0,
        )

    def stop(self):
        if self._ptz is None:
            return
        try:
            with self._lock:
                self._ptz.Stop({
                    "ProfileToken": self._profile.token,
                    "PanTilt": True,
                    "Zoom": False,
                })
        except Exception as e:
            log.warning(f"[{self.cam.name}] PTZ stop error: {e}")

    def _stop(self):
        self.stop()

    def go_home(self):
        if self._ptz and self._profile:
            try:
                self._ptz.GotoHomePosition({"ProfileToken": self._profile.token})
            except Exception as e:
                log.warning(f"[{self.cam.name}] PTZ go_home error: {e}")
