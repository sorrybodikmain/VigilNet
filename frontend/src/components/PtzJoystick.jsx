import { useCallback, useRef } from "react";

const SPEED_PT = 0.4;
const SPEED_Z  = 0.3;

const btn = {
  width: 30, height: 30,
  background: "#0d1520",
  border: "1px solid #1a2a35",
  color: "#7a9aaa",
  cursor: "pointer",
  fontFamily: "'Courier New', monospace",
  fontSize: 13,
  lineHeight: "30px",
  textAlign: "center",
  userSelect: "none",
  padding: 0,
  display: "block",
  boxSizing: "border-box",
};

const btnStop = {
  ...btn,
  color: "#ef4444",
  border: "1px solid #3a1a1a",
};

export function PtzJoystick({ camId, isManual, manualRemaining, hasZoom = true }) {
  const activeRef = useRef(false);

  const sendMove = useCallback((pan, tilt, zoom = 0) => {
    activeRef.current = true;
    fetch(`/api/ptz/${camId}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pan, tilt, zoom }),
    }).catch(() => {});
  }, [camId]);

  const sendStop = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    fetch(`/api/ptz/${camId}/stop`, { method: "POST" }).catch(() => {});
  }, [camId]);

  const press = (pan, tilt, zoom = 0) => ({
    onMouseDown:   (e) => { e.preventDefault(); sendMove(pan, tilt, zoom); },
    onMouseUp:     sendStop,
    onMouseLeave:  sendStop,
    onTouchStart:  (e) => { e.preventDefault(); sendMove(pan, tilt, zoom); },
    onTouchEnd:    sendStop,
    onTouchCancel: sendStop,
  });

  const stopProps = {
    onMouseDown:  (e) => { e.preventDefault(); sendStop(); },
    onTouchStart: (e) => { e.preventDefault(); activeRef.current = true; sendStop(); },
  };

  return (
    <div style={{
      padding: "8px 12px",
      borderTop: "1px solid #1a2a35",
      display: "flex",
      alignItems: "center",
      gap: 14,
      background: "#07090e",
    }}>
      <div style={{ fontSize: 8, color: "#3a5262", letterSpacing: 2, whiteSpace: "nowrap" }}>
        PTZ
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 30px)",
        gridTemplateRows: "repeat(3, 30px)",
        gap: 2,
      }}>
        <div/>
        <button style={btn} {...press(0, SPEED_PT)}>↑</button>
        <div/>
        <button style={btn} {...press(-SPEED_PT, 0)}>←</button>
        <button style={btnStop} {...stopProps}>■</button>
        <button style={btn} {...press(SPEED_PT, 0)}>→</button>
        <div/>
        <button style={btn} {...press(0, -SPEED_PT)}>↓</button>
        <div/>
      </div>

      {hasZoom ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 8, color: "#3a5262", letterSpacing: 2, marginBottom: 2, textAlign: "center" }}>
            ZOOM
          </div>
          <button style={btn} {...press(0, 0, SPEED_Z)}>+</button>
          <button style={btn} {...press(0, 0, -SPEED_Z)}>−</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{ fontSize: 8, color: "#3a5262", letterSpacing: 2, marginBottom: 2 }}>ZOOM</div>
          <div style={{
            fontSize: 8, color: "#3a5262", border: "1px solid #1a2a35",
            padding: "3px 6px", letterSpacing: 1, textAlign: "center",
          }}>N/A</div>
        </div>
      )}

      {isManual && (
        <div style={{
          fontSize: 9,
          color: "#f59e0b",
          letterSpacing: 1,
          border: "1px solid #f59e0b44",
          padding: "3px 8px",
          background: "#f59e0b11",
          whiteSpace: "nowrap",
          marginLeft: "auto",
        }}>
          MANUAL{manualRemaining != null ? ` ${manualRemaining}s` : ""}
        </div>
      )}
    </div>
  );
}
