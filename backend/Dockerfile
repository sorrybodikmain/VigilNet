# ─────────────────────────────────────────────────────────────────────────────
# CamTrack Backend — будується поверх camtrack-base (CUDA + PyTorch)
# Перед першим білдом: docker build -f base.Dockerfile -t camtrack-base .
# ─────────────────────────────────────────────────────────────────────────────
FROM camtrack-base:latest

WORKDIR /app

# ── Залежності (все крім PyTorch) ────────────────────────────────────────────
COPY requirements.txt .

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt

# ── ONVIF WSDL (не входять у wheel, витягуємо з sdist) ───────────────────────
RUN pip download "onvif-zeep==0.2.12" --no-deps --no-binary ":all:" -d /tmp/onvif-dl \
    && cd /tmp && tar xzf /tmp/onvif-dl/onvif_zeep-0.2.12.tar.gz \
    && WSDL_DST=$(python3 -c "import onvif,os; print(os.path.join(os.path.dirname(os.path.dirname(onvif.__file__)),'wsdl'))") \
    && cp -r /tmp/onvif_zeep-0.2.12/wsdl "$WSDL_DST" \
    && rm -rf /tmp/onvif-dl /tmp/onvif_zeep-0.2.12

# ── Попередньо завантажити YOLO модель ──────────────────────────────────────
# Це робить build повільнішим але перший запуск миттєвим
ARG YOLO_MODEL=yolov8n.pt
ENV YOLO_MODEL=${YOLO_MODEL}
ENV MODEL_CACHE=/app/models
RUN mkdir -p /app/models && \
    python -c "from ultralytics import YOLO; import os; \
               os.environ['YOLO_CONFIG_DIR']='/app/models'; \
               YOLO('${YOLO_MODEL}')" || echo "Model will download at runtime"

# ── Код ─────────────────────────────────────────────────────────────────────
COPY *.py .

# Volumes для конфігу та моделей
RUN mkdir -p /app/config /app/models

EXPOSE 8765

CMD ["python", "main.py"]
