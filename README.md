# ◈ VigilNet — Multi-Camera Person Tracker

> Ukrainian version: [README-UA.md](./README-UA.md)

Real-time multi-camera person detection, Re-ID cross-camera tracking, and PTZ auto-follow — all in a single Docker Compose stack.

Built and tested with **iCSee PTZ cameras** (models: `IPG-X2-WEQ2`, `X6C-WEQ`). Should work with any RTSP + ONVIF-compatible camera.

## Stack

- **Backend:** FastAPI + YOLOv8 + appearance Re-ID + ONVIF PTZ control
- **Frontend:** React + Vite → served by Nginx
- **Infra:** Docker Compose, NVIDIA CUDA 12.1, PyTorch GPU

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/sorrybodikmain/VigilNet.git
cd VigilNet

# 2. Configure your cameras
cp .env.example .env
nano .env

# 3. Build and start
docker compose up -d --build

# 4. Open in browser
open http://localhost        # Zone configurator UI
open http://localhost:8765   # Backend API / live stream grid
```

## Configuration

All settings live in `.env`. Copy `.env.example` and fill in your camera credentials:

```env
CAM1_IP=192.168.1.10
CAM1_USER=admin
CAM1_PASSWORD=yourpassword
```

The backend auto-generates `config/camtrack_config.json` from `.env` on first run. You can also configure camera zones visually via the **MAP** tab in the UI.

## Project Structure

```
VigilNet/
├── .env.example                 ← copy to .env and fill in
├── docker-compose.yml
├── backend/
│   ├── Dockerfile               ← nvidia/cuda:12.1 + PyTorch GPU
│   ├── main.py                  ← FastAPI server
│   ├── env_config.py            ← generates config from .env
│   ├── config_loader.py         ← reads/writes camtrack_config.json
│   ├── camera_stream.py         ← RTSP capture (1 thread/camera)
│   ├── detector.py              ← YOLOv8 person detection
│   ├── reid.py                  ← appearance Re-ID
│   ├── cross_tracker.py         ← multi-camera tracking
│   └── ptz_controller.py        ← ONVIF PTZ control
├── frontend/
│   ├── Dockerfile               ← Vite build → Nginx
│   ├── nginx.conf               ← proxies /api/ and /ws/ to backend
│   └── src/App.jsx              ← zone configurator UI
└── config/
    └── camtrack_config.example.json
```

## Workflow

```
1. docker compose up -d --build
2. Open http://localhost
3. MAP tab → draw coverage zones for each camera
4. Click SAVE & APPLY → backend reloads tracking config
5. STREAMS tab → watch live video with bounding boxes
6. WebSocket counter in the header shows active tracked persons
```

## Networking

- Backend runs with `network_mode: host` — can reach cameras on the local subnet directly
- Frontend runs in bridge mode — Nginx proxies `/api/` and `/ws/` to `host-gateway:8765`
- Ports: frontend `:80`, backend `:8765`

## GPU Requirements

Requires [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html):

```bash
distribution=$(. /etc/os-release; echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list \
  | sudo tee /etc/apt/sources.list.d/nvidia-docker.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker
```

## Split Stream (Dual-Sensor Cameras)

Some cameras output a single vertical RTSP stream where the **top half is a fixed wide-angle lens** and the **bottom half is a PTZ lens**. Enable this per-camera with `split_stream: true` in `camtrack_config.json` or via the checkbox in the **CAMERAS** tab of the UI.

When enabled:
- One physical RTSP connection is opened (no bandwidth duplication)
- The frame is split at `height / 2` — top half → `{id}_top` (fixed), bottom half → `{id}_bot` (PTZ)
- YOLO detection and Re-ID tracking run independently on each half
- PTZ auto-follow is driven by detections in the bottom half
- The **STREAMS** tab shows both sub-streams side-by-side in a single card
- MJPEG endpoints: `/api/stream/{id}_top`, `/api/stream/{id}_bot`, `/api/stream/{id}` (full frame with divider)

> **⚠️ Work in progress** — split stream support is not yet fully production-ready. Known limitations: zone drawing on the MAP tab does not account for the coordinate offset of each half; Re-ID handoff between split halves of the same camera is not yet tuned.

## API Reference

| Endpoint                  | Method | Description                              |
| ------------------------- | ------ | ---------------------------------------- |
| `/api/health`             | GET    | Health check                             |
| `/api/config`             | GET    | Get current config                       |
| `/api/config`             | POST   | Save new config                          |
| `/api/cameras`            | GET    | List cameras                             |
| `/api/tracks`             | GET    | Current tracking data                    |
| `/api/stream/{id}`        | GET    | MJPEG stream with bounding boxes         |
| `/api/stream/{id}_top`    | GET    | MJPEG — top half of a split-stream camera |
| `/api/stream/{id}_bot`    | GET    | MJPEG — bottom half of a split-stream camera |
| `/ws/tracks`              | WS     | Real-time tracking updates               |

## iCSee RTSP URL Format

```
rtsp://admin:{password}@{ip}:554/user=admin&password={password}&stream=0.sdp   # 4K main stream
rtsp://admin:{password}@{ip}:554/user=admin&password={password}&stream=1.sdp   # SD sub-stream (recommended for tracking)
```

## ONVIF PTZ URL

```
http://{ip}:80/onvif/device_service
http://{ip}:8000/onvif/device_service   # some models use port 8000
```

## Upgrading Re-ID

Replace `extract_feature()` in `reid.py` with a deep model for ~95% accuracy:

```python
import torchreid
model = torchreid.models.build_model("osnet_x0_25", num_classes=1)
```

## Docker Volumes

| Volume            | Contents                                                  |
| ----------------- | --------------------------------------------------------- |
| `camtrack_config` | `camtrack_config.json` — camera zones and tracking config |
| `camtrack_models` | YOLOv8 `.pt` model file (cached to avoid re-downloading)  |

## Logs

```bash
docker logs camtrack_backend -f
docker logs camtrack_frontend -f
```

## License

MIT
