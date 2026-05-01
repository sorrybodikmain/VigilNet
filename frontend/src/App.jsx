import { useState, useEffect } from "react";
import { CAM_COLORS, DEFAULT_PTZ_LIMITS, DEFAULT_TRACKING, makeCameraTemplate } from "./constants.js";
import { styles } from "./styles.js";
import { useWebSocket } from "./hooks/useWebSocket.js";
import { Header } from "./components/Header.jsx";
import { MapTab } from "./components/MapTab.jsx";
import { CamerasTab } from "./components/CamerasTab.jsx";
import { StreamsTab } from "./components/StreamsTab.jsx";
import { CalibrationTab } from "./components/CalibrationTab.jsx";
import { ExportTab } from "./components/ExportTab.jsx";

export function App() {
  const [tab, setTab]               = useState("map");
  const [cameras, setCameras]       = useState([]);
  const [yard, setYard]             = useState({ w:20, h:15 });
  const [toast, setToast]           = useState(null);
  const [saving, setSaving]         = useState(false);
  const [loading, setLoading]       = useState(true);
  const [capabilities, setCapabilities] = useState({});

  const { tracks, ptzStates } = useWebSocket();

  const fetchCapabilities = () => {
    fetch("/api/capabilities")
      .then(r => r.ok ? r.json() : {})
      .then(setCapabilities)
      .catch(() => {});
  };

  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Load config ─────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/config")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.cameras?.length) {
          setCameras(data.cameras.map(c => ({
            ...c,
            ptz_limits: c.ptz_limits || { ...DEFAULT_PTZ_LIMITS },
          })));
          if (data.yard) setYard({ w: data.yard.width_m, h: data.yard.height_m });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    fetchCapabilities();
    const capTimer = setInterval(fetchCapabilities, 5000);
    return () => clearInterval(capTimer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Save config ──────────────────────────────────────────────────────────────
  const saveConfig = async () => {
    setSaving(true);
    const payload = {
      version: "1.0",
      yard: { width_m: yard.w, height_m: yard.h },
      cameras: cameras.map((c, i) => ({
        ...c,
        color:      CAM_COLORS[i % CAM_COLORS.length],
        ptz_limits: c.type === "ptz" ? c.ptz_limits : null,
      })),
      tracking: DEFAULT_TRACKING,
    };
    try {
      const r = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        showToast("✓ Конфіг збережено і застосовано", "ok");
        setCapabilities({});
        setTimeout(fetchCapabilities, 3000);
      } else {
        showToast("✗ Помилка збереження", "err");
      }
    } catch {
      showToast("✗ Backend недоступний", "err");
    }
    setSaving(false);
  };

  // ── Camera CRUD ──────────────────────────────────────────────────────────────
  const updateCam = (id, f, v) => setCameras(p => p.map(c => c.id===id ? { ...c, [f]:v } : c));

  const saveCamPatch = (id, patch) => setCameras(p => p.map(c => c.id===id ? { ...c, ...patch } : c));
  const updatePtz = (id, f, v) => setCameras(p => p.map(c => c.id===id
    ? { ...c, ptz_limits: { ...c.ptz_limits, [f]: parseFloat(v) } } : c));
  const deleteCam = id => setCameras(p => p.filter(c => c.id !== id));
  const addCam    = () => {
    const cam = makeCameraTemplate(cameras.length, yard.w, yard.h);
    setCameras(p => [...p, cam]);
  };

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh",
      background:"#06090d", color:"#00d084", fontFamily:"monospace", fontSize:14, letterSpacing:3 }}>
      ◈ ЗАВАНТАЖЕННЯ...
    </div>
  );

  return (
    <div style={styles.app}>
      {toast && (
        <div style={{ ...styles.toast,
          background: toast.type==="ok" ? "#00d08422" : "#ef444422",
          border:     `1px solid ${toast.type==="ok" ? "#00d08488" : "#ef444488"}`,
          color:      toast.type==="ok" ? "#00d084"   : "#ef4444",
        }}>
          {toast.msg}
        </div>
      )}

      <Header
        tab={tab} setTab={setTab}
        cameras={cameras} tracks={tracks}
        saving={saving} onSave={saveConfig}
      />

      {tab === "map" && (
        <MapTab
          cameras={cameras} setCameras={setCameras}
          yard={yard} setYard={setYard}
          tracks={tracks} ptzStates={ptzStates}
        />
      )}

      {tab === "cameras" && (
        <CamerasTab
          cameras={cameras} tracks={tracks} ptzStates={ptzStates}
          capabilities={capabilities}
          onAdd={addCam}
          onUpdate={updateCam} onPtz={updatePtz} onDelete={deleteCam}
        />
      )}

      {tab === "streams" && (
        <StreamsTab cameras={cameras} tracks={tracks} ptzStates={ptzStates} capabilities={capabilities}/>
      )}

      {tab === "calibrate" && (
        <CalibrationTab
          cameras={cameras}
          capabilities={capabilities}
          onSaveCam={saveCamPatch}
        />
      )}

      {tab === "export" && (
        <ExportTab cameras={cameras} yard={yard}/>
      )}
    </div>
  );
}

export default App;
