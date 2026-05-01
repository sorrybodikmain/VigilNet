import { useState } from "react";
import { styles } from "../styles.js";
import { StateBadge, Fld } from "./ui.jsx";

export function CamCard({ cam, color, tracks, ptzState, onUpdate, onPtz, onDelete }) {
  const [open, setOpen] = useState(false);
  const zone = cam.zone_polygon_m || cam.zone || [];

  return (
    <div style={{ ...styles.card, borderLeftColor: color }}>
      <div style={styles.cardRow} onClick={() => setOpen(!open)}>
        <span style={{ width:8, height:8, borderRadius:"50%", background:color }}/>
        <span style={{ fontSize:13, fontWeight:"bold", flex:1 }}>{cam.name}</span>
        <span style={{ fontSize:9, border:`1px solid ${color}`, color, padding:"2px 4px", letterSpacing:1 }}>
          {cam.type.toUpperCase()}
        </span>
        <span style={{ fontSize:10, color:"#4a6272" }}>{cam.ip}</span>
        <StateBadge st={ptzState}/>
        {tracks.length > 0 && (
          <span style={{ fontSize:10, color:"#ef4444" }}>● {tracks.length}</span>
        )}
        <span style={{
          fontSize:9, padding:"2px 6px", borderRadius:2, letterSpacing:1,
          background: zone.length >= 3 ? "#00d08420" : "#1a1a1a",
          color:      zone.length >= 3 ? "#00d084"   : "#555",
        }}>
          {zone.length >= 3 ? "ZONE ✓" : "NO ZONE"}
        </span>
        <span style={{ fontSize:9, color:"#3a5262" }}>{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div style={{ padding:"0 14px 14px", borderTop:"1px solid #1a2a35" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, paddingTop:12 }}>
            {[["NAME","name"],["IP","ip"]].map(([l,f]) => (
              <div key={f}>
                <div style={styles.miniLabel}>{l}</div>
                <input value={cam[f] || ""} onChange={e => onUpdate(f, e.target.value)} style={styles.inp}/>
              </div>
            ))}
            <div style={{ gridColumn:"1/-1" }}>
              <Fld label="RTSP 4K (detection)">
                <input value={cam.rtsp_4k || ""} onChange={e => onUpdate("rtsp_4k", e.target.value)} style={styles.inp}/>
              </Fld>
            </div>
            <div style={{ gridColumn:"1/-1" }}>
              <Fld label="RTSP SD (display)">
                <input value={cam.rtsp_sd || ""} onChange={e => onUpdate("rtsp_sd", e.target.value)} style={styles.inp}/>
              </Fld>
            </div>
            <div>
              <div style={styles.miniLabel}>TYPE</div>
              <select value={cam.type} onChange={e => onUpdate("type", e.target.value)} style={styles.inp}>
                <option value="fixed">Fixed</option>
                <option value="ptz">PTZ</option>
              </select>
            </div>
            <div style={{ gridColumn:"1/-1", display:"flex", alignItems:"center", gap:8 }}>
              <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", userSelect:"none" }}>
                <input
                  type="checkbox"
                  checked={!!cam.split_stream}
                  onChange={e => onUpdate("split_stream", e.target.checked)}
                  style={{ accentColor:"#00d084", width:12, height:12 }}
                />
                <span style={{ fontSize:10, color:"#6a8292", letterSpacing:1 }}>SPLIT STREAM</span>
              </label>
              {cam.split_stream && (
                <span style={{ fontSize:9, color:"#00d084", background:"#00d08415",
                  border:"1px solid #00d08440", padding:"1px 6px", letterSpacing:1 }}>
                  ↑ FIXED  /  ↓ PTZ
                </span>
              )}
            </div>
            {cam.type === "ptz" && (
              <div style={{ gridColumn:"1/-1" }}>
                <div style={styles.miniLabel}>ONVIF URL</div>
                <input value={cam.onvif_url || ""} onChange={e => onUpdate("onvif_url", e.target.value)} style={styles.inp}/>
              </div>
            )}
          </div>

          {cam.type === "ptz" && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginTop:10 }}>
              {[["pan_min","Pan Min°"],["pan_max","Pan Max°"],["tilt_min","Tilt Min°"],["tilt_max","Tilt Max°"]].map(([k,l]) => (
                <div key={k}>
                  <div style={styles.miniLabel}>{l}</div>
                  <input type="number" value={cam.ptz_limits?.[k] ?? 0}
                    onChange={e => onPtz(k, e.target.value)}
                    style={{ ...styles.inp, textAlign:"center" }}/>
                </div>
              ))}
            </div>
          )}

          <button onClick={onDelete} style={{ ...styles.deleteBtnFull, marginTop:10 }}>✕ REMOVE</button>
        </div>
      )}
    </div>
  );
}
