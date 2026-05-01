"""ONVIF PTZ controller for iCSee cameras."""
from __future__ import annotations
import logging, threading, time, urllib.parse
from dataclasses import dataclass
from typing import Optional

from onvif import ONVIFCamera
from config_loader import CameraConfig

log = logging.getLogger(__name__)

SOFT_LOST = 3


@dataclass
class PTZCapabilities:
    has_ptz:  bool
    has_zoom: bool
    status:   str = "ok"


class PTZController:
    def __init__(self, cam: CameraConfig, smoothing: float = 0.3):
        self.cam       = cam
        self.smoothing = smoothing
        self._lock     = threading.Lock()
        self._ptz      = None
        self._media    = None
        self._profile  = None
        self._ready    = False
        self._has_zoom = bool(getattr(cam, "has_zoom", False) or False)

        threading.Thread(
            target=self._connect, daemon=True, name=f"onvif-{cam.id}"
        ).start()

    def _connect(self):
        if not self.cam.onvif_url:
            return
        try:
            parsed = urllib.parse.urlparse(self.cam.onvif_url)
            host   = parsed.hostname
            port   = parsed.port or 80
            user   = parsed.username or "admin"
            passwd = parsed.password or ""

            log.info(f"[{self.cam.id}] ONVIF connecting {host}:{port} as {user}")
            mycam         = ONVIFCamera(host, port, user, passwd)
            self._media   = mycam.create_media_service()
            self._ptz     = mycam.create_ptz_service()
            profiles      = self._media.GetProfiles()
            self._profile = profiles[0]
            log.info(f"[{self.cam.id}] ONVIF ready — profile: {self._profile.Name}")

            cfg_zoom = getattr(self.cam, "has_zoom", None)
            if cfg_zoom is not None:
                self._has_zoom = bool(cfg_zoom)
            else:
                self._has_zoom = self._probe_zoom()

            log.info(f"[{self.cam.id}] has_zoom={self._has_zoom}")
            self._ready = True
        except Exception as e:
            log.warning(f"[{self.cam.id}] ONVIF connect failed: {e}")

    def _probe_zoom(self) -> bool:
        try:
            ptz_cfg = getattr(self._profile, "PTZConfiguration", None)
            if ptz_cfg is None:
                return False
            spaces = getattr(ptz_cfg, "DefaultContinuousMoveVelocitySpace", None)
            if spaces is None:
                return False
            return getattr(spaces, "ZoomSpaceUri", None) is not None
        except Exception:
            return False

    def move(self, pan: float, tilt: float, zoom: float = 0.0):
        if self._ptz is None:
            return
        if getattr(self.cam, "ptz_invert_pan", False):
            pan = -pan
        if getattr(self.cam, "ptz_invert_tilt", False):
            tilt = -tilt
        if not self._has_zoom:
            zoom = 0.0
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
            log.warning(f"[{self.cam.id}] PTZ move error: {e}")

    def track_person(self, cx: float, cy: float):
        if self._ptz is None:
            return
        tilt_offset = getattr(self.cam, "ptz_tilt_offset", 0.0) or 0.0
        err_x = cx - 0.5
        err_y = (cy - tilt_offset) - 0.5
        if abs(err_x) < 0.04 and abs(err_y) < 0.04:
            self.stop()
            return
        self.move(
            pan  = round(err_x * (1 - self.smoothing), 4),
            tilt = round(-err_y * (1 - self.smoothing), 4),
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
            log.warning(f"[{self.cam.id}] PTZ stop error: {e}")

    def go_home(self):
        if not (self._ptz and self._profile):
            return
        try:
            self._ptz.GotoHomePosition({"ProfileToken": self._profile.token})
        except Exception as e:
            log.warning(f"[{self.cam.id}] PTZ go_home error: {e}")

    def set_home(self):
        if not (self._ptz and self._profile):
            return
        try:
            self._ptz.SetHomePosition({"ProfileToken": self._profile.token})
        except Exception as e:
            log.warning(f"[{self.cam.id}] PTZ set_home error: {e}")

    def calibrate(self, timeout: float = 25.0) -> PTZCapabilities:
        deadline = time.time() + timeout
        while not self._ready and time.time() < deadline:
            time.sleep(0.5)
        if not self._ready:
            return PTZCapabilities(has_ptz=False, has_zoom=False)
        return PTZCapabilities(has_ptz=True, has_zoom=self._has_zoom)
