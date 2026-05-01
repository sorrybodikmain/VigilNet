import { styles } from "../styles.js";
import { CAM_COLORS, STATE_COLOR } from "../constants.js";
import { StateBadge } from "./ui.jsx";
import { PtzJoystick } from "./PtzJoystick.jsx";

function SplitStreamCard({ cam, color, tracks, ptzState }) {
  const topTracks = tracks[cam.id + "_top"] || [];
  const botTracks = tracks[cam.id + "_bot"] || [];
  const total     = topTracks.length + botTracks.length;

  return (
    <div style={{
      ...styles.streamCard,
      gridColumn: "1 / -1",
      maxWidth: 960,
    }}>
      <div style={{
        ...styles.streamHeader,
        borderColor: color,
        gap: 8,
        flexWrap: "wrap",
      }}>
        <span style={{ width:6, height:6, borderRadius:"50%", background:color, flexShrink:0 }}/>
        <span style={{ fontWeight:"bold", fontSize:12 }}>{cam.name}</span>
        <span style={{
          fontSize:9, background:"#00d08415", border:"1px solid #00d08440",
          color:"#00d084", padding:"1px 6px", letterSpacing:1,
        }}>
          SPLIT
        </span>
        <span style={{ fontSize:9, border:`1px solid ${color}`, color, padding:"1px 4px", letterSpacing:1 }}>
          {cam.type.toUpperCase()}
        </span>
        <StateBadge st={ptzState} inline/>
        {total > 0 && (
          <span style={{ fontSize:10, color:"#ef4444", marginLeft:"auto" }}>
            ● {total} особ
          </span>
        )}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr" }}>
        <div style={{ borderRight:"1px solid #1a2a35" }}>
          <div style={{
            display:"flex", alignItems:"center", gap:6, padding:"5px 10px",
            background:"#00d08408", borderBottom:"1px solid #1a2535",
          }}>
            <span style={{ fontSize:9, color:"#00d084", letterSpacing:2, fontWeight:"bold" }}>↑ FIXED</span>
            {topTracks.length > 0 && (
              <span style={{ fontSize:9, color:"#ef4444", marginLeft:"auto" }}>● {topTracks.length}</span>
            )}
          </div>
          <div style={{ position:"relative", background:"#040608", minHeight:140 }}>
            <img
              src={`/api/stream/${cam.id}_top`}
              alt={`${cam.name} top`}
              style={{ width:"100%", display:"block" }}
              onError={e => { e.target.style.display = "none"; }}
            />
            {topTracks.length === 0 && (
              <div style={styles.streamNoTrack}>Очікування детекції...</div>
            )}
          </div>
          <div style={{ ...styles.streamFooter, borderTop:"1px solid #1a2535" }}>
            {topTracks.map(t => (
              <span key={t.id} style={styles.trackBadge}>#{t.id}</span>
            ))}
            {topTracks.length === 0 && (
              <span style={{ color:"#3a5262", fontSize:10 }}>—</span>
            )}
          </div>
        </div>

        <div>
          <div style={{
            display:"flex", alignItems:"center", gap:6, padding:"5px 10px",
            background:"#f59e0b08", borderBottom:"1px solid #1a2535",
          }}>
            <span style={{ fontSize:9, color:"#f59e0b", letterSpacing:2, fontWeight:"bold" }}>↓ PTZ</span>
            <StateBadge st={ptzState} inline/>
            {botTracks.length > 0 && (
              <span style={{ fontSize:9, color:"#ef4444", marginLeft:"auto" }}>● {botTracks.length}</span>
            )}
          </div>
          <div style={{ position:"relative", background:"#040608", minHeight:140 }}>
            <img
              src={`/api/stream/${cam.id}_bot`}
              alt={`${cam.name} bot`}
              style={{ width:"100%", display:"block" }}
              onError={e => { e.target.style.display = "none"; }}
            />
            {botTracks.length === 0 && (
              <div style={styles.streamNoTrack}>Очікування детекції...</div>
            )}
          </div>
          {cam.type === "ptz" && (
            <PtzJoystick
              camId={cam.id}
              isManual={ptzState?.manual}
              manualRemaining={ptzState?.manual_remaining}
            />
          )}
          <div style={{ ...styles.streamFooter, borderTop:"1px solid #1a2535" }}>
            {botTracks.map(t => (
              <span key={t.id} style={{ ...styles.trackBadge, background:"#f59e0b22", color:"#f59e0b", border:"1px solid #f59e0b44" }}>
                #{t.id}
              </span>
            ))}
            {botTracks.length === 0 && (
              <span style={{ color:"#3a5262", fontSize:10 }}>—</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function StreamsTab({ cameras, tracks, ptzStates }) {
  return (
    <div style={styles.streamsTab}>
      <div style={styles.camTabHeader}>
        <span style={{ fontSize:11, letterSpacing:3, color:"#6a8292" }}>LIVE STREAMS</span>
        <span style={{ fontSize:10, color:"#3a5262" }}>MJPEG з bbox детекції</span>
      </div>

      <div style={styles.streamsGrid}>
        {cameras.map((cam, i) => {
          const color = CAM_COLORS[i % CAM_COLORS.length];
          const st    = ptzStates[cam.id];

          if (cam.split_stream) {
            return (
              <SplitStreamCard
                key={cam.id}
                cam={cam}
                color={color}
                tracks={tracks}
                ptzState={st}
              />
            );
          }

          const camTracks = tracks[cam.id] || [];
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
