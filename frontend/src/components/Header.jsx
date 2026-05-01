import { styles } from "../styles.js";

export function Header({ tab, setTab, cameras, tracks, saving, onSave }) {
  const totalTracks = Object.values(tracks).reduce((a, t) => a + t.length, 0);
  const zoneCount   = cameras.filter(c => (c.zone_polygon_m?.length || c.zone?.length || 0) > 2).length;

  return (
    <header style={styles.header}>
      <div style={styles.brand}>
        <div style={styles.brandIcon}>◈</div>
        <div>
          <div style={styles.brandName}>CAMTRACK</div>
          <div style={styles.brandSub}>multi-camera zone configurator</div>
        </div>
      </div>

      <nav style={styles.nav}>
        {[["map","⬚  MAP"],["cameras","⊞  CAMERAS"],["streams","▶  STREAMS"],["export","⟨/⟩  EXPORT"]].map(([id,lbl]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ ...styles.navBtn, ...(tab === id ? styles.navBtnOn : {}) }}>
            {lbl}
          </button>
        ))}
      </nav>

      <div style={styles.statusBar}>
        <span style={{
          ...styles.statusDot,
          ...(totalTracks > 0 ? { background:"#ef4444", boxShadow:"0 0 5px #ef4444" } : {}),
        }}/>
        {cameras.length} CAM &nbsp;·&nbsp; {zoneCount} ZONES
        {totalTracks > 0 && (
          <span style={{ color:"#ef4444" }}>&nbsp;·&nbsp; {totalTracks} TRACKED</span>
        )}
      </div>

      <button onClick={onSave} disabled={saving} style={styles.saveBtn}>
        {saving ? "⏳ ЗБЕРЕЖЕННЯ..." : "💾 SAVE & APPLY"}
      </button>
    </header>
  );
}
