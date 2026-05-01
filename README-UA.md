# ◈ CamTrack — Multi-Camera Person Tracker

Детекція людей у реальному часі, Re-ID трекінг між камерами та PTZ auto-follow в одному Docker Compose стеку.

Протестовано з PTZ-камерами **iCSee** (моделі: `IPG-X2-WEQ2`, `X6C-WEQ`). Має працювати з будь-якою камерою з RTSP + ONVIF.

## Стек

- **Backend:** FastAPI + YOLOv8 + appearance Re-ID + ONVIF PTZ
- **База даних:** PostgreSQL (конфіг камер, налаштування)
- **Frontend:** React + Vite → Nginx
- **Інфра:** Docker Compose, NVIDIA CUDA 12, PyTorch GPU

## Швидкий старт

```bash
# 1. Клонуй проект
git clone <repo-url>
cd camtrack-docker

# 2. Налаштуй .env (тільки інфраструктура)
cp .env.example .env
nano .env   # DB credentials, порти, модель

# 3. Білд і запуск
docker compose up -d --build

# 4. Відкрий UI і додай камери
open http://localhost        # вкладка CAMERAS → додай камери → SAVE
open http://localhost:8765   # Backend API
```

Дані камер зберігаються в PostgreSQL і редагуються через UI — `.env` не потрібен для камер.

## Структура

```
camtrack-docker/
├── .env.example             ← скопіюй в .env (без даних камер)
├── docker-compose.yml
├── backend/
│   ├── main.py              ← FastAPI сервер
│   ├── db.py                ← PostgreSQL persistence
│   ├── config_loader.py     ← dataclasses + серіалізація
│   ├── camera_stream.py     ← RTSP capture (1 thread/камера)
│   ├── detector.py          ← YOLOv8 person detection
│   ├── reid.py              ← appearance Re-ID
│   ├── cross_tracker.py     ← multi-camera tracking
│   └── ptz_controller.py   ← ONVIF PTZ control
└── frontend/
    └── src/components/
        ├── CamerasTab.jsx     ← додавання/редагування камер
        ├── CalibrationTab.jsx ← PTZ wizard-калібрування
        ├── StreamsTab.jsx     ← live MJPEG потоки
        └── MapTab.jsx         ← редактор зон
```

## Workflow

```
1. docker compose up -d --build
2. Відкрий http://localhost
3. CAMERAS → додай камери (RTSP, ONVIF, тип)
4. SAVE & APPLY
5. CALIBRATE → перевір напрямки PTZ, виправ tilt, встанови home
6. MAP → намалюй зони покриття
7. STREAMS → live відео з bbox
```

## Конфігурація камер (UI)

Всі дані камер зберігаються в PostgreSQL, редагуються у вкладці **CAMERAS**:

| Поле              | Опис                                           |
| ----------------- | ---------------------------------------------- |
| Name / IP         | Ідентифікатор камери                           |
| RTSP 4K           | Потік для детекції (висока якість)             |
| RTSP SD           | Потік для відображення (менший трафік)         |
| ONVIF URL         | Ендпоінт керування PTZ                         |
| Type              | `fixed` або `ptz`                              |
| Split Stream      | Верхня половина = fixed, нижня = PTZ           |
| Invert Pan / Tilt | Інвертувати напрям PTZ якщо камера перевернута |

## PTZ Калібрування

Вкладка **CALIBRATE** — покроковий wizard:

1. **Тест напрямків** — натисни стрілки, підтверди напрям (auto-виставляє інверсію)
2. **Tilt offset** — слайдер щоб камера не дивилася в землю
3. **Home position** — постав камеру і збережи позицію спокою
4. **Fixed↔PTZ alignment** — перевір що split-половини трекають одну людину

## Split Stream (камери з подвійною оптикою)

Деякі камери виводять один вертикальний RTSP де **верхня половина — fixed**, **нижня — PTZ**. Вмикається через CAMERAS → чекбокс `Split Stream`.

- Одне RTSP з'єднання (без дублювання трафіку)
- Кадр ділиться по `height/2` → `{id}_top` (fixed), `{id}_bot` (PTZ)
- YOLO + Re-ID незалежно на кожній половині
- MJPEG: `/api/stream/{id}_top`, `/api/stream/{id}_bot`, `/api/stream/{id}`

## API

| Endpoint                    | Метод      | Опис                             |
| --------------------------- | ---------- | -------------------------------- |
| `/api/health`               | GET        | healthcheck                      |
| `/api/config`               | GET / POST | конфіг                           |
| `/api/cameras`              | GET        | список камер                     |
| `/api/capabilities`         | GET        | PTZ/zoom можливості              |
| `/api/tracks`               | GET        | поточні треки                    |
| `/api/stream/{id}`          | GET        | MJPEG з bbox                     |
| `/api/ptz/{id}/move`        | POST       | ручне керування PTZ              |
| `/api/ptz/{id}/home/go`     | POST       | повернути в home                 |
| `/api/ptz/{id}/home/set`    | POST       | зберегти поточну позицію як home |
| `/api/ptz/{id}/tilt_offset` | POST       | оновити tilt offset              |
| `/ws/tracks`                | WS         | real-time треки                  |

## iCSee RTSP формат

```
rtsp://user:pass@{ip}:554/user=user&password=pass&stream=0.sdp   # 4K
rtsp://user:pass@{ip}:554/user=user&password=pass&stream=1.sdp   # SD
```

## ONVIF PTZ URL

```
http://{ip}:80/onvif/device_service
http://{ip}:8899/onvif/device_service   # iCSee камери
```

## Docker Volumes

| Volume            | Вміст                                  |
| ----------------- | -------------------------------------- |
| `camtrack_db`     | PostgreSQL дані (камери, налаштування) |
| `camtrack_models` | YOLOv8 .pt модель                      |

## Logs

```bash
docker logs camtrack_backend -f
docker logs camtrack_postgres -f
docker logs camtrack_frontend -f
```
