"""
CamTrack Backend
  GET  /api/health        — healthcheck
  GET  /api/cameras       — список камер
  GET  /api/config        — поточний конфіг (JSON)
  POST /api/config        — зберегти новий конфіг і перезапустити трекінг
  GET  /api/tracks        — поточні треки
  GET  /api/stream/{id}   — MJPEG стрім з bbox (підтримує {id}_top / {id}_bot для split-камер)
  WS   /ws/tracks         — real-time треки
  GET  /                  — live grid
"""
from __future__ import annotations
import asyncio, json, logging, os, threading, time
from dataclasses import dataclass, field
from pathlib import Path

import cv2
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, HTMLResponse, JSONResponse
from pydantic import BaseModel
import uvicorn

from config_loader  import load as load_cfg, AppConfig, CameraConfig, config_to_dict
from env_config     import config_from_env
from camera_stream  import StreamManager
from detector       import PersonDetector
from cross_tracker  import CrossCameraTracker
from ptz_controller import PTZController, SOFT_LOST

logging.basicConfig(
    level   = logging.INFO,
    format  = "%(asctime)s [%(name)s] %(levelname)s %(message)s",
)
log = logging.getLogger("camtrack")

HOLD_DURATION           = float(os.environ.get("PTZ_HOLD_SECONDS", 30))
MANUAL_OVERRIDE_TIMEOUT = float(os.environ.get("PTZ_MANUAL_TIMEOUT", 15))

# ─── PTZ state machine ────────────────────────────────────────────────────────
@dataclass
class PTZState:
    status:     str   = "idle"   # "idle" | "tracking" | "holding"
    last_cx:    float = 0.5
    last_cy:    float = 0.5
    hold_start: float = 0.0

# ─── Global state ─────────────────────────────────────────────────────────────
CONFIG_PATH = Path(os.environ.get("CONFIG_PATH", "/app/config/camtrack_config.json"))
MODEL_CACHE = Path(os.environ.get("MODEL_CACHE", "/app/models"))
YOLO_MODEL  = os.environ.get("YOLO_MODEL", "yolov8n.pt")
BACKEND_PORT= int(os.environ.get("BACKEND_PORT", 8765))

app = FastAPI(title="CamTrack", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

_lock                = threading.Lock()
_config: AppConfig | None          = None
_streams: StreamManager | None     = None
_streams_sd: StreamManager | None  = None
_detector: PersonDetector | None   = None
_tracker: CrossCameraTracker | None = None
_ptz: dict[str, PTZController]     = {}
_ptz_states: dict[str, PTZState]   = {}
_manual_override: dict[str, float] = {}
_latest: dict                      = {}
_worker: threading.Thread | None   = None
_running        = False
_frame_count    = 0


# ─── Split-stream helpers ──────────────────────────────────────────────────────

def _split_id(camera_id: str) -> tuple[str, str | None]:
    """Parse '{cam_id}_top' / '{cam_id}_bot' → (physical_id, 'top'/'bot'/None)."""
    if camera_id.endswith("_top"):
        return camera_id[:-4], "top"
    if camera_id.endswith("_bot"):
        return camera_id[:-4], "bot"
    return camera_id, None


def _expand_cameras(cameras: list[CameraConfig]) -> list[CameraConfig]:
    """
    For CrossCameraTracker: expand split cameras into virtual sub-cam configs.
    Physical RTSP streams are NOT duplicated — only tracking IDs are expanded.
    """
    result = []
    for cam in cameras:
        if cam.split_stream:
            result.append(CameraConfig(
                id=f"{cam.id}_top", name=f"{cam.name} ↑",
                type="fixed",
                rtsp_4k=cam.rtsp_4k, rtsp_sd=cam.rtsp_sd,
                ip=cam.ip, onvif_url=None,
                position_m=cam.position_m, zone_polygon_m=[],
                ptz_limits=None, color=cam.color, split_stream=False,
            ))
            result.append(CameraConfig(
                id=f"{cam.id}_bot", name=f"{cam.name} ↓",
                type=cam.type,
                rtsp_4k=cam.rtsp_4k, rtsp_sd=cam.rtsp_sd,
                ip=cam.ip, onvif_url=cam.onvif_url,
                position_m=cam.position_m, zone_polygon_m=[],
                ptz_limits=cam.ptz_limits, color=cam.color, split_stream=False,
            ))
        else:
            result.append(cam)
    return result


# ─── Worker helpers ───────────────────────────────────────────────────────────

def _best_track(tracks: list):
    active = [t for t in tracks if t.lost <= SOFT_LOST]
    if not active:
        return None
    return min(active, key=lambda t: t.lost)


def _any_neighbor_active(cam_id: str, results: dict, cfg: AppConfig) -> bool:
    """True if any OTHER physical camera has at least one non-lost track."""
    for cam in cfg.cameras:
        if cam.id == cam_id:
            continue
        check_ids = ([f"{cam.id}_top", f"{cam.id}_bot"]
                     if cam.split_stream else [cam.id])
        for cid in check_ids:
            if any(t.lost <= SOFT_LOST for t in results.get(cid, [])):
                return True
    return False


def _draw_det(img, det, color=(0, 208, 132), offset_y: int = 0):
    x1, y1, x2, y2 = det["bbox"]
    y1 += offset_y; y2 += offset_y
    cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
    cv2.putText(img, f"#{det['id']}", (x1, max(0, y1 - 6)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 1)


# ─── Processing loop ──────────────────────────────────────────────────────────

def _processing_loop():
    global _frame_count, _latest, _running, _ptz_states
    log.info("Processing loop started")
    while _running:
        _frame_count += 1
        with _lock:
            cfg        = _config
            streams    = _streams
            det        = _detector
            trk        = _tracker
            ptz        = dict(_ptz)
            ptz_states = dict(_ptz_states)
        if not cfg or not streams or not det or not trk:
            time.sleep(0.05); continue
        if _frame_count % cfg.tracking.frame_skip != 0:
            time.sleep(0.01); continue

        frames = streams.all_frames()

        # ── Detection ─────────────────────────────────────────────────────────
        dets_per_cam: dict = {}
        for cam in cfg.cameras:
            fr = frames.get(cam.id)
            if not fr:
                if cam.split_stream:
                    dets_per_cam[f"{cam.id}_top"] = []
                    dets_per_cam[f"{cam.id}_bot"] = []
                else:
                    dets_per_cam[cam.id] = []
                continue

            if cam.split_stream:
                h   = fr.image.shape[0]
                mid = h // 2
                dets_per_cam[f"{cam.id}_top"] = det.detect(fr.image[:mid, :], extract_crops=True)
                dets_per_cam[f"{cam.id}_bot"] = det.detect(fr.image[mid:, :], extract_crops=True)
            else:
                dets_per_cam[cam.id] = det.detect(fr.image, extract_crops=True)

        results = trk.update(dets_per_cam)

        # ── Output + PTZ state machine ─────────────────────────────────────────
        output: dict = {}
        new_states: dict[str, PTZState] = {}

        for cam in cfg.cameras:
            now = time.time()

            if cam.split_stream:
                # ── Emit tracks for both virtual halves ────────────────────────
                for suffix in ("_top", "_bot"):
                    virt_id    = cam.id + suffix
                    cam_tracks = results.get(virt_id, [])
                    output[virt_id] = [
                        {"id":   trk.get_global_id(virt_id, t.track_id) or t.track_id,
                         "bbox": list(t.bbox), "cx": t.cx, "cy": t.cy}
                        for t in cam_tracks
                    ]

                if cam.type != "ptz":
                    continue

                # ── PTZ logic driven by bottom-half detections ─────────────────
                bot_tracks = results.get(f"{cam.id}_bot", [])
                ctrl       = ptz.get(cam.id)
                state      = ptz_states.get(cam.id, PTZState())
                best       = _best_track(bot_tracks)
                is_manual  = (now - _manual_override.get(cam.id, 0)) < MANUAL_OVERRIDE_TIMEOUT

                if not is_manual:
                    if best is not None:
                        if state.status != "tracking":
                            log.info(f"[{cam.id}] PTZ → TRACKING (split)")
                        state.status  = "tracking"
                        state.last_cx = best.cx
                        state.last_cy = best.cy
                        if ctrl:
                            ctrl.track_person(best.cx, best.cy)

                    elif state.status == "tracking":
                        log.info(f"[{cam.id}] PTZ → HOLDING (split)")
                        state.status     = "holding"
                        state.hold_start = now
                        if ctrl:
                            ctrl.stop()

                    elif state.status == "holding":
                        elapsed         = now - state.hold_start
                        neighbor_active = _any_neighbor_active(cam.id, results, cfg)
                        if elapsed >= HOLD_DURATION or neighbor_active:
                            reason = "timeout" if elapsed >= HOLD_DURATION else "neighbor active"
                            log.info(f"[{cam.id}] PTZ → IDLE ({reason})")
                            state.status = "idle"
                            if ctrl:
                                ctrl.go_home()

                new_states[cam.id] = state

            else:
                # ── Normal single-stream camera ────────────────────────────────
                cam_tracks = results.get(cam.id, [])
                output[cam.id] = [
                    {"id":   trk.get_global_id(cam.id, t.track_id) or t.track_id,
                     "bbox": list(t.bbox), "cx": t.cx, "cy": t.cy}
                    for t in cam_tracks
                ]

                if cam.type != "ptz":
                    continue

                ctrl      = ptz.get(cam.id)
                state     = ptz_states.get(cam.id, PTZState())
                best      = _best_track(cam_tracks)
                is_manual = (now - _manual_override.get(cam.id, 0)) < MANUAL_OVERRIDE_TIMEOUT

                if not is_manual:
                    if best is not None:
                        if state.status != "tracking":
                            log.info(f"[{cam.id}] PTZ → TRACKING")
                        state.status  = "tracking"
                        state.last_cx = best.cx
                        state.last_cy = best.cy
                        if ctrl:
                            ctrl.track_person(best.cx, best.cy)

                    elif state.status == "tracking":
                        log.info(f"[{cam.id}] PTZ → HOLDING (last pos {state.last_cx:.2f},{state.last_cy:.2f})")
                        state.status     = "holding"
                        state.hold_start = now
                        if ctrl:
                            ctrl.stop()

                    elif state.status == "holding":
                        elapsed         = now - state.hold_start
                        neighbor_active = _any_neighbor_active(cam.id, results, cfg)
                        if elapsed >= HOLD_DURATION or neighbor_active:
                            reason = "timeout" if elapsed >= HOLD_DURATION else "neighbor active"
                            log.info(f"[{cam.id}] PTZ → IDLE ({reason})")
                            state.status = "idle"
                            if ctrl:
                                ctrl.go_home()

                new_states[cam.id] = state

        with _lock:
            _ptz_states = new_states

        states_out: dict[str, dict] = {}
        for cam_id, st in new_states.items():
            now_s = time.time()
            hold_remaining = None
            if st.status == "holding":
                elapsed = now_s - st.hold_start
                hold_remaining = max(0.0, round(HOLD_DURATION - elapsed, 1))
            manual_elapsed   = now_s - _manual_override.get(cam_id, 0)
            is_manual_out    = manual_elapsed < MANUAL_OVERRIDE_TIMEOUT
            manual_remaining = round(MANUAL_OVERRIDE_TIMEOUT - manual_elapsed, 1) if is_manual_out else None
            states_out[cam_id] = {
                "status":           st.status,
                "last_cx":          round(st.last_cx, 3),
                "last_cy":          round(st.last_cy, 3),
                "hold_remaining":   hold_remaining,
                "manual":           is_manual_out,
                "manual_remaining": manual_remaining,
            }

        output["_states"] = states_out
        _latest = output
        time.sleep(0.01)
    log.info("Processing loop stopped")


def _start_tracking(cfg: AppConfig):
    global _streams, _streams_sd, _detector, _tracker, _ptz, _ptz_states, \
           _worker, _running, _config

    _running = False
    if _worker and _worker.is_alive():
        _worker.join(timeout=5)

    if _streams:
        _streams.stop_all()
    if _streams_sd:
        _streams_sd.stop_all()
    for ctrl in _ptz.values():
        try: ctrl.go_home()
        except: pass

    with _lock:
        _config = cfg

        _detector = PersonDetector(
            model_name  = str(MODEL_CACHE / YOLO_MODEL),
            confidence  = cfg.tracking.detection_confidence,
        )

        # Tracker uses expanded virtual sub-cams for split cameras
        expanded_cameras = _expand_cameras(cfg.cameras)
        tracker_cfg = AppConfig(
            yard_w=cfg.yard_w, yard_h=cfg.yard_h,
            cameras=expanded_cameras, tracking=cfg.tracking,
        )
        _tracker = CrossCameraTracker(tracker_cfg)

        # Streams: one physical stream per camera (not per virtual sub-cam)
        new_streams    = StreamManager()
        new_streams_sd = StreamManager()
        for cam in cfg.cameras:
            new_streams.add(cam.id, cam.rtsp_4k)
            new_streams_sd.add(cam.id, cam.rtsp_sd)
        _streams    = new_streams
        _streams_sd = new_streams_sd

        new_ptz: dict[str, PTZController] = {}
        for cam in cfg.cameras:
            if cam.type == "ptz" and cam.onvif_url:
                new_ptz[cam.id] = PTZController(cam, cfg.tracking.ptz_smoothing_factor)
        _ptz = new_ptz

        _ptz_states = {cam.id: PTZState() for cam in cfg.cameras if cam.type == "ptz"}

    _running = True
    _worker  = threading.Thread(target=_processing_loop, daemon=True)
    _worker.start()
    log.info(f"Tracking started: {len(cfg.cameras)} cameras")


# ─── Startup / shutdown ────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    MODEL_CACHE.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)

    import os as _os
    _os.environ["YOLO_CONFIG_DIR"] = str(MODEL_CACHE)

    env_has_cameras = bool(os.environ.get("CAM1_IP"))

    if env_has_cameras:
        log.info("ENV cameras detected — loading config from ENV (overrides saved config)")
        cfg = config_from_env()
        if CONFIG_PATH.exists():
            try:
                saved = load_cfg(CONFIG_PATH)
                saved_zones = {c.id: c.zone_polygon_m for c in saved.cameras if c.zone_polygon_m}
                for cam in cfg.cameras:
                    if cam.id in saved_zones:
                        cam.zone_polygon_m = saved_zones[cam.id]
                log.info("Zone polygons merged from saved config")
            except Exception as e:
                log.warning(f"Could not merge zones from saved config: {e}")
    elif CONFIG_PATH.exists():
        log.info(f"Loading config from {CONFIG_PATH}")
        cfg = load_cfg(CONFIG_PATH)
    else:
        log.info("No saved config and no ENV cameras — starting with empty config")
        cfg = config_from_env()

    _start_tracking(cfg)


@app.on_event("shutdown")
async def shutdown():
    global _running
    _running = False
    if _streams:
        _streams.stop_all()
    if _streams_sd:
        _streams_sd.stop_all()
    for ctrl in _ptz.values():
        try: ctrl.go_home()
        except: pass


# ─── REST API ──────────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return {"status": "ok", "cameras": len(_config.cameras) if _config else 0}


@app.get("/api/cameras")
def get_cameras():
    if not _config:
        return []
    return [{"id":c.id,"name":c.name,"type":c.type,"ip":c.ip,"split_stream":c.split_stream}
            for c in _config.cameras]


@app.get("/api/config")
def get_config():
    if not _config:
        return JSONResponse({"error": "not initialized"}, status_code=503)
    return config_to_dict(_config)


class ConfigPayload(BaseModel):
    model_config = {"extra": "allow"}


@app.post("/api/config")
async def save_config(payload: ConfigPayload):
    data = payload.model_dump()
    CONFIG_PATH.write_text(json.dumps(data, indent=2))
    log.info("Config saved — reloading tracking...")

    cfg = load_cfg(CONFIG_PATH)
    threading.Thread(target=_start_tracking, args=(cfg,), daemon=True).start()
    return {"status": "ok", "cameras": len(cfg.cameras)}


@app.get("/api/tracks")
def get_tracks():
    return _latest


# ─── Manual PTZ control ───────────────────────────────────────────────────────
class PtzMoveBody(BaseModel):
    pan:  float = 0.0
    tilt: float = 0.0
    zoom: float = 0.0


@app.post("/api/ptz/{camera_id}/move")
def ptz_move(camera_id: str, body: PtzMoveBody):
    ctrl = _ptz.get(camera_id)
    if ctrl is None:
        return JSONResponse({"error": "no PTZ controller for this camera"}, status_code=404)
    _manual_override[camera_id] = time.time()
    ctrl.move(body.pan, body.tilt, body.zoom)
    return {"status": "ok"}


@app.post("/api/ptz/{camera_id}/stop")
def ptz_stop(camera_id: str):
    ctrl = _ptz.get(camera_id)
    if ctrl is None:
        return JSONResponse({"error": "no PTZ controller for this camera"}, status_code=404)
    _manual_override[camera_id] = time.time()
    ctrl.stop()
    return {"status": "ok"}


# ─── MJPEG streams ─────────────────────────────────────────────────────────────
# Supports:
#   /api/stream/{cam_id}        — full frame (split cameras: shows divider + both bboxes)
#   /api/stream/{cam_id}_top    — top half with fixed-cam bboxes
#   /api/stream/{cam_id}_bot    — bottom half with ptz-cam bboxes
@app.get("/api/stream/{camera_id}")
def mjpeg_stream(camera_id: str):
    phys_id, half = _split_id(camera_id)

    def gen():
        while True:
            if not _streams_sd:
                time.sleep(0.1); continue
            fr = _streams_sd.get_frame(phys_id)
            if fr is None:
                time.sleep(0.05); continue

            img      = fr.image.copy()
            h, w     = img.shape[:2]
            mid      = h // 2

            if half == "top":
                img = img[:mid, :]
                for det in _latest.get(camera_id, []):
                    _draw_det(img, det, color=(0, 208, 132))

            elif half == "bot":
                img = img[mid:, :]
                for det in _latest.get(camera_id, []):
                    _draw_det(img, det, color=(245, 158, 11))

            else:
                cfg_s    = _config
                phys_cam = next((c for c in cfg_s.cameras if c.id == phys_id), None) if cfg_s else None

                if phys_cam and phys_cam.split_stream:
                    cv2.line(img, (0, mid), (w, mid), (40, 70, 55), 1)
                    cv2.putText(img, "FIXED", (5, 14),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 208, 132), 1)
                    cv2.putText(img, "PTZ", (5, mid + 14),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (245, 158, 11), 1)
                    for det in _latest.get(f"{phys_id}_top", []):
                        _draw_det(img, det, color=(0, 208, 132))
                    for det in _latest.get(f"{phys_id}_bot", []):
                        _draw_det(img, det, color=(245, 158, 11), offset_y=mid)
                else:
                    for det in _latest.get(camera_id, []):
                        _draw_det(img, det)

            ok, jpg = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 70])
            if ok:
                yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
                       + jpg.tobytes() + b"\r\n")
            time.sleep(1 / 15)

    return StreamingResponse(
        gen(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── WebSocket ────────────────────────────────────────────────────────────────
@app.websocket("/ws/tracks")
async def ws_tracks(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            await ws.send_json(_latest)
            await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        pass


# ─── Simple live grid page ────────────────────────────────────────────────────
@app.get("/")
def index():
    if not _config:
        return HTMLResponse("<h1>Starting...</h1>")
    cams_html = []
    for c in _config.cameras:
        type_color = "#f59e0b" if c.type == "ptz" else "#3b9ef5"
        if c.split_stream:
            cams_html.append(
                f'<div><h3 style="color:#00d084">{c.name} '
                f'<span style="color:{type_color};font-size:11px">{c.type.upper()}</span>'
                f'<span style="color:#6a8292;font-size:11px"> SPLIT</span></h3>'
                f'<div style="display:flex;gap:8px">'
                f'<div><div style="color:#00d084;font-size:10px">↑ FIXED</div>'
                f'<img src="/api/stream/{c.id}_top" width="240" style="border:1px solid #00d08444"/></div>'
                f'<div><div style="color:#f59e0b;font-size:10px">↓ PTZ</div>'
                f'<img src="/api/stream/{c.id}_bot" width="240" style="border:1px solid #f59e0b44"/></div>'
                f'</div></div>'
            )
        else:
            cams_html.append(
                f'<div><h3 style="color:#00d084">{c.name} '
                f'<span style="color:{type_color};font-size:11px">{c.type.upper()}</span></h3>'
                f'<img src="/api/stream/{c.id}" width="480" style="border:1px solid #1a2a35"/></div>'
            )
    return HTMLResponse(f"""<!DOCTYPE html><html>
<head><title>CamTrack</title>
<style>
  body{{background:#06090d;color:#c8d8e4;font-family:monospace;margin:0;padding:16px}}
  h1{{color:#00d084;letter-spacing:4px}}
  div{{display:inline-block;margin:8px;vertical-align:top}}
</style></head>
<body><h1>◈ CAMTRACK</h1>{"".join(cams_html)}</body></html>""")


# ─── Entry point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=BACKEND_PORT, log_level="info")
