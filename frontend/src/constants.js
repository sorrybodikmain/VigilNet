export const CANVAS_W = 800;
export const CANVAS_H = 520;

export const CAM_COLORS = [
  "#00d084","#3b9ef5","#f59e0b","#ef4444",
  "#a78bfa","#06b6d4","#f97316","#10b981",
];

export const STATE_COLOR = {
  tracking: "#00d084",
  holding:  "#f59e0b",
  idle:     "#3b9ef5",
};

export const DEFAULT_PTZ_LIMITS = {
  pan_min: -170, pan_max: 170,
  tilt_min: -90, tilt_max: 30,
};

export const DEFAULT_TRACKING = {
  detection_confidence:       0.5,
  reid_similarity_threshold:  0.72,
  zone_overlap_handoff_ratio: 0.3,
  ptz_smoothing_factor:       0.3,
  max_lost_frames:            30,
  frame_skip:                 2,
};

export function uid() {
  return Math.random().toString(36).substr(2, 8);
}

export function makeCameraTemplate(idx, yardW, yardH) {
  const ip = `192.168.31.${100 + idx}`;
  return {
    id: uid(),
    name: `CAM-${idx + 1}`,
    rtsp_4k: `rtsp://admin:pass@${ip}/user=admin&password=pass&stream=0.sdp`,
    rtsp_sd: `rtsp://admin:pass@${ip}/user=admin&password=pass&stream=1.sdp`,
    ip,
    type: "ptz",
    onvif_url: `http://admin:pass@${ip}:80/onvif/device_service`,
    position_m: { x: yardW / 2, y: yardH / 2 },
    position:   { x: yardW / 2, y: yardH / 2 },
    zone_polygon_m: [],
    zone: [],
    ptz_limits: { ...DEFAULT_PTZ_LIMITS },
  };
}
