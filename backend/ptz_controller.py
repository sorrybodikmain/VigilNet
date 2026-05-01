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
            mycam        = ONVIFCamera(host, port, user, passwd)
            self._media  = mycam.create_media_service()
            self._ptz    = mycam.create_ptz_service()
            profiles     = self._media.GetProfiles()
            self._profile= profiles[0]
            log.info(f"[{self.cam.name}] ONVIF OK — profile: {self._profile.Name}")
        except Exception as e:
            log.warning(f"[{self.cam.name}] ONVIF failed: {e}")
            log.warning(f"[{self.cam.name}] Якщо порт 80 не працює, спробуй CAM{self.cam.id[-1]}_ONVIF_PORT=8000 у .env")

    def track_person(self, cx: float, cy: float):
        """cx, cy ∈ [0,1] — позиція людини в кадрі. Центр = 0.5."""
        if self._ptz is None:
            return
        err_x = cx - 0.5
        err_y = cy - 0.5
        if abs(err_x) < 0.04 and abs(err_y) < 0.04:
            self._stop(); return

        try:
            speed = self._ptz.create_type("PTZSpeed")
            speed.PanTilt = {
                "x":  err_x * (1 - self.smoothing),
                "y": -err_y * (1 - self.smoothing),  # ONVIF: позитивний = вгору
            }
            speed.Zoom = {"x": 0}
            req = self._ptz.create_type("ContinuousMoveRequest")
            req.ProfileToken = self._profile.token
            req.Velocity     = speed
            req.Timeout      = "PT0.5S"
            with self._lock:
                self._ptz.ContinuousMove(req)
        except Exception as e:
            log.debug(f"[{self.cam.name}] PTZ move: {e}")

    def stop(self):
        if self._ptz is None:
            return
        try:
            with self._lock:
                self._ptz.Stop({"ProfileToken": self._profile.token,
                                "PanTilt": True, "Zoom": False})
        except: pass

    def _stop(self):
        self.stop()

    def go_home(self):
        if self._ptz and self._profile:
            try:
                self._ptz.GotoHomePosition({
                    "ProfileToken": self._profile.token, "Speed": None
                })
            except: pass
