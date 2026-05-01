import { useState } from "react";
import { styles } from "../styles.js";
import { CAM_COLORS, DEFAULT_TRACKING } from "../constants.js";

export function ExportTab({ cameras, yard }) {
  const [copied, setCopied] = useState(false);

  const config = JSON.stringify({
    version: "1.0",
    yard: { width_m: yard.w, height_m: yard.h },
    cameras: cameras.map((c, i) => ({
      ...c,
      position_m:     c.position_m || c.position,
      zone_polygon_m: c.zone_polygon_m || c.zone || [],
      color:          CAM_COLORS[i % CAM_COLORS.length],
      ptz_limits:     c.type === "ptz" ? c.ptz_limits : null,
    })),
    tracking: DEFAULT_TRACKING,
  }, null, 2);

  const copy = () => {
    navigator.clipboard.writeText(config);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const download = () => {
    const a = document.createElement("a");
    a.href     = URL.createObjectURL(new Blob([config], { type:"application/json" }));
    a.download = "camtrack_config.json";
    a.click();
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", flex:1, overflow:"hidden", padding:20, gap:12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <div style={{ fontSize:13, letterSpacing:4, color:"#00d084", marginBottom:4 }}>EXPORT CONFIG</div>
          <div style={{ fontSize:10, color:"#4a6272" }}>
            Цей файл вже автоматично зберігається на backend через SAVE & APPLY
          </div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={copy} style={styles.ghostBtn}>{copied ? "✓ COPIED" : "⎘  COPY"}</button>
          <button onClick={download} style={styles.accentBtn}>↓  DOWNLOAD</button>
        </div>
      </div>

      <div style={{ background:"#0d1520", border:"1px solid #1a2a35", padding:"8px 14px", fontSize:11, display:"flex", gap:12, alignItems:"center" }}>
        <span style={{ fontSize:9, color:"#4a6272", letterSpacing:2 }}>PATH</span>
        <code style={{ color:"#00d084", fontFamily:"inherit" }}>/app/config/camtrack_config.json</code>
      </div>

      <pre style={{ flex:1, background:"#0a0f14", border:"1px solid #1a2a35", padding:14,
        overflow:"auto", fontSize:11, lineHeight:1.7, color:"#7a9aaa", margin:0, fontFamily:"monospace" }}>
        {config}
      </pre>
    </div>
  );
}
