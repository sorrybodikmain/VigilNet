"""
CamTrack Backend
  GET  /api/health        — healthcheck
  GET  /api/cameras       — список камер
  GET  /api/config        — поточний конфіг (JSON)
  POST /api/config        — зберегти новий конфіг і перезапустити трекінг
  GET  /api/tracks        — поточні треки
  GET  /api/stream/{id}   — MJPEG стрім з bbox
  WS   /ws/tracks         — real-time треки
  GET  /                  — live grid
"""
from __future__ import annotations
import asyncio, json, logging, os, threading, time
from pathlib import Path

import cv2
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, HTMLResponse, JSONResponse
from pydantic import BaseModel
import uvicorn

from config_loader  import load as load_cfg, AppConfig, config_to_dict
from env_config     import config_from_env
from camera_stream  import StreamManager
from detector       import PersonDetector
from cross_tracker  import CrossCameraTracker
from ptz_controller import PTZController

logging.basicConfig(
    level   = logging.INFO,
    format  = "%(asctime)s [%(name)s] %(levelname)s %(message)s",
)
log = logging.getLogger("camtrack")

# ─── Global state ─────────────────────────────────────────────────────────────
CONFIG_PATH = Path(os.environ.get("CONFIG_PATH", "/app/config/camtrack_config.json"))
MODEL_CACHE = Path(os.environ.get("MODEL_CACHE", "/app/models"))
YOLO_MODEL  = os.environ.get("YOLO_MODEL", "yolov8n.pt")
BACKEND_PORT= int(os.environ.get("BACKEND_PORT", 8765))

app = FastAPI(title="CamTrack", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

# Shared mutable state (guarded by _lock)
_lock               = threading.Lock()
_config: AppConfig | None         = None
_streams: StreamManager | None    = None   # 4K — detection
_streams_sd: StreamManager | None = None   # SD  — MJPEG display
_detector: PersonDetector|None    = None
_tracker: CrossCameraTracker|None = None
_ptz: dict[str, PTZController]    = {}
_latest: dict                     = {}   # {cam_id: [{id, bbox, cx, cy}]}
_worker: threading.Thread | None  = None
_running        = False
_frame_count    = 0

# ─── Worker ───────────────────────────────────────────────────────────────────
def _processing_loop():
    global _frame_count, _latest, _running
    log.info("Processing loop started")
    while _running:
        _frame_count += 1
        with _lock:
            cfg     = _config
            streams = _streams
            det     = _detector
            trk     = _tracker
            ptz     = dict(_ptz)
        if not cfg or not streams or not det or not trk:
            time.sleep(0.05); continue
        if _frame_count % cfg.tracking.frame_skip != 0:
            time.sleep(0.01); continue

        frames = streams.all_frames()
        dets_per_cam = {}
        for cam in cfg.cameras:
            fr = frames.get(cam.id)
            dets_per_cam[cam.id] = det.detect(fr.image, extract_crops=True) if fr else []

        results = trk.update(dets_per_cam)

        output: dict = {}
        for cam in cfg.cameras:
            cam_out = []
            for t in results.get(cam.id, []):
                gid = trk.get_global_id(cam.id, t.track_id)
                cam_out.append({"id": gid or t.track_id,
                                "bbox": list(t.bbox),
                                "cx": t.cx, "cy": t.cy})
                if cam.type == "ptz" and t.lost == 0:
                    ctrl = ptz.get(cam.id)
                    if ctrl:
                        ctrl.track_person(t.cx, t.cy)
            output[cam.id] = cam_out

        _latest = output
        time.sleep(0.01)
    log.info("Processing loop stopped")


def _start_tracking(cfg: AppConfig):
    """(Re)initialize all tracking components from a new config."""
    global _streams, _streams_sd, _detector, _tracker, _ptz, _worker, _running, _config

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
        _tracker = CrossCameraTracker(cfg)

        new_streams = StreamManager()
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

    _running = True
    _worker  = threading.Thread(target=_processing_loop, daemon=True)
    _worker.start()
    log.info(f"Tracking started: {len(cfg.cameras)} cameras")


# ─── Startup / shutdown ────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    MODEL_CACHE.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)

    # Pre-download YOLO model if needed
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
    return [{"id":c.id,"name":c.name,"type":c.type,"ip":c.ip} for c in _config.cameras]


@app.get("/api/config")
def get_config():
    if not _config:
        return JSONResponse({"error": "not initialized"}, status_code=503)
    return config_to_dict(_config)


class ConfigPayload(BaseModel):
    model_config = {"extra": "allow"}


@app.post("/api/config")
async def save_config(payload: ConfigPayload):
    """Save new config (from UI) and hot-reload tracking."""
    data = payload.model_dump()
    CONFIG_PATH.write_text(json.dumps(data, indent=2))
    log.info("Config saved — reloading tracking...")

    cfg = load_cfg(CONFIG_PATH)
    # Run reinit in thread so we don't block the response
    threading.Thread(target=_start_tracking, args=(cfg,), daemon=True).start()
    return {"status": "ok", "cameras": len(cfg.cameras)}


@app.get("/api/tracks")
def get_tracks():
    return _latest


# ─── MJPEG streams ────────────────────────────────────────────────────────────
@app.get("/api/stream/{camera_id}")
def mjpeg_stream(camera_id: str):
    def gen():
        while True:
            if not _streams_sd:
                time.sleep(0.1); continue
            fr = _streams_sd.get_frame(camera_id)
            if fr is None:
                time.sleep(0.05); continue

            img = fr.image.copy()
            for det in _latest.get(camera_id, []):
                x1,y1,x2,y2 = det["bbox"]
                cv2.rectangle(img, (x1,y1), (x2,y2), (0,208,132), 2)
                cv2.putText(img, f"#{det['id']}", (x1, max(0,y1-6)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0,208,132), 1)

            ok, jpg = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 70])
            if ok:
                yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
                       + jpg.tobytes() + b"\r\n")
            time.sleep(1/15)

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
    cams = "".join(
        f'<div><h3 style="color:#00d084">{c.name} '
        f'<span style="color:#{"f59e0b" if c.type=="ptz" else "3b9ef5"};font-size:11px">'
        f'{c.type.upper()}</span></h3>'
        f'<img src="/api/stream/{c.id}" width="480" style="border:1px solid #1a2a35"/></div>'
        for c in _config.cameras
    )
    return HTMLResponse(f"""<!DOCTYPE html><html>
<head><title>CamTrack</title>
<style>
  body{{background:#06090d;color:#c8d8e4;font-family:monospace;margin:0;padding:16px}}
  h1{{color:#00d084;letter-spacing:4px}}
  div{{display:inline-block;margin:8px;vertical-align:top}}
</style></head>
<body><h1>◈ CAMTRACK</h1>{cams}</body></html>""")


# ─── Entry point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=BACKEND_PORT, log_level="info")
