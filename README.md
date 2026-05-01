# ◈ CamTrack — Multi-Camera Person Tracker

> Ukrainian version: [README-UA.md](./README-UA.md)

Real-time multi-camera person detection, Re-ID cross-camera tracking, and PTZ auto-follow — all in a single Docker Compose stack.

Built and tested with **iCSee PTZ cameras** (models: `IPG-X2-WEQ2`, `X6C-WEQ`). Should work with any RTSP + ONVIF-compatible camera.

## Stack

- **Backend:** FastAPI + YOLOv8 + appearance Re-ID + ONVIF PTZ control
- **Database:** PostgreSQL (camera config, settings)
- **Frontend:** React + Vite → served by Nginx
- **Infra:** Docker Compose, NVIDIA CUDA 12, PyTorch GPU

## Quick Start

```bash
# 1. Clone the repository
git clone <repo-url>
cd camtrack-docker

# 2. Configure infrastructure
cp .env.example .env
nano .env   # set DB credentials, ports, model

# 3. Build and start
docker compose up -d --build

# 4. Open the UI and add cameras
open http://localhost        # UI (CAMERAS tab → add cameras → SAVE)
open http://localhost:8765   # Backend API
```

Cameras are added and configured entirely through the UI — no `.env` editing required.

## Project Structure

```
camtrack-docker/
├── .env.example             ← copy to .env (no camera data here)
├── docker-compose.yml
├── backend/
│   ├── main.py              ← FastAPI server
│   ├── db.py                ← PostgreSQL persistence
│   ├── config_loader.py     ← dataclasses + serialization
│   ├── camera_stream.py     ← RTSP capture (1 thread/camera)
│   ├── detector.py          ← YOLOv8 person detection
│   ├── reid.py              ← appearance Re-ID
│   ├── cross_tracker.py     ← multi-camera tracking
│   └── ptz_controller.py   ← ONVIF PTZ control
└── frontend/
    ├── Dockerfile           ← Vite build → Nginx
    ├── nginx.conf           ← proxies /api/, /ws/ → backend
    └── src/
        └── components/
            ├── CamerasTab.jsx     ← add / edit cameras
            ├── CalibrationTab.jsx ← PTZ calibration wizard
            ├── StreamsTab.jsx     ← live MJPEG streams
            └── MapTab.jsx         ← zone editor
```

## Workflow

```
1. docker compose up -d --build
2. Open http://localhost
3. CAMERAS tab → add cameras (RTSP URLs, ONVIF, type)
4. Click SAVE & APPLY
5. CALIBRATE tab → test PTZ directions, fix tilt, set home position
6. MAP tab → draw coverage zones for each camera
7. STREAMS tab → live video with bounding boxes
```

## Camera Configuration (UI)

All camera data lives in PostgreSQL, edited via **CAMERAS** tab:

| Field             | Description                              |
| ----------------- | ---------------------------------------- |
| Name / IP         | Camera identifier                        |
| RTSP 4K           | Detection stream (high-res)              |
| RTSP SD           | Display stream (lower bandwidth)         |
| ONVIF URL         | PTZ control endpoint                     |
| Type              | `fixed` or `ptz`                         |
| Split Stream      | Top half = fixed lens, bottom = PTZ lens |
| Invert Pan / Tilt | Flip PTZ direction if camera is inverted |

## PTZ Calibration

Open **CALIBRATE** tab for step-by-step wizard:

1. **Direction test** — press arrows, confirm pan/tilt direction (auto-sets inversion)
2. **Tilt offset** — slider to fix "camera looks at ground" issue
3. **Home position** — position camera and save as default resting point
4. **Fixed↔PTZ alignment** — verify split-stream halves track the same person

## Split Stream (Dual-Sensor Cameras)

Some cameras output one vertical RTSP stream where the **top half is a fixed wide-angle lens** and the **bottom half is a PTZ lens**. Enable per-camera via **CAMERAS** tab → `Split Stream` checkbox.

When enabled:

- One physical RTSP connection (no bandwidth duplication)
- Frame split at `height / 2` → `{id}_top` (fixed), `{id}_bot` (PTZ)
- YOLO + Re-ID run independently on each half
- PTZ auto-follow driven by detections in the bottom half
- MJPEG endpoints: `/api/stream/{id}_top`, `/api/stream/{id}_bot`, `/api/stream/{id}`

## API Reference

| Endpoint                    | Method | Description                        |
| --------------------------- | ------ | ---------------------------------- |
| `/api/health`               | GET    | Health check                       |
| `/api/config`               | GET    | Current config                     |
| `/api/config`               | POST   | Save config                        |
| `/api/cameras`              | GET    | List cameras                       |
| `/api/capabilities`         | GET    | PTZ/zoom capabilities per camera   |
| `/api/tracks`               | GET    | Current tracking data              |
| `/api/stream/{id}`          | GET    | MJPEG stream with bounding boxes   |
| `/api/stream/{id}_top`      | GET    | Top half of split-stream camera    |
| `/api/stream/{id}_bot`      | GET    | Bottom half of split-stream camera |
| `/api/ptz/{id}/move`        | POST   | Manual PTZ move                    |
| `/api/ptz/{id}/stop`        | POST   | Stop PTZ movement                  |
| `/api/ptz/{id}/home/go`     | POST   | Return to home position            |
| `/api/ptz/{id}/home/set`    | POST   | Save current position as home      |
| `/api/ptz/{id}/tilt_offset` | POST   | Update tilt tracking offset        |
| `/ws/tracks`                | WS     | Real-time tracking updates         |

## iCSee RTSP URL Format

```
rtsp://user:pass@{ip}:554/user=user&password=pass&stream=0.sdp   # 4K main
rtsp://user:pass@{ip}:554/user=user&password=pass&stream=1.sdp   # SD sub-stream
```

## ONVIF PTZ URL

```
http://{ip}:80/onvif/device_service
http://{ip}:8899/onvif/device_service   # iCSee cameras
```

## Docker Volumes

| Volume            | Contents                                  |
| ----------------- | ----------------------------------------- |
| `camtrack_db`     | PostgreSQL data (camera config, settings) |
| `camtrack_models` | YOLOv8 `.pt` model file                   |

## Logs

```bash
docker logs camtrack_backend -f
docker logs camtrack_postgres -f
docker logs camtrack_frontend -f
```

## GPU Requirements

Requires [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html).

## License

MIT
