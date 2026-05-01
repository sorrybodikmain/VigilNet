"""AppConfig dataclasses + dict serialization. DB I/O lives in db.py."""
from __future__ import annotations
from dataclasses import dataclass, asdict
from typing import Optional


@dataclass
class PTZLimits:
    pan_min:  float = -170
    pan_max:  float =  170
    tilt_min: float =  -90
    tilt_max: float =   30


@dataclass
class CameraConfig:
    id:              str
    name:            str
    type:            str              # "fixed" | "ptz"
    rtsp_4k:         str
    rtsp_sd:         str
    ip:              str
    onvif_url:       Optional[str]
    position_m:      dict             # {x, y}
    zone_polygon_m:  list             # [{x,y}, ...]
    ptz_limits:      Optional[PTZLimits]
    color:           str  = "#00d084"
    split_stream:    bool = False
    ptz_invert_pan:  bool  = False
    ptz_invert_tilt: bool  = False
    ptz_tilt_offset: float = 0.0
    has_zoom:        Optional[bool] = None


@dataclass
class TrackingConfig:
    detection_confidence:       float = 0.5
    reid_similarity_threshold:  float = 0.72
    zone_overlap_handoff_ratio: float = 0.3
    ptz_smoothing_factor:       float = 0.3
    max_lost_frames:            int   = 30
    frame_skip:                 int   = 2


@dataclass
class AppConfig:
    yard_w:   float
    yard_h:   float
    cameras:  list[CameraConfig]
    tracking: TrackingConfig


# ─────────────────────────────────────────────────────────────────────────────

def _cam_from_dict(c: dict) -> CameraConfig:
    ptz = PTZLimits(**c["ptz_limits"]) if c.get("ptz_limits") else None
    return CameraConfig(
        id              = c["id"],
        name            = c["name"],
        type            = c["type"],
        rtsp_4k         = c["rtsp_4k"],
        rtsp_sd         = c.get("rtsp_sd", c["rtsp_4k"]),
        ip              = c["ip"],
        onvif_url       = c.get("onvif_url"),
        position_m      = c.get("position_m", {"x": 5, "y": 5}),
        zone_polygon_m  = c.get("zone_polygon_m", []),
        ptz_limits      = ptz,
        color           = c.get("color", "#00d084"),
        split_stream    = c.get("split_stream",    False),
        ptz_invert_pan  = c.get("ptz_invert_pan",  False),
        ptz_invert_tilt = c.get("ptz_invert_tilt", False),
        ptz_tilt_offset = float(c.get("ptz_tilt_offset", 0.0)),
        has_zoom        = c.get("has_zoom", None),
    )


def load_from_dict(data: dict) -> AppConfig:
    cameras  = [_cam_from_dict(c) for c in data.get("cameras", [])]
    tr       = data.get("tracking", {})
    tracking = TrackingConfig(**{k: tr[k] for k in tr if hasattr(TrackingConfig, k)})
    yard     = data.get("yard", {})
    return AppConfig(
        yard_w   = yard.get("width_m",  20),
        yard_h   = yard.get("height_m", 15),
        cameras  = cameras,
        tracking = tracking,
    )


def config_to_dict(cfg: AppConfig) -> dict:
    cameras = []
    for c in cfg.cameras:
        cameras.append({
            "id":              c.id,
            "name":            c.name,
            "type":            c.type,
            "rtsp_4k":         c.rtsp_4k,
            "rtsp_sd":         c.rtsp_sd,
            "ip":              c.ip,
            "onvif_url":       c.onvif_url,
            "position_m":      c.position_m,
            "zone_polygon_m":  c.zone_polygon_m,
            "ptz_limits":      asdict(c.ptz_limits) if c.ptz_limits else None,
            "color":           c.color,
            "split_stream":    c.split_stream,
            "ptz_invert_pan":  c.ptz_invert_pan,
            "ptz_invert_tilt": c.ptz_invert_tilt,
            "ptz_tilt_offset": c.ptz_tilt_offset,
            "has_zoom":        c.has_zoom,
        })
    return {
        "version":  "1.0",
        "yard":     {"width_m": cfg.yard_w, "height_m": cfg.yard_h},
        "cameras":  cameras,
        "tracking": asdict(cfg.tracking),
    }
