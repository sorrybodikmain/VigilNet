import { styles } from "../styles.js";
import { STATE_COLOR } from "../constants.js";
import { Fld } from "./ui.jsx";

export function CamPanel({ cam, color, ptzState, onUpdate, onPtz, onDelete }) {
  const zone = cam.zone_polygon_m || cam.zone || [];
  const st   = ptzState;

  return (
    <div style={{ padding:14, display:"flex", flexDirection:"column", gap:8 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, paddingBottom:10,
        borderBottom:"1px solid #1a2a35", marginBottom:4 }}>
        <span style={{ width:8, height:8, borderRadius:"50%", background:color, flexShrink:0 }}/>
        <span style={{ fontSize:13, fontWeight:"bold", flex:1 }}>{cam.name}</span>
        <span style={{ fontSize:9, border:`1px solid ${color}`, color, padding:"2px 5px", letterSpacing:1 }}>
          {cam.type.toUpperCase()}
        </span>
      </div>

      {st && (
        <div style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 8px",
          background: STATE_COLOR[st.status]+"11",
          border: `1px solid ${STATE_COLOR[st.status]}44`, borderRadius:2 }}>
          <span style={{ width:6, height:6, borderRadius:"50%", background:STATE_COLOR[st.status] }}/>
          <span style={{ fontSize:10, color:STATE_COLOR[st.status], letterSpacing:1 }}>
            {st.status.toUpperCase()}
            {st.status === "holding" && st.hold_remaining != null && ` — ${st.hold_remaining}s`}
          </span>
        </div>
      )}

      <Fld label="NAME">
        <input value={cam.name} onChange={e => onUpdate("name", e.target.value)} style={styles.inp}/>
      </Fld>
      <Fld label="TYPE">
        <select value={cam.type} onChange={e => onUpdate("type", e.target.value)} style={styles.inp}>
          <option value="fixed">Fixed</option>
          <option value="ptz">PTZ (Pan-Tilt-Zoom)</option>
        </select>
      </Fld>
      <Fld label="IP">
        <input value={cam.ip} onChange={e => onUpdate("ip", e.target.value)} style={styles.inp}/>
      </Fld>
      <Fld label="RTSP 4K (detection)">
        <input value={cam.rtsp_4k || ""} onChange={e => onUpdate("rtsp_4k", e.target.value)} style={styles.inp}/>
      </Fld>
      <Fld label="RTSP SD (display)">
        <input value={cam.rtsp_sd || ""} onChange={e => onUpdate("rtsp_sd", e.target.value)} style={styles.inp}/>
      </Fld>

      {cam.type === "ptz" && <>
        <Fld label="ONVIF URL">
          <input value={cam.onvif_url || ""} onChange={e => onUpdate("onvif_url", e.target.value)} style={styles.inp}/>
        </Fld>
        <div style={styles.miniLabel}>PTZ LIMITS (°)</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
          {[["pan_min","Pan Min"],["pan_max","Pan Max"],["tilt_min","Tilt Min"],["tilt_max","Tilt Max"]].map(([k,l]) => (
            <div key={k}>
              <div style={styles.miniLabel}>{l}</div>
              <input type="number" value={cam.ptz_limits?.[k] ?? 0}
                onChange={e => onPtz(k, e.target.value)}
                style={{ ...styles.inp, textAlign:"center" }}/>
            </div>
          ))}
        </div>
      </>}

      <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginTop:4 }}>
        <span style={styles.miniLabel}>ZONE</span>
        <span style={{ color: zone.length >= 3 ? "#00d084" : "#555" }}>
          {zone.length >= 3 ? `${zone.length} pts ✓` : "Not drawn"}
        </span>
      </div>

      <button onClick={onDelete} style={styles.deleteBtnFull}>✕ REMOVE CAMERA</button>
    </div>
  );
}
