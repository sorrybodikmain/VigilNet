"""Appearance Re-ID via HSV colour histograms.
Swap extract_feature() with a deep model (OSNet) for higher accuracy.
"""
import cv2
import numpy as np

def extract_feature(crop: np.ndarray) -> np.ndarray:
    if crop is None or crop.size == 0:
        return np.zeros(512)
    hsv    = cv2.cvtColor(cv2.resize(crop, (64,128)), cv2.COLOR_BGR2HSV)
    h_hist = cv2.calcHist([hsv],[0],None,[32],[0,180]).flatten()
    s_hist = cv2.calcHist([hsv],[1],None,[32],[0,256]).flatten()
    feat   = np.concatenate([h_hist, s_hist])
    norm   = np.linalg.norm(feat)
    return feat / norm if norm > 0 else feat

def similarity(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b))
