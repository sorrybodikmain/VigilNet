import { styles } from "../styles.js";
import { CAM_COLORS } from "../constants.js";
import { CamCard } from "./CamCard.jsx";

export function CamerasTab({ cameras, tracks, ptzStates, capabilities = {}, onAdd, onUpdate, onPtz, onDelete }) {
  return (
    <div style={styles.camTab}>
      <div style={styles.camTabHeader}>
        <span style={{ fontSize:11, letterSpacing:3, color:"#6a8292" }}>
          CAMERAS ({cameras.length})
        </span>
        <button onClick={onAdd} style={styles.addBtn}>+ ADD CAMERA</button>
      </div>

      <div style={styles.camCards}>
        {cameras.length === 0 && (
          <div style={{ ...styles.empty, padding:40 }}>
            Немає камер. Додай через кнопку або намалюй на карті.
          </div>
        )}
        {cameras.map((cam, i) => (
          <CamCard
            key={cam.id}
            cam={cam}
            color={CAM_COLORS[i % CAM_COLORS.length]}
            tracks={tracks[cam.id] || []}
            ptzState={ptzStates[cam.id]}
            caps={capabilities[cam.id]}
            onUpdate={(f, v) => onUpdate(cam.id, f, v)}
            onPtz={(f, v) => onPtz(cam.id, f, v)}
            onDelete={() => onDelete(cam.id)}
          />
        ))}
      </div>
    </div>
  );
}
