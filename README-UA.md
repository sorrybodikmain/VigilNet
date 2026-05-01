# ◈ VigilNet — Multi-Camera Person Tracker

Створено та протестовано з PTZ-камерами **iCSee** (моделі: `IPG-X2-WEQ2`, `X6C-WEQ`). Має працювати з будь-якою камерою, що підтримує RTSP + ONVIF.

## Швидкий старт

```bash
# 1. Клонуй / розпакуй проект
cd camtrack-docker

# 2. Заповни .env (тільки цей файл!)
nano .env

# 3. Білд і запуск
docker compose up -d --build

# 4. Відкрий браузер
open http://localhost        # UI конфігуратор
open http://localhost:8765   # Backend API / live grid
```

## Структура

```
camtrack-docker/
├── .env                     ← ЗАПОВНИ ЦЕЙ ФАЙЛ
├── docker-compose.yml
├── backend/
│   ├── Dockerfile           ← nvidia/cuda:12.1 + PyTorch GPU
│   ├── main.py              ← FastAPI сервер
│   ├── env_config.py        ← генерує конфіг з .env
│   ├── config_loader.py     ← читає/пише camtrack_config.json
│   ├── camera_stream.py     ← RTSP capture (1 thread/camera)
│   ├── detector.py          ← YOLOv8 person detection
│   ├── reid.py              ← appearance Re-ID
│   ├── cross_tracker.py     ← multi-camera tracking
│   └── ptz_controller.py   ← ONVIF PTZ control
└── frontend/
    ├── Dockerfile           ← Vite build → Nginx
    ├── nginx.conf           ← proxy /api/, /ws/ → backend
    └── src/App.jsx          ← Zone configurator UI
```

## Workflow

```
1. docker compose up -d --build
2. Відкрий http://localhost
3. MAP вкладка → налаштуй зони для кожної камери
4. Натисни 💾 SAVE & APPLY → backend перезавантажує трекінг
5. STREAMS вкладка → бачиш live відео з bbox
6. WebSocket в хедері показує скільки людей відстежується
```

## Мережа

- Backend: `network_mode: host` — бачить 192.168.31.* напряму
- Frontend: bridge → Nginx проксує `/api/` і `/ws/` на `host-gateway:8765`
- Порти: frontend на `:80`, backend на `:8765`

## GPU

Потребує NVIDIA Container Toolkit:
```bash
# Встановлення (якщо ще немає)
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list \
  | sudo tee /etc/apt/sources.list.d/nvidia-docker.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker
```

## API

| Endpoint | Метод | Опис |
|----------|-------|------|
| `/api/health` | GET | healthcheck |
| `/api/config` | GET | поточний конфіг |
| `/api/config` | POST | зберегти новий конфіг |
| `/api/cameras` | GET | список камер |
| `/api/tracks` | GET | поточні треки |
| `/api/stream/{id}` | GET | MJPEG з bbox |
| `/ws/tracks` | WS | real-time треки |

## iCSee RTSP URL формат

```
rtsp://admin:{password}@{ip}:554/stream     # main stream
rtsp://admin:{password}@{ip}:554/stream2    # sub-stream (рекомендовано для трекінгу)
```

## ONVIF URL (PTZ)

```
http://{ip}:80/onvif/device_service
http://{ip}:8000/onvif/device_service   # деякі моделі
```

## Upgrade Re-ID

Замін в `reid.py::extract_feature()` на deep model для точності ~95%:

```python
# torchreid
import torchreid
model = torchreid.models.build_model("osnet_x0_25", num_classes=1)
```

## Volumes

| Volume | Вміст |
|--------|-------|
| `camtrack_config` | camtrack_config.json (зони, конфіг камер) |
| `camtrack_models` | YOLOv8 .pt файл (щоб не качати кожен раз) |

## Logs

```bash
docker logs camtrack_backend -f
docker logs camtrack_frontend -f
```
