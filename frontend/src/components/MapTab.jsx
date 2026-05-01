import { useState, useRef, useEffect, useCallback } from "react";
import { styles } from "../styles.js";
import { CANVAS_W, CANVAS_H, CAM_COLORS, STATE_COLOR, uid } from "../constants.js";
import { CamPanel } from "./CamPanel.jsx";
import { ToolSec, getBBox, rectsOverlap } from "./ui.jsx";

const LEGEND = [
  ["#3b9ef5",           "FIXED CAM"],
  ["#f59e0b",           "PTZ CAM"],
  ["#ffffff22",         "OVERLAP"],
  [STATE_COLOR.tracking,"TRACKING"],
  [STATE_COLOR.holding, "HOLDING 30s"],
  [STATE_COLOR.idle,    "IDLE / PATROL"],
];

export function MapTab({ cameras, setCameras, yard, setYard, tracks, ptzStates }) {
  const [selectedId, setSelectedId] = useState(null);
  const [tool, setTool]             = useState("select");
  const [drawPts, setDrawPts]       = useState([]);
  const [mouse, setMouse]           = useState(null);
  const [tick, setTick]             = useState(0);
  const canvasRef = useRef(null);

  const selected = cameras.find(c => c.id === selectedId);
  const colorOf  = cam => CAM_COLORS[cameras.indexOf(cam) % CAM_COLORS.length];

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 150);
    return () => clearInterval(id);
  }, []);

  const mToPx = useCallback((mx, my) => ({
    x: (mx / yard.w) * CANVAS_W,
    y: (my / yard.h) * CANVAS_H,
  }), [yard]);

  const pxToM = useCallback((px, py) => ({
    x: parseFloat(((px / CANVAS_W) * yard.w).toFixed(2)),
    y: parseFloat(((py / CANVAS_H) * yard.h).toFixed(2)),
  }), [yard]);

  const getPos = useCallback(e => {
    const r = canvasRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (CANVAS_W / r.width),
      y: (e.clientY - r.top)  * (CANVAS_H / r.height),
    };
  }, []);

  // ── Canvas rendering ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#06090d";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const sx = CANVAS_W / yard.w, sy = CANVAS_H / yard.h;
    ctx.strokeStyle = "#0d1520"; ctx.lineWidth = 1;
    for (let x=sx; x<CANVAS_W; x+=sx) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,CANVAS_H); ctx.stroke(); }
    for (let y=sy; y<CANVAS_H; y+=sy) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(CANVAS_W,y); ctx.stroke(); }
    ctx.strokeStyle = "#182430";
    for (let x=sx*5; x<CANVAS_W; x+=sx*5) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,CANVAS_H); ctx.stroke(); }
    for (let y=sy*5; y<CANVAS_H; y+=sy*5) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(CANVAS_W,y); ctx.stroke(); }

    ctx.fillStyle = "#1a2e40"; ctx.font = "9px monospace";
    for (let i=5; i<=yard.w; i+=5) ctx.fillText(`${i}m`, i*sx-12, CANVAS_H-3);
    for (let i=5; i<=yard.h; i+=5) ctx.fillText(`${i}m`, 2, i*sy-2);

    ctx.strokeStyle = "#1e3a4a"; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, CANVAS_W-2, CANVAS_H-2);

    // ── Zones ──────────────────────────────────────────────────────────────────
    const drawZone = (cam, isSel) => {
      const zPts = cam.zone_polygon_m || cam.zone || [];
      if (zPts.length < 3) return;
      const color = CAM_COLORS[cameras.indexOf(cam) % CAM_COLORS.length];
      const pts   = zPts.map(m => mToPx(m.x, m.y));
      const st    = cam.type === "ptz" ? (ptzStates[cam.id]?.status || "idle") : null;

      let fillColor, strokeColor, lineWidth, lineDash;
      if (st === "tracking") {
        const pulse = 0.10 + 0.08 * Math.sin(tick * 0.6);
        fillColor   = color + Math.round(pulse * 255).toString(16).padStart(2, "0");
        strokeColor = color + "cc";
        lineWidth   = isSel ? 2.5 : 2;
        lineDash    = [];
      } else if (st === "holding") {
        const pulse = 0.08 + 0.05 * Math.sin(tick * 0.9);
        fillColor   = "#f59e0b" + Math.round(pulse * 255).toString(16).padStart(2, "0");
        strokeColor = "#f59e0baa";
        lineWidth   = isSel ? 2 : 1.5;
        lineDash    = [6, 3];
      } else {
        fillColor   = color + (isSel ? "22" : "0e");
        strokeColor = color + (isSel ? "66" : "33");
        lineWidth   = isSel ? 2 : 1;
        lineDash    = isSel ? [] : [5, 4];
      }

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = fillColor; ctx.fill();
      ctx.strokeStyle = strokeColor; ctx.lineWidth = lineWidth;
      ctx.setLineDash(lineDash); ctx.stroke(); ctx.setLineDash([]);

      if (isSel) pts.forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2);
        ctx.fillStyle = color; ctx.fill();
        ctx.strokeStyle = "#000"; ctx.lineWidth = 1; ctx.stroke();
      });

      if (st === "holding" && ptzStates[cam.id]) {
        const { last_cx, last_cy } = ptzStates[cam.id];
        const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
        const bxMin=Math.min(...xs), bxMax=Math.max(...xs);
        const byMin=Math.min(...ys), byMax=Math.max(...ys);
        const lx = bxMin + last_cx * (bxMax - bxMin);
        const ly = byMin + last_cy * (byMax - byMin);
        const r  = 5 + 3 * Math.abs(Math.sin(tick * 0.7));
        ctx.beginPath(); ctx.arc(lx, ly, r, 0, Math.PI*2);
        ctx.fillStyle = "#f59e0b44"; ctx.fill();
        ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI*2);
        ctx.fillStyle = "#f59e0b"; ctx.fill();
        ctx.strokeStyle = "#f59e0bcc"; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = "#f59e0b"; ctx.font = "bold 9px monospace";
        ctx.fillText("LAST SEEN", lx+8, ly+4);
      }
    };

    cameras.filter(c => c.id !== selectedId).forEach(c => drawZone(c, false));
    if (selected) drawZone(selected, true);

    // ── Overlap highlights ──────────────────────────────────────────────────
    const zones = cameras.filter(c => (c.zone_polygon_m || c.zone || []).length > 2);
    for (let i=0; i<zones.length; i++) for (let j=i+1; j<zones.length; j++) {
      const a = getBBox((zones[i].zone_polygon_m || zones[i].zone || []).map(m => mToPx(m.x, m.y)));
      const b = getBBox((zones[j].zone_polygon_m || zones[j].zone || []).map(m => mToPx(m.x, m.y)));
      const ov = rectsOverlap(a, b);
      if (ov) {
        ctx.fillStyle = "#ffffff08"; ctx.fillRect(ov.x, ov.y, ov.w, ov.h);
        ctx.strokeStyle = "#ffffff22"; ctx.lineWidth = 1;
        ctx.setLineDash([3,3]); ctx.strokeRect(ov.x, ov.y, ov.w, ov.h); ctx.setLineDash([]);
        ctx.fillStyle = "#ffffff22"; ctx.font = "9px monospace";
        ctx.fillText("OVERLAP", ov.x+ov.w/2-22, ov.y+ov.h/2+4);
      }
    }

    // ── Live track IDs near cameras ──────────────────────────────────────────
    cameras.forEach(cam => {
      const camTracks = tracks[cam.id] || [];
      const color = CAM_COLORS[cameras.indexOf(cam) % CAM_COLORS.length];
      camTracks.forEach((t, i) => {
        const cx = mToPx(cam.position_m?.x || cam.position?.x || 5, cam.position_m?.y || cam.position?.y || 5);
        ctx.fillStyle = color; ctx.font = "bold 10px monospace";
        ctx.fillText(`#${t.id}`, cx.x+14, cx.y-14-i*12);
      });
    });

    // ── Drawing polygon preview ──────────────────────────────────────────────
    if (tool === "zone" && drawPts.length > 0) {
      ctx.beginPath(); ctx.moveTo(drawPts[0].x, drawPts[0].y);
      drawPts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      if (mouse) ctx.lineTo(mouse.x, mouse.y);
      ctx.strokeStyle = "#ffffff88"; ctx.lineWidth = 1.5;
      ctx.setLineDash([6,4]); ctx.stroke(); ctx.setLineDash([]);
      drawPts.forEach((p, i) => {
        ctx.beginPath(); ctx.arc(p.x, p.y, i===0 ? 6 : 4, 0, Math.PI*2);
        ctx.fillStyle = i===0 ? "#ffffff" : "#aaaaaa"; ctx.fill();
        ctx.strokeStyle = "#000"; ctx.lineWidth = 1; ctx.stroke();
      });
      if (drawPts.length >= 3 && mouse) {
        const d = Math.hypot(mouse.x-drawPts[0].x, mouse.y-drawPts[0].y);
        if (d < 20) {
          ctx.beginPath(); ctx.arc(drawPts[0].x, drawPts[0].y, 11, 0, Math.PI*2);
          ctx.strokeStyle = "#ffffff66"; ctx.lineWidth = 2; ctx.stroke();
        }
      }
    }

    // ── Camera icons ─────────────────────────────────────────────────────────
    cameras.forEach(cam => {
      const pos    = cam.position_m || cam.position || { x:5, y:5 };
      const p      = mToPx(pos.x, pos.y);
      const color  = CAM_COLORS[cameras.indexOf(cam) % CAM_COLORS.length];
      const sel    = cam.id === selectedId;
      const r      = sel ? 11 : 9;
      const st     = cam.type === "ptz" ? (ptzStates[cam.id]?.status || "idle") : null;
      const stColor = st ? STATE_COLOR[st] : color;

      if (cam.type === "ptz") {
        const lims    = cam.ptz_limits || { pan_min:-170, pan_max:170 };
        const arcR    = r + 14;
        const halfSpan = Math.min(Math.abs(lims.pan_max - lims.pan_min) / 2, 170) * (Math.PI / 180);
        ctx.beginPath();
        ctx.arc(p.x, p.y, arcR, -Math.PI/2 - halfSpan, -Math.PI/2 + halfSpan);
        ctx.strokeStyle = stColor + "55"; ctx.lineWidth = 2;
        ctx.setLineDash([3,3]); ctx.stroke(); ctx.setLineDash([]);
      }

      if (st) {
        const glowR = r + (st === "tracking" ? 4 + 2*Math.abs(Math.sin(tick*0.6)) : 4);
        ctx.beginPath(); ctx.arc(p.x, p.y, glowR, 0, Math.PI*2);
        ctx.strokeStyle = stColor + (st === "tracking" ? "bb" : "66");
        ctx.lineWidth = 1.5; ctx.stroke();
      } else if (sel) {
        ctx.beginPath(); ctx.arc(p.x, p.y, r+4, 0, Math.PI*2);
        ctx.strokeStyle = color + "88"; ctx.lineWidth = 1.5; ctx.stroke();
      }

      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI*2);
      ctx.fillStyle  = sel ? color : "#111e2a"; ctx.fill();
      ctx.strokeStyle = stColor || color; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI*2);
      ctx.fillStyle = sel ? "#000" : stColor || color; ctx.fill();

      ctx.fillStyle = "#c8d8e4"; ctx.font = "bold 11px monospace";
      ctx.fillText(cam.name, p.x+r+5, p.y-3);
      ctx.fillStyle = cam.type === "ptz" ? "#f59e0b" : "#3b9ef5";
      ctx.font = "9px monospace";
      ctx.fillText(cam.type === "ptz" ? "PTZ" : "FIXED", p.x+r+5, p.y+9);

      const tCount = (tracks[cam.id] || []).length;
      if (tCount > 0) {
        ctx.beginPath(); ctx.arc(p.x+r, p.y-r, 7, 0, Math.PI*2);
        ctx.fillStyle = "#ef4444"; ctx.fill();
        ctx.fillStyle = "#fff"; ctx.font = "bold 9px monospace";
        ctx.fillText(String(tCount), p.x+r-3, p.y-r+3);
      }

      if (st === "holding") {
        const rem = ptzStates[cam.id]?.hold_remaining ?? 0;
        const bx = p.x-18, by = p.y+r+4;
        ctx.fillStyle = "#f59e0b22"; ctx.fillRect(bx, by, 36, 13);
        ctx.strokeStyle = "#f59e0b88"; ctx.lineWidth = 1; ctx.strokeRect(bx, by, 36, 13);
        ctx.fillStyle = "#f59e0b"; ctx.font = "bold 9px monospace";
        ctx.fillText(`${rem}s`, bx+8, by+10);
      }

      if (st && st !== "idle") {
        ctx.fillStyle = stColor + "cc"; ctx.font = "8px monospace";
        ctx.fillText(st.toUpperCase(), p.x+r+5, p.y+20);
      }
    });

    if (tool === "place" && mouse) {
      ctx.strokeStyle = "#00d08466"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 9, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mouse.x-14, mouse.y); ctx.lineTo(mouse.x+14, mouse.y);
      ctx.moveTo(mouse.x, mouse.y-14); ctx.lineTo(mouse.x, mouse.y+14);
      ctx.stroke();
    }
  }, [cameras, selectedId, tool, drawPts, mouse, mToPx, yard, tracks, ptzStates, selected, tick]);

  // ── Canvas events ────────────────────────────────────────────────────────────
  const saveZone = useCallback(() => {
    const zoneM = drawPts.map(p => pxToM(p.x, p.y));
    setCameras(p => p.map(c => c.id === selectedId ? { ...c, zone_polygon_m: zoneM, zone: zoneM } : c));
    setDrawPts([]); setTool("select");
  }, [drawPts, selectedId, pxToM, setCameras]);

  const handleClick = useCallback(e => {
    const pos = getPos(e);
    if (tool === "place") {
      const m  = pxToM(pos.x, pos.y);
      const ip = `192.168.31.${100 + cameras.length}`;
      const nc = {
        id: uid(), name: `CAM-${cameras.length + 1}`,
        rtsp_4k: `rtsp://admin:pass@${ip}/user=admin&password=pass&stream=0.sdp`,
        rtsp_sd: `rtsp://admin:pass@${ip}/user=admin&password=pass&stream=1.sdp`,
        ip, type: "ptz",
        onvif_url: `http://admin:pass@${ip}:80/onvif/device_service`,
        position_m: m, position: m, zone_polygon_m: [], zone: [],
        ptz_limits: { pan_min:-170, pan_max:170, tilt_min:-90, tilt_max:30 },
      };
      setCameras(p => [...p, nc]);
      setSelectedId(nc.id); setTool("select"); return;
    }
    if (tool === "zone") {
      if (drawPts.length >= 3) {
        const d = Math.hypot(pos.x-drawPts[0].x, pos.y-drawPts[0].y);
        if (d < 20) { saveZone(); return; }
      }
      setDrawPts(p => [...p, pos]); return;
    }
    if (tool === "select") {
      let found = null;
      cameras.forEach(cam => {
        const pos2 = cam.position_m || cam.position || { x:5, y:5 };
        const p    = mToPx(pos2.x, pos2.y);
        if (Math.hypot(pos.x-p.x, pos.y-p.y) < 16) found = cam.id;
      });
      setSelectedId(found);
    }
  }, [tool, drawPts, cameras, getPos, pxToM, mToPx, saveZone, setCameras]);

  const handleDbl  = useCallback(() => {
    if (tool === "zone" && drawPts.length >= 3) saveZone();
  }, [tool, drawPts, saveZone]);

  const handleMove = useCallback(e => {
    setMouse(tool === "place" || tool === "zone" ? getPos(e) : null);
  }, [tool, getPos]);

  const updateCam = (id, f, v) => setCameras(p => p.map(c => c.id===id ? { ...c, [f]:v } : c));
  const updatePtz = (id, f, v) => setCameras(p => p.map(c => c.id===id ? { ...c, ptz_limits:{ ...c.ptz_limits, [f]:parseFloat(v) } } : c));
  const deleteCam = id => { setCameras(p => p.filter(c => c.id !== id)); if (selectedId === id) setSelectedId(null); };

  return (
    <div style={styles.mapLayout}>
      {/* ── Toolbar ── */}
      <div style={styles.toolbar}>
        <ToolSec label="TOOL">
          {[["select","↖ SELECT"],["place","+ PLACE CAM"]].map(([t,l]) => (
            <button key={t} onClick={() => { setTool(t); setDrawPts([]); }}
              style={{ ...styles.toolBtn, ...(tool===t ? styles.toolBtnOn : {}) }}>
              {l}
            </button>
          ))}
        </ToolSec>

        {selected && (
          <ToolSec label="ZONE">
            <button onClick={() => { setDrawPts([]); setTool("zone"); }}
              style={{ ...styles.toolBtn, ...(tool==="zone" ? styles.toolBtnOn : {}) }}>
              ✏ DRAW ZONE
            </button>
            <button
              onClick={() => setCameras(p => p.map(c => c.id===selectedId ? { ...c, zone_polygon_m:[], zone:[] } : c))}
              style={styles.toolBtnDanger}>
              ✕ CLEAR ZONE
            </button>
            {tool === "zone" && (
              <div style={styles.hint}>
                Клік → точка<br/>
                Біля початку або<br/>
                дабл-клік → закрити
              </div>
            )}
          </ToolSec>
        )}

        <ToolSec label="ДВІР (м)">
          {[["w","Ш"],["h","В"]].map(([k,l]) => (
            <div key={k} style={{ display:"flex", alignItems:"center", gap:6 }}>
              <span style={styles.miniLabel}>{l}</span>
              <input type="number" value={yard[k]} min={5} max={200}
                onChange={e => setYard(v => ({ ...v, [k]: parseFloat(e.target.value) || v[k] }))}
                style={{ ...styles.numInput, flex:1 }}/>
            </div>
          ))}
        </ToolSec>

        <div style={{ marginTop:"auto" }}>
          <div style={styles.miniLabel}>LEGEND</div>
          {LEGEND.map(([c, l]) => (
            <div key={l} style={{ display:"flex", alignItems:"center", gap:6, marginTop:5 }}>
              <span style={{ width:8, height:8, borderRadius:"50%", background:c, flexShrink:0 }}/>
              <span style={{ fontSize:9, color:"#6a8292" }}>{l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Canvas ── */}
      <div style={styles.canvasWrap}>
        <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
          onClick={handleClick} onMouseMove={handleMove}
          onDoubleClick={handleDbl} onMouseLeave={() => setMouse(null)}
          style={{ ...styles.canvas, cursor: tool==="place"||tool==="zone" ? "crosshair" : "default" }}
        />
        <div style={styles.mapFoot}>{yard.w}м × {yard.h}м</div>
      </div>

      {/* ── Side panel ── */}
      <div style={styles.sidePanel}>
        {selected
          ? <CamPanel
              cam={selected}
              color={colorOf(selected)}
              ptzState={ptzStates[selected.id]}
              onUpdate={(f,v) => updateCam(selected.id, f, v)}
              onPtz={(f,v)    => updatePtz(selected.id, f, v)}
              onDelete={() => deleteCam(selected.id)}
            />
          : <div style={styles.empty}>
              <div style={{ fontSize:28, marginBottom:12, opacity:.3 }}>⊡</div>
              <div style={{ fontSize:11, lineHeight:1.9, color:"#3a5262" }}>
                Обери камеру<br/>або <b style={{ color:"#00d08488" }}>+ PLACE CAM</b>
              </div>
            </div>
        }
      </div>
    </div>
  );
}
