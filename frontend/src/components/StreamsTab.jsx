import { styles } from "../styles.js";
import { CAM_COLORS, STATE_COLOR } from "../constants.js";
import { StateBadge } from "./ui.jsx";
import { PtzJoystick } from "./PtzJoystick.jsx";

export function StreamsTab({ cameras, tracks, ptzStates }) {
  return (
    <div style={styles.streamsTab}>
      <div style={styles.camTabHeader}>
        <span style={{ fontSize:11, letterSpacing:3, color:"#6a8292" }}>LIVE STREAMS</span>
        <span style={{ fontSize:10, color:"#3a5262" }}>MJPEG з bbox детекції</span>
      </div>

      <div style={styles.streamsGrid}>
        {cameras.map((cam, i) => {
          const camTracks = tracks[cam.id] || [];
          const color     = CAM_COLORS[i % CAM_COLORS.length];
          const st        = ptzStates[cam.id];
          return (
            <div key={cam.id} style={styles.streamCard}>
              <div style={{ ...styles.streamHeader, borderColor: color }}>
                <span style={{ width:6, height:6, borderRadius:"50%", background:color }}/>
                <span style={{ fontWeight:"bold", fontSize:12 }}>{cam.name}</span>
                <span style={{ fontSize:9, border:`1px solid ${color}`, color, padding:"1px 4px" }}>
                  {cam.type.toUpperCase()}
                </span>
                <StateBadge st={st} inline/>
                {camTracks.length > 0 && (
                  <span style={{ fontSize:10, color:"#ef4444", marginLeft:"auto" }}>
                    ● {camTracks.length} особ
                  </span>
                )}
              </div>

              <div style={styles.streamImgWrap}>
                <img
                  src={`/api/stream/${cam.id}`}
                  alt={cam.name}
                  style={styles.streamImg}
                  onError={e => { e.target.style.display = "none"; }}
                />
                {camTracks.length === 0 && (
                  <div style={styles.streamNoTrack}>Очікування детекції...</div>
                )}
              </div>

              {cam.type === "ptz" && (
                <PtzJoystick
                  camId={cam.id}
                  isManual={st?.manual}
                  manualRemaining={st?.manual_remaining}
                />
              )}

              <div style={styles.streamFooter}>
                {camTracks.map(t => (
                  <span key={t.id} style={styles.trackBadge}>#{t.id}</span>
                ))}
                {camTracks.length === 0 && (
                  <span style={{ color:"#3a5262", fontSize:10 }}>—</span>
                )}
              </div>
            </div>
          );
        })}

        {cameras.length === 0 && (
          <div style={{ ...styles.empty, gridColumn:"1/-1", padding:40 }}>
            Спочатку налаштуй камери на вкладці MAP.
          </div>
        )}
      </div>
    </div>
  );
}
