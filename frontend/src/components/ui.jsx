import { styles } from "../styles.js";
import { STATE_COLOR } from "../constants.js";

export function Fld({ label, children }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={styles.miniLabel}>{label}</div>
      {children}
    </div>
  );
}

export function ToolSec({ label, children }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
      <div style={{ fontSize:9, color:"#3a5262", letterSpacing:2, marginBottom:2 }}>{label}</div>
      {children}
    </div>
  );
}

export function StateBadge({ st, inline = false }) {
  if (!st) return null;
  const color = STATE_COLOR[st.status];
  const label = st.status.toUpperCase();
  const countdown = st.status === "holding" && st.hold_remaining != null ? ` ${st.hold_remaining}s` : "";
  return (
    <span style={{
      fontSize: 9,
      padding: inline ? "1px 5px" : "2px 5px",
      background: color + "22",
      color,
      border: `1px solid ${color}55`,
    }}>
      {label}{countdown}
    </span>
  );
}

export function getBBox(pts) {
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  return {
    x: Math.min(...xs), y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
}

export function rectsOverlap(a, b) {
  const x  = Math.max(a.x, b.x),   y  = Math.max(a.y, b.y);
  const x2 = Math.min(a.x+a.w, b.x+b.w), y2 = Math.min(a.y+a.h, b.y+b.h);
  if (x2 <= x || y2 <= y) return null;
  return { x, y, w: x2-x, h: y2-y };
}
