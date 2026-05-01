"""Multi-camera person tracker with Re-ID based handoff."""
from __future__ import annotations
import time, logging
from dataclasses import dataclass, field
from typing import Optional
import numpy as np
from scipy.optimize import linear_sum_assignment

from detector import Detection
from reid import extract_feature, similarity
from config_loader import AppConfig

log = logging.getLogger(__name__)

@dataclass
class Track:
    track_id: int
    camera_id: str
    bbox: tuple
    cx: float; cy: float
    feature: np.ndarray
    last_seen: float = field(default_factory=time.time)
    hits: int = 1
    lost: int = 0

class CameraTracker:
    _next_id = 0
    def __init__(self, camera_id: str, max_lost: int = 30):
        self.camera_id = camera_id
        self.max_lost  = max_lost
        self.tracks: list[Track] = []

    def update(self, detections: list[Detection]) -> list[Track]:
        if not detections:
            for t in self.tracks: t.lost += 1
            self.tracks = [t for t in self.tracks if t.lost <= self.max_lost]
            return self.tracks

        matched_track = set()
        matched_det   = set()
        if self.tracks:
            cost = np.zeros((len(self.tracks), len(detections)))
            for i,t in enumerate(self.tracks):
                for j,d in enumerate(detections):
                    cost[i,j] = 1 - _iou(t.bbox, d.bbox)
            rows, cols = linear_sum_assignment(cost)
            for r,c in zip(rows,cols):
                if cost[r,c] < 0.7:
                    t = self.tracks[r]; d = detections[c]
                    t.bbox = d.bbox; t.cx = d.cx; t.cy = d.cy
                    if d.crop is not None:
                        t.feature = extract_feature(d.crop)
                    t.last_seen = time.time(); t.hits += 1; t.lost = 0
                    matched_track.add(r); matched_det.add(c)

        for i,t in enumerate(self.tracks):
            if i not in matched_track: t.lost += 1
        for j,d in enumerate(detections):
            if j not in matched_det:
                CameraTracker._next_id += 1
                feat = extract_feature(d.crop) if d.crop is not None else np.zeros(512)
                self.tracks.append(Track(
                    track_id=CameraTracker._next_id,
                    camera_id=self.camera_id,
                    bbox=d.bbox, cx=d.cx, cy=d.cy, feature=feat,
                ))
        self.tracks = [t for t in self.tracks if t.lost <= self.max_lost]
        return self.tracks


class CrossCameraTracker:
    def __init__(self, config: AppConfig):
        self.cfg = config
        self.cam_trackers = {
            c.id: CameraTracker(c.id, config.tracking.max_lost_frames)
            for c in config.cameras
        }
        self.global_tracks: dict[int, dict] = {}
        self._next_global = 0
        self.reid_thresh  = config.tracking.reid_similarity_threshold

    def update(self, detections_per_cam: dict[str, list[Detection]]) -> dict[str, list[Track]]:
        results = {}
        for cam_id, dets in detections_per_cam.items():
            tr = self.cam_trackers.get(cam_id)
            if tr: results[cam_id] = tr.update(dets)
        self._associate_across(results)
        return results

    def _associate_across(self, results: dict[str, list[Track]]):
        registered = {(v["cam_id"], v["track_id"]) for v in self.global_tracks.values()}
        for cam_id, tracks in results.items():
            for track in tracks:
                if (cam_id, track.track_id) in registered:
                    continue
                best_gid, best_sim = None, 0.0
                for gid, info in self.global_tracks.items():
                    if info["cam_id"] == cam_id: continue
                    sim = similarity(track.feature, info["feature"])
                    if sim > best_sim: best_sim, best_gid = sim, gid
                if best_sim >= self.reid_thresh and best_gid is not None:
                    self.global_tracks[best_gid].update({
                        "cam_id": cam_id, "track_id": track.track_id,
                        "feature": track.feature,
                    })
                    log.info(f"ReID global#{best_gid} → {cam_id} sim={best_sim:.2f}")
                    registered.add((cam_id, track.track_id))
                else:
                    self._next_global += 1
                    self.global_tracks[self._next_global] = {
                        "cam_id": cam_id, "track_id": track.track_id,
                        "feature": track.feature,
                    }
                    registered.add((cam_id, track.track_id))

    def get_global_id(self, cam_id: str, track_id: int) -> Optional[int]:
        for gid, info in self.global_tracks.items():
            if info["cam_id"] == cam_id and info["track_id"] == track_id:
                return gid
        return None


def _iou(a, b):
    ax1,ay1,ax2,ay2 = a; bx1,by1,bx2,by2 = b
    ix1,iy1 = max(ax1,bx1), max(ay1,by1)
    ix2,iy2 = min(ax2,bx2), min(ay2,by2)
    inter = max(0,ix2-ix1)*max(0,iy2-iy1)
    union = (ax2-ax1)*(ay2-ay1)+(bx2-bx1)*(by2-by1)-inter
    return inter/union if union>0 else 0
