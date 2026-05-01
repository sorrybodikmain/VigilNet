"""
Generate initial AppConfig from environment variables.

Підтримує:
  - CAM{N}_RTSP_URL  — повний RTSP URL (якщо є, використовується напряму)
  - CAM{N}_USER / CAM{N}_PASSWORD — свої облікові дані на кожну камеру
  - CAM{N}_IP + CAM{N}_ONVIF_PORT — для ONVIF PTZ керування
"""
from __future__ import annotations
import os
from config_loader import AppConfig, CameraConfig, TrackingConfig, PTZLimits

_COLORS = [
    "#3b9ef5", "#f59e0b", "#a78bfa",
    "#00d084", "#ef4444", "#06b6d4",
    "#f97316", "#10b981",
]

_DEFAULT_POS = [
    {"x": 40, "y": 18},
    {"x":  8, "y": 46},
    {"x": 26, "y": 44},
]


def config_from_env() -> AppConfig:
    yard_w = float(os.environ.get("YARD_WIDTH_M",  55))
    yard_h = float(os.environ.get("YARD_HEIGHT_M", 75))

    cameras: list[CameraConfig] = []
    i = 1

    while True:
        p = f"CAM{i}"
        ip = os.environ.get(f"{p}_IP")
        if not ip:
            break

        name       = os.environ.get(f"{p}_NAME",     f"CAM-{i}")
        cam_type   = os.environ.get(f"{p}_TYPE",     "ptz")
        user       = os.environ.get(f"{p}_USER",     os.environ.get("CAM_USER",     "admin"))
        password   = os.environ.get(f"{p}_PASSWORD", os.environ.get("CAM_PASSWORD", "password"))
        onvif_port = os.environ.get(f"{p}_ONVIF_PORT", "80")

        rtsp_4k = os.environ.get(f"{p}_RTSP_4K")
        rtsp_sd = os.environ.get(f"{p}_RTSP_SD")
        if not rtsp_4k:
            rtsp_port = os.environ.get(f"{p}_RTSP_PORT", "554")
            rtsp_4k = f"rtsp://{user}:{password}@{ip}:{rtsp_port}/user={user}&password={password}&stream=0.sdp"
        if not rtsp_sd:
            rtsp_sd = rtsp_4k

        onvif_url = None
        if cam_type == "ptz":
            onvif_url = f"http://{user}:{password}@{ip}:{onvif_port}/onvif/device_service"

        default_pos = _DEFAULT_POS[i-1] if i-1 < len(_DEFAULT_POS) else {"x": yard_w/2, "y": yard_h/2}
        position = {
            "x": float(os.environ.get(f"{p}_POS_X", default_pos["x"])),
            "y": float(os.environ.get(f"{p}_POS_Y", default_pos["y"])),
        }

        cameras.append(CameraConfig(
            id=f"cam{i}", name=name, type=cam_type,
            rtsp_4k=rtsp_4k, rtsp_sd=rtsp_sd,
            ip=ip, onvif_url=onvif_url,
            position_m=position, zone_polygon_m=[],
            ptz_limits=PTZLimits() if cam_type=="ptz" else None,
            color=_COLORS[(i-1) % len(_COLORS)],
        ))
        i += 1

    tracking = TrackingConfig(
        detection_confidence       = float(os.environ.get("DETECTION_CONFIDENCE", 0.5)),
        reid_similarity_threshold  = float(os.environ.get("REID_THRESHOLD",       0.72)),
        zone_overlap_handoff_ratio = float(os.environ.get("ZONE_OVERLAP_HANDOFF", 0.3)),
        ptz_smoothing_factor       = float(os.environ.get("PTZ_SMOOTHING",        0.3)),
        max_lost_frames            = int(  os.environ.get("MAX_LOST_FRAMES",      30)),
        frame_skip                 = int(  os.environ.get("FRAME_SKIP",           2)),
    )

    return AppConfig(yard_w=yard_w, yard_h=yard_h, cameras=cameras, tracking=tracking)
