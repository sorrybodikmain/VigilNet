import { useState, useCallback, useRef } from "react";
import { CAM_COLORS } from "../constants.js";
import { StreamImg } from "./StreamImg.jsx";

// ─── shared primitives ────────────────────────────────────────────────────────

const S = {
  root:    { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#06090d" },
  hdr:     { display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: "1px solid #1a2a35", flexShrink: 0 },
  body:    { flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 },

  camTabs: { display: "flex", gap: 4, flexWrap: "wrap" },
  camTab:  { background: "transparent", border: "1px solid #1a2535", color: "#3a5262",
             padding: "5px 14px", cursor: "pointer", fontFamily: "inherit", fontSize: 10, letterSpacing: 2 },
  camTabOn:{ background: "#00d08412", border: "1px solid #00d08450", color: "#00d084" },

  phase:   { background: "#09111a", border: "1px solid #1a2a35", padding: 16, display: "flex", flexDirection: "column", gap: 12 },
  phTitle: { fontSize: 11, letterSpacing: 3, color: "#6a8292", marginBottom: 4 },
  phDesc:  { fontSize: 10, color: "#4a6272", lineHeight: 1.7 },

  row:     { display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" },
  stream:  { flex: "0 0 320px", background: "#040608", border: "1px solid #1a2a35", height: 180, position: "relative" },
  streamImg:{ width: "100%", display: "block" },

  btn:     { background: "#0d1520", border: "1px solid #1a2a35", color: "#7a9aaa",
             cursor: "pointer", fontFamily: "inherit", fontSize: 12, padding: "8px 14px", letterSpacing: 1 },
  btnOk:   { background: "#00d08420", border: "1px solid #00d084", color: "#00d084",
             cursor: "pointer", fontFamily: "inherit", fontSize: 11, padding: "8px 18px", letterSpacing: 1 },
  btnWarn: { background: "#f59e0b20", border: "1px solid #f59e0b", color: "#f59e0b",
             cursor: "pointer", fontFamily: "inherit", fontSize: 11, padding: "8px 18px", letterSpacing: 1 },
  btnDanger:{ background: "#ef444420", border: "1px solid #ef4444", color: "#ef4444",
             cursor: "pointer", fontFamily: "inherit", fontSize: 11, padding: "8px 18px", letterSpacing: 1 },

  grid3:   { display: "grid", gridTemplateColumns: "repeat(3, 44px)", gridTemplateRows: "repeat(3, 44px)", gap: 3 },
  dpad:    { background: "#0d1520", border: "1px solid #1a2a35", color: "#7a9aaa",
             cursor: "pointer", fontFamily: "inherit", fontSize: 16, width: 44, height: 44,
             display: "flex", alignItems: "center", justifyContent: "center", userSelect: "none" },
  dpadStop:{ background: "#1a0808", border: "1px solid #3a1a1a", color: "#ef4444",
             cursor: "pointer", fontFamily: "inherit", fontSize: 14, width: 44, height: 44,
             display: "flex", alignItems: "center", justifyContent: "center", userSelect: "none" },

  badge:   { fontSize: 9, padding: "2px 8px", letterSpacing: 1 },
  label:   { fontSize: 9, color: "#3a5262", letterSpacing: 2, marginBottom: 3 },
  slider:  { width: "100%", accentColor: "#00d084" },
  checkRow:{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" },
  check:   { accentColor: "#f59e0b", width: 13, height: 13 },
};

const SPEED = 0.4;
const SPEED_Z = 0.3;

// ─── Joystick with zoom ───────────────────────────────────────────────────────

function Joystick({ camId, hasZoom = true }) {
  const active = useRef(false);

  const send = useCallback((pan, tilt, zoom = 0) => {
    active.current = true;
    fetch(`/api/ptz/${camId}/move`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pan, tilt, zoom }),
    }).catch(() => {});
  }, [camId]);

  const stop = useCallback(() => {
    if (!active.current) return;
    active.current = false;
    fetch(`/api/ptz/${camId}/stop`, { method: "POST" }).catch(() => {});
  }, [camId]);

  const press = (pan, tilt, zoom = 0) => ({
    onMouseDown:  (e) => { e.preventDefault(); send(pan, tilt, zoom); },
    onMouseUp:    stop, onMouseLeave: stop,
    onTouchStart: (e) => { e.preventDefault(); send(pan, tilt, zoom); },
    onTouchEnd:   stop, onTouchCancel: stop,
  });

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <div style={S.grid3}>
        <div/><div style={S.dpad} {...press(0, SPEED)}>↑</div><div/>
        <div style={S.dpad} {...press(-SPEED, 0)}>←</div>
        <div style={S.dpadStop} onMouseDown={(e)=>{e.preventDefault();stop();}} onTouchStart={(e)=>{e.preventDefault();active.current=true;stop();}}>■</div>
        <div style={S.dpad} {...press(SPEED, 0)}>→</div>
        <div/><div style={S.dpad} {...press(0, -SPEED)}>↓</div><div/>
      </div>
      {hasZoom && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={S.dpad} {...press(0, 0, SPEED_Z)}>+</div>
          <div style={S.dpad} {...press(0, 0, -SPEED_Z)}>−</div>
        </div>
      )}
    </div>
  );
}

// ─── Stream preview ───────────────────────────────────────────────────────────

function StreamPreview({ camId, suffix = "", label }) {
  const crop =
    suffix === "_top" ? "top" :
    suffix === "_bot" ? "bot" :
    "full";
  return (
    <div style={S.stream}>
      {label && (
        <div style={{ fontSize: 9, color: "#3a5262", letterSpacing: 2, padding: "4px 8px", borderBottom: "1px solid #1a2a35" }}>
          {label}
        </div>
      )}
      <StreamImg camId={camId} crop={crop} style={S.streamImg}/>
    </div>
  );
}

// ─── Phase A: Direction test ──────────────────────────────────────────────────

function PhaseDirection({ cam, caps, onUpdate, onNext }) {
  const [panOk,  setPanOk]  = useState(null);
  const [tiltOk, setTiltOk] = useState(null);

  const suffix = cam.split_stream ? "_bot" : "";

  const applyAndNext = () => {
    const newPan  = panOk  === false ? !cam.ptz_invert_pan  : cam.ptz_invert_pan;
    const newTilt = tiltOk === false ? !cam.ptz_invert_tilt : cam.ptz_invert_tilt;
    onUpdate({ ptz_invert_pan: newPan, ptz_invert_tilt: newTilt });
    onNext();
  };

  const ready = panOk !== null && tiltOk !== null;

  return (
    <div style={S.phase}>
      <div style={S.phTitle}>◈ КРОК 1 — ТЕСТ НАПРЯМКІВ</div>
      <div style={S.phDesc}>
        Натисни кнопку і поглянь на превʼю. Чи камера рухається в правильному напрямку?
      </div>

      <div style={S.row}>
        <StreamPreview camId={cam.id} suffix={suffix} label="PTZ CAMERA"/>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Joystick camId={cam.id} hasZoom={caps?.has_zoom}/>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 10, color: "#6a8292", letterSpacing: 1 }}>
              Натисни → (вправо). Камера рухається вправо?
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={{ ...S.btnOk,   opacity: panOk === true  ? 1 : 0.4 }} onClick={() => setPanOk(true)}>✓ ТАК</button>
              <button style={{ ...S.btnDanger, opacity: panOk === false ? 1 : 0.4 }} onClick={() => setPanOk(false)}>✗ НІ (інвертувати)</button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 10, color: "#6a8292", letterSpacing: 1 }}>
              Натисни ↑ (вгору). Камера рухається вгору?
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={{ ...S.btnOk,   opacity: tiltOk === true  ? 1 : 0.4 }} onClick={() => setTiltOk(true)}>✓ ТАК</button>
              <button style={{ ...S.btnDanger, opacity: tiltOk === false ? 1 : 0.4 }} onClick={() => setTiltOk(false)}>✗ НІ (інвертувати)</button>
            </div>
          </div>

          {ready && (
            <button style={S.btnOk} onClick={applyAndNext}>ЗАСТОСУВАТИ → ДАЛІ</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Phase B: Tilt offset ────────────────────────────────────────────────────

function PhaseTilt({ cam, caps, onUpdate, onNext }) {
  const [offset, setOffset] = useState(cam.ptz_tilt_offset ?? 0);
  const suffix = cam.split_stream ? "_bot" : "";

  const apply = async (val) => {
    setOffset(val);
    await fetch(`/api/ptz/${cam.id}/tilt_offset`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offset: val }),
    }).catch(() => {});
  };

  const applyAndNext = () => {
    onUpdate({ ptz_tilt_offset: offset });
    onNext();
  };

  return (
    <div style={S.phase}>
      <div style={S.phTitle}>◈ КРОК 2 — ЦЕНТР ТРЕКІНГУ (TILT OFFSET)</div>
      <div style={S.phDesc}>
        Постав людину перед камерою і запусти трекінг. Якщо камера дивиться в землю — рухай
        повзунок вгору (позитивне значення). Якщо дивиться в небо — вниз.
      </div>

      <div style={S.row}>
        <StreamPreview camId={cam.id} suffix={suffix} label="PTZ (TRACKING VIEW)"/>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, minWidth: 200 }}>
          <Joystick camId={cam.id} hasZoom={caps?.has_zoom}/>

          <div>
            <div style={S.label}>TILT OFFSET: {offset >= 0 ? "+" : ""}{offset.toFixed(2)}</div>
            <div style={{ fontSize: 9, color: "#3a5262", marginBottom: 6 }}>
              +0.3 → камера вище &nbsp;|&nbsp; −0.3 → камера нижче
            </div>
            <input
              type="range" min="-0.49" max="0.49" step="0.01"
              value={offset}
              onChange={e => apply(parseFloat(e.target.value))}
              style={S.slider}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#3a5262" }}>
              <span>нижче −0.49</span><span>0</span><span>+0.49 вище</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            <button style={S.btn} onClick={() => apply(0)}>RESET</button>
            <button style={S.btnOk} onClick={applyAndNext}>ЗБЕРЕГТИ → ДАЛІ</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Phase C: Home position ───────────────────────────────────────────────────

function PhaseHome({ cam, caps, onNext }) {
  const [saved, setSaved] = useState(false);
  const suffix = cam.split_stream ? "_bot" : "";

  const setHome = async () => {
    await fetch(`/api/ptz/${cam.id}/home/set`, { method: "POST" }).catch(() => {});
    setSaved(true);
  };

  const goHome = () => {
    fetch(`/api/ptz/${cam.id}/home/go`, { method: "POST" }).catch(() => {});
  };

  return (
    <div style={S.phase}>
      <div style={S.phTitle}>◈ КРОК 3 — ДОМАШНЯ ПОЗИЦІЯ</div>
      <div style={S.phDesc}>
        Джойстиком вирівняй камеру в зручне положення спокою (куди вона повертатиметься
        після втрати цілі). Потім натисни «ЗБЕРЕГТИ ЯК HOME».
      </div>

      <div style={S.row}>
        <StreamPreview camId={cam.id} suffix={suffix} label="PTZ — НАЛАШТУЙ ПОЗИЦІЮ СПОКОЮ"/>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Joystick camId={cam.id} hasZoom={caps?.has_zoom}/>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button style={S.btn} onClick={goHome}>↩ ПОВЕРНУТИ В HOME</button>
            <button style={S.btnWarn} onClick={setHome}>
              {saved ? "✓ HOME ЗБЕРЕЖЕНО" : "⊙ ЗБЕРЕГТИ ЯК HOME"}
            </button>
          </div>

          <button style={S.btnOk} onClick={onNext}>
            {saved ? "ДАЛІ →" : "ПРОПУСТИТИ →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Phase D: Fixed↔PTZ alignment (split cameras only) ───────────────────────

function PhaseAlignment({ cam }) {
  return (
    <div style={S.phase}>
      <div style={S.phTitle}>◈ КРОК 4 — ВИРІВНЮВАННЯ FIXED ↔ PTZ</div>
      <div style={S.phDesc}>
        Переконайся, що коли людина видима у верхній (FIXED) половині — PTZ-камера внизу
        її також бачить. Якщо PTZ дивиться не туди — поверніться на Крок 1 або 2.
      </div>
      <div style={S.row}>
        <StreamPreview camId={cam.id} suffix="_top" label="↑ FIXED (детекція)"/>
        <StreamPreview camId={cam.id} suffix="_bot" label="↓ PTZ (трекінг)"/>
      </div>
    </div>
  );
}

// ─── Phase E: Cross-camera ───────────────────────────────────────────────────

function PhaseCrossCam({ cameras }) {
  return (
    <div style={S.phase}>
      <div style={S.phTitle}>◈ МІЖКАМЕРНЕ КАЛІБРУВАННЯ</div>
      <div style={S.phDesc}>
        Переконайся що зони перекриття між камерами налаштовані правильно на вкладці MAP.
        Нижче — всі потоки одночасно для візуальної перевірки.
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {cameras.map(c => (
          <StreamPreview
            key={c.id}
            camId={c.id}
            suffix={c.split_stream ? "_top" : ""}
            label={c.name}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main CalibrationTab ──────────────────────────────────────────────────────

const PTZ_STEPS = ["direction", "tilt", "home", "align", "done"];

export function CalibrationTab({ cameras, capabilities, onSaveCam }) {
  const ptzCams = cameras.filter(c => c.type === "ptz");
  const [selIdx, setSelIdx] = useState(0);
  const [steps,  setSteps]  = useState({});        // camId → step index
  const [phase,  setPhase]  = useState("cameras"); // "cameras" | "ptz" | "cross"

  const cam   = ptzCams[selIdx];
  const caps  = cam ? capabilities[cam.id] : null;
  const step  = cam ? (steps[cam.id] ?? 0) : 0;

  const nextStep = () => {
    if (!cam) return;
    const next = step + 1;
    setSteps(p => ({ ...p, [cam.id]: next }));
    if (next >= PTZ_STEPS.length - 1) {
      setPhase("cross");
    }
  };

  const updateCam = (patch) => {
    onSaveCam(cam.id, patch);
  };

  const camDone = (id) => (steps[id] ?? 0) >= PTZ_STEPS.length - 1;

  if (cameras.length === 0) {
    return (
      <div style={{ ...S.root, alignItems: "center", justifyContent: "center", color: "#3a5262", fontSize: 12, letterSpacing: 2 }}>
        Спочатку додай камери на вкладці CAMERAS
      </div>
    );
  }

  return (
    <div style={S.root}>
      <div style={S.hdr}>
        <span style={{ fontSize: 11, letterSpacing: 3, color: "#6a8292" }}>CALIBRATION</span>
        {phase === "ptz" && cam && (
          <span style={{ fontSize: 10, color: "#3a5262" }}>
            Крок {step + 1} / {PTZ_STEPS.length - 1} — {cam.name}
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button style={{ ...S.btn, ...(phase === "cameras" ? { borderColor: "#00d08450", color: "#00d084" } : {}) }}
            onClick={() => setPhase("cameras")}>1. КАМЕРИ</button>
          <button style={{ ...S.btn, ...(phase === "ptz" ? { borderColor: "#00d08450", color: "#00d084" } : {}) }}
            onClick={() => setPhase("ptz")} disabled={ptzCams.length === 0}>2. PTZ</button>
          <button style={{ ...S.btn, ...(phase === "cross" ? { borderColor: "#00d08450", color: "#00d084" } : {}) }}
            onClick={() => setPhase("cross")}>3. МІЖ КАМЕРАМИ</button>
        </div>
      </div>

      <div style={S.body}>

        {/* ── Phase: camera picker ────────────────────────────────────────── */}
        {phase === "cameras" && (
          <>
            <div style={S.phase}>
              <div style={S.phTitle}>◈ ОГЛЯД КАМЕР</div>
              <div style={S.phDesc}>
                Оберіть камеру для PTZ-калібрування. Рекомендований порядок: спочатку
                налаштуй кожну PTZ-камеру окремо, потім перейди до міжкамерного кроку.
              </div>
              <div style={S.camTabs}>
                {ptzCams.map((c, i) => (
                  <button
                    key={c.id}
                    style={{ ...S.camTab, ...(i === selIdx ? S.camTabOn : {}), position: "relative" }}
                    onClick={() => { setSelIdx(i); setPhase("ptz"); }}
                  >
                    {c.name}
                    {camDone(c.id) && (
                      <span style={{ color: "#00d084", marginLeft: 6 }}>✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {cameras.map(c => (
                <StreamPreview
                  key={c.id}
                  camId={c.id}
                  suffix={c.split_stream ? "_top" : ""}
                  label={c.name}
                />
              ))}
            </div>
          </>
        )}

        {/* ── Phase: PTZ per-camera wizard ───────────────────────────────── */}
        {phase === "ptz" && cam && (
          <>
            <div style={S.camTabs}>
              {ptzCams.map((c, i) => (
                <button key={c.id}
                  style={{ ...S.camTab, ...(i === selIdx ? S.camTabOn : {}) }}
                  onClick={() => setSelIdx(i)}>
                  {c.name}{camDone(c.id) ? " ✓" : ""}
                </button>
              ))}
            </div>

            {step === 0 && (
              <PhaseDirection cam={cam} caps={caps} onUpdate={updateCam} onNext={nextStep}/>
            )}
            {step === 1 && (
              <PhaseTilt cam={cam} caps={caps} onUpdate={updateCam} onNext={nextStep}/>
            )}
            {step === 2 && (
              <PhaseHome cam={cam} caps={caps} onNext={nextStep}/>
            )}
            {step >= 3 && cam.split_stream && (
              <>
                <PhaseAlignment cam={cam}/>
                {step === 3 && (
                  <button style={{ ...S.btnOk, alignSelf: "flex-start" }} onClick={nextStep}>
                    КАЛІБРУВАННЯ КАМЕРИ ЗАВЕРШЕНО ✓
                  </button>
                )}
              </>
            )}
            {step >= 3 && !cam.split_stream && (
              <div style={{ ...S.phase, borderColor: "#00d08440" }}>
                <div style={{ color: "#00d084", fontSize: 11, letterSpacing: 2 }}>
                  ✓ КАЛІБРУВАННЯ {cam.name} ЗАВЕРШЕНО
                </div>
                <button style={{ ...S.btnOk, alignSelf: "flex-start" }} onClick={() => setPhase("cameras")}>
                  ← НАЗАД ДО КАМЕР
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Phase: cross-camera ─────────────────────────────────────────── */}
        {phase === "cross" && (
          <PhaseCrossCam cameras={cameras}/>
        )}
      </div>
    </div>
  );
}
