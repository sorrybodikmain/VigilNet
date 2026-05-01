"""YOLOv8 person detector."""
from __future__ import annotations
import os
import numpy as np
from dataclasses import dataclass
from ultralytics import YOLO

@dataclass
class Detection:
    bbox: tuple[int,int,int,int]
    confidence: float
    cx: float
    cy: float
    crop: np.ndarray | None = None

class PersonDetector:
    def __init__(self, model_name: str = "yolov8n.pt", confidence: float = 0.5):
        os.environ.setdefault("YOLO_CONFIG_DIR", "/app/models")
        self.model      = YOLO(model_name)
        self.confidence = confidence

    def detect(self, frame: np.ndarray, extract_crops: bool = True) -> list[Detection]:
        h, w = frame.shape[:2]
        results = self.model(frame, classes=[0], conf=self.confidence, verbose=False)
        out = []
        for box in results[0].boxes:
            x1,y1,x2,y2 = map(int, box.xyxy[0].tolist())
            conf = float(box.conf[0])
            crop = frame[max(0,y1):y2, max(0,x1):x2] if extract_crops else None
            out.append(Detection(
                bbox=(x1,y1,x2,y2), confidence=conf,
                cx=(x1+x2)/(2*w), cy=(y1+y2)/(2*h), crop=crop,
            ))
        return out
