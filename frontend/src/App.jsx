import { useState, useRef, useEffect, useCallback } from "react";

const CANVAS_W = 800;
const CANVAS_H = 520;
const CAM_COLORS = ["#00d084","#3b9ef5","#f59e0b","#ef4444","#a78bfa","#06b6d4","#f97316","#10b981"];
function uid() { return Math.random().toString(36).substr(2,8); }

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]           = useState("map");
  const [cameras, setCameras]   = useState([]);
  const [yard, setYard]         = useState({ w:20, h:15 });
  const [selectedId, setSelectedId] = useState(null);
  const [tool, setTool]         = useState("select");
  const [drawPts, setDrawPts]   = useState([]);
  const [mouse, setMouse]       = useState(null);
  const [toast, setToast]       = useState(null);
  const [saving, setSaving]     = useState(false);
  const [tracks, setTracks]     = useState({});
  const [loading, setLoading]   = useState(true);
  const canvasRef = useRef(null);
  const wsRef     = useRef(null);

  const selected = cameras.find(c => c.id === selectedId);
  const colorOf  = cam => CAM_COLORS[cameras.indexOf(cam) % CAM_COLORS.length];

  const showToast = (msg, type="ok") => {
    setToast({msg, type});
    setTimeout(() => setToast(null), 3000);
  };

  // ── Load config from backend on mount ─────────────────────────────────────
  useEffect(() => {
    fetch("/api/config")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.cameras?.length) {
          setCameras(data.cameras.map(c => ({
            ...c,
            ptz_limits: c.ptz_limits || {pan_min:-170,pan_max:170,tilt_min:-90,tilt_max:30},
          })));
          if (data.yard) setYard({w: data.yard.width_m, h: data.yard.height_m});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ── WebSocket for live tracking data ──────────────────────────────────────
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(`ws://${location.host}/ws/tracks`);
      ws.onmessage = e => setTracks(JSON.parse(e.data));
      ws.onclose   = () => setTimeout(connect, 3000);
      wsRef.current = ws;
    };
    connect();
    return () => wsRef.current?.close();
  }, []);

  // ── Save config to backend ────────────────────────────────────────────────
  const saveConfig = async () => {
    setSaving(true);
    const payload = {
      version: "1.0",
      yard: {width_m: yard.w, height_m: yard.h},
      cameras: cameras.map((c,i) => ({
        ...c,
        color: CAM_COLORS[i % CAM_COLORS.length],
        ptz_limits: c.type==="ptz" ? c.ptz_limits : null,
      })),
      tracking: {
        detection_confidence: 0.5,
        reid_similarity_threshold: 0.72,
        zone_overlap_handoff_ratio: 0.3,
        ptz_smoothing_factor: 0.3,
        max_lost_frames: 30,
        frame_skip: 2,
      },
    };
    try {
      const r = await fetch("/api/config", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(payload),
      });
      if (r.ok) showToast("✓ Конфіг збережено і застосовано", "ok");
      else       showToast("✗ Помилка збереження", "err");
    } catch {
      showToast("✗ Backend недоступний", "err");
    }
    setSaving(false);
  };

  // ── Coordinate helpers ────────────────────────────────────────────────────
  const mToPx = useCallback((mx,my) => ({
    x: (mx/yard.w)*CANVAS_W, y: (my/yard.h)*CANVAS_H,
  }), [yard]);
  const pxToM = useCallback((px,py) => ({
    x: parseFloat(((px/CANVAS_W)*yard.w).toFixed(2)),
    y: parseFloat(((py/CANVAS_H)*yard.h).toFixed(2)),
  }), [yard]);
  const getPos = useCallback(e => {
    const r = canvasRef.current.getBoundingClientRect();
    return {
      x: (e.clientX-r.left)*(CANVAS_W/r.width),
      y: (e.clientY-r.top) *(CANVAS_H/r.height),
    };
  }, []);

  // ── Canvas rendering ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#06090d";
    ctx.fillRect(0,0,CANVAS_W,CANVAS_H);

    const sx=CANVAS_W/yard.w, sy=CANVAS_H/yard.h;
    ctx.strokeStyle="#0d1520"; ctx.lineWidth=1;
    for(let x=sx;x<CANVAS_W;x+=sx){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,CANVAS_H);ctx.stroke();}
    for(let y=sy;y<CANVAS_H;y+=sy){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(CANVAS_W,y);ctx.stroke();}
    ctx.strokeStyle="#182430"; ctx.lineWidth=1;
    for(let x=sx*5;x<CANVAS_W;x+=sx*5){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,CANVAS_H);ctx.stroke();}
    for(let y=sy*5;y<CANVAS_H;y+=sy*5){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(CANVAS_W,y);ctx.stroke();}

    ctx.fillStyle="#1a2e40"; ctx.font="9px monospace";
    for(let i=5;i<=yard.w;i+=5) ctx.fillText(`${i}m`,i*sx-12,CANVAS_H-3);
    for(let i=5;i<=yard.h;i+=5) ctx.fillText(`${i}m`,2,i*sy-2);

    ctx.strokeStyle="#1e3a4a"; ctx.lineWidth=2;
    ctx.strokeRect(1,1,CANVAS_W-2,CANVAS_H-2);

    // Draw zones (unselected first)
    const drawZone = (cam, isSel) => {
      if (!cam.zone||cam.zone.length<3) return;
      const color=CAM_COLORS[cameras.indexOf(cam)%CAM_COLORS.length];
      const pts=cam.zone.map(m=>mToPx(m.x,m.y));
      ctx.beginPath();
      ctx.moveTo(pts[0].x,pts[0].y);
      pts.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));
      ctx.closePath();
      ctx.fillStyle=color+(isSel?"28":"12"); ctx.fill();
      ctx.strokeStyle=color+(isSel?"cc":"44");
      ctx.lineWidth=isSel?2:1; ctx.setLineDash(isSel?[]:[5,4]);
      ctx.stroke(); ctx.setLineDash([]);
      if(isSel) pts.forEach(p=>{
        ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);
        ctx.fillStyle=color;ctx.fill();
        ctx.strokeStyle="#000";ctx.lineWidth=1;ctx.stroke();
      });
    };
    cameras.filter(c=>c.id!==selectedId).forEach(c=>drawZone(c,false));
    if(selected) drawZone(selected,true);

    // Overlap highlights
    const zones=cameras.filter(c=>c.zone?.length>2);
    for(let i=0;i<zones.length;i++) for(let j=i+1;j<zones.length;j++){
      const a=getBBox(zones[i].zone.map(m=>mToPx(m.x,m.y)));
      const b=getBBox(zones[j].zone.map(m=>mToPx(m.x,m.y)));
      const ov=rectsOverlap(a,b);
      if(ov){
        ctx.fillStyle="#ffffff08"; ctx.fillRect(ov.x,ov.y,ov.w,ov.h);
        ctx.strokeStyle="#ffffff22"; ctx.lineWidth=1;
        ctx.setLineDash([3,3]); ctx.strokeRect(ov.x,ov.y,ov.w,ov.h); ctx.setLineDash([]);
        ctx.fillStyle="#ffffff22"; ctx.font="9px monospace";
        ctx.fillText("OVERLAP",ov.x+ov.w/2-22,ov.y+ov.h/2+4);
      }
    }

    // Live tracking overlay
    cameras.forEach(cam=>{
      const camTracks=tracks[cam.id]||[];
      const color=CAM_COLORS[cameras.indexOf(cam)%CAM_COLORS.length];
      camTracks.forEach(t=>{
        const cx=mToPx(cam.position_m?.x||cam.position?.x||5, cam.position_m?.y||cam.position?.y||5);
        // Show global ID near camera
        ctx.fillStyle=color; ctx.font="bold 10px monospace";
        ctx.fillText(`#${t.id}`,cx.x+14,cx.y-14-camTracks.indexOf(t)*12);
      });
    });

    // Drawing polygon
    if(tool==="zone"&&drawPts.length>0){
      ctx.beginPath();ctx.moveTo(drawPts[0].x,drawPts[0].y);
      drawPts.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));
      if(mouse) ctx.lineTo(mouse.x,mouse.y);
      ctx.strokeStyle="#ffffff88"; ctx.lineWidth=1.5;
      ctx.setLineDash([6,4]); ctx.stroke(); ctx.setLineDash([]);
      drawPts.forEach((p,i)=>{
        ctx.beginPath();ctx.arc(p.x,p.y,i===0?6:4,0,Math.PI*2);
        ctx.fillStyle=i===0?"#ffffff":"#aaaaaa";ctx.fill();
        ctx.strokeStyle="#000";ctx.lineWidth=1;ctx.stroke();
      });
      if(drawPts.length>=3&&mouse){
        const d=Math.hypot(mouse.x-drawPts[0].x,mouse.y-drawPts[0].y);
        if(d<20){ctx.beginPath();ctx.arc(drawPts[0].x,drawPts[0].y,11,0,Math.PI*2);
          ctx.strokeStyle="#ffffff66";ctx.lineWidth=2;ctx.stroke();}
      }
    }

    // Camera icons
    cameras.forEach(cam=>{
      const pos=cam.position_m||cam.position||{x:5,y:5};
      const p=mToPx(pos.x,pos.y);
      const color=CAM_COLORS[cameras.indexOf(cam)%CAM_COLORS.length];
      const sel=cam.id===selectedId; const r=sel?11:9;
      if(cam.type==="ptz"){
        ctx.beginPath();ctx.arc(p.x,p.y,r+7,0,Math.PI*2);
        ctx.strokeStyle=color+"44";ctx.lineWidth=1.5;
        ctx.setLineDash([3,3]);ctx.stroke();ctx.setLineDash([]);
      }
      if(sel){ctx.beginPath();ctx.arc(p.x,p.y,r+4,0,Math.PI*2);
        ctx.strokeStyle=color+"88";ctx.lineWidth=1.5;ctx.stroke();}
      ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);
      ctx.fillStyle=sel?color:"#111e2a";ctx.fill();
      ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke();
      ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);
      ctx.fillStyle=sel?"#000":color;ctx.fill();
      ctx.fillStyle="#c8d8e4";ctx.font="bold 11px monospace";
      ctx.fillText(cam.name,p.x+r+5,p.y-3);
      ctx.fillStyle=cam.type==="ptz"?"#f59e0b":"#3b9ef5";
      ctx.font="9px monospace";
      ctx.fillText(cam.type==="ptz"?"PTZ":"FIXED",p.x+r+5,p.y+9);
      // Active tracks count badge
      const tCount=(tracks[cam.id]||[]).length;
      if(tCount>0){
        ctx.beginPath();ctx.arc(p.x+r,p.y-r,7,0,Math.PI*2);
        ctx.fillStyle="#ef4444";ctx.fill();
        ctx.fillStyle="#fff";ctx.font="bold 9px monospace";
        ctx.fillText(String(tCount),p.x+r-3,p.y-r+3);
      }
    });

    if(tool==="place"&&mouse){
      ctx.strokeStyle="#00d08466";ctx.lineWidth=1.5;
      ctx.beginPath();ctx.arc(mouse.x,mouse.y,9,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(mouse.x-14,mouse.y);ctx.lineTo(mouse.x+14,mouse.y);
      ctx.moveTo(mouse.x,mouse.y-14);ctx.lineTo(mouse.x,mouse.y+14);ctx.stroke();
    }
  }, [cameras,selectedId,tool,drawPts,mouse,mToPx,yard,tracks,selected]);

  // ── Canvas events ─────────────────────────────────────────────────────────
  const saveZone = useCallback(() => {
    const zoneM=drawPts.map(p=>pxToM(p.x,p.y));
    setCameras(p=>p.map(c=>c.id===selectedId?{...c,zone_polygon_m:zoneM,zone:zoneM}:c));
    setDrawPts([]); setTool("select");
  },[drawPts,selectedId,pxToM]);

  const handleClick=useCallback(e=>{
    const pos=getPos(e);
    if(tool==="place"){
      const m=pxToM(pos.x,pos.y);
      const ip=`192.168.31.${100+cameras.length}`;
      const nc={id:uid(),name:`CAM-${cameras.length+1}`,
        rtsp_4k:`rtsp://admin:pass@${ip}/user=admin&password=pass&stream=0.sdp`,
        rtsp_sd:`rtsp://admin:pass@${ip}/user=admin&password=pass&stream=1.sdp`,
        ip,type:"ptz",onvif_url:`http://admin:pass@${ip}:80/onvif/device_service`,
        position_m:m,position:m,zone_polygon_m:[],zone:[],
        ptz_limits:{pan_min:-170,pan_max:170,tilt_min:-90,tilt_max:30}};
      setCameras(p=>[...p,nc]);setSelectedId(nc.id);setTool("select");return;
    }
    if(tool==="zone"){
      if(drawPts.length>=3){
        const d=Math.hypot(pos.x-drawPts[0].x,pos.y-drawPts[0].y);
        if(d<20){saveZone();return;}
      }
      setDrawPts(p=>[...p,pos]);return;
    }
    if(tool==="select"){
      let found=null;
      cameras.forEach(cam=>{
        const pos2=cam.position_m||cam.position||{x:5,y:5};
        const p=mToPx(pos2.x,pos2.y);
        if(Math.hypot(pos.x-p.x,pos.y-p.y)<16) found=cam.id;
      });
      setSelectedId(found);
    }
  },[tool,drawPts,cameras,getPos,pxToM,mToPx,saveZone]);

  const handleDbl=useCallback(()=>{
    if(tool==="zone"&&drawPts.length>=3) saveZone();
  },[tool,drawPts,saveZone]);

  const handleMove=useCallback(e=>{
    setMouse(tool==="place"||tool==="zone"?getPos(e):null);
  },[tool,getPos]);

  // ── Camera CRUD ───────────────────────────────────────────────────────────
  const updateCam=(id,f,v)=>setCameras(p=>p.map(c=>c.id===id?{...c,[f]:v}:c));
  const updatePtz=(id,f,v)=>setCameras(p=>p.map(c=>c.id===id?{...c,ptz_limits:{...c.ptz_limits,[f]:parseFloat(v)}}:c));
  const deleteCam=id=>{setCameras(p=>p.filter(c=>c.id!==id));if(selectedId===id)setSelectedId(null);};
  const addCam=()=>{
    const ip=`192.168.31.${100+cameras.length}`;
    const c={id:uid(),name:`CAM-${cameras.length+1}`,
      rtsp_4k:`rtsp://admin:pass@${ip}/user=admin&password=pass&stream=0.sdp`,
      rtsp_sd:`rtsp://admin:pass@${ip}/user=admin&password=pass&stream=1.sdp`,
      ip,type:"ptz",onvif_url:`http://admin:pass@${ip}:80/onvif/device_service`,
      position_m:{x:yard.w/2,y:yard.h/2},position:{x:yard.w/2,y:yard.h/2},
      zone_polygon_m:[],zone:[],
      ptz_limits:{pan_min:-170,pan_max:170,tilt_min:-90,tilt_max:30}};
    setCameras(p=>[...p,c]);setSelectedId(c.id);
  };

  const totalTracks=Object.values(tracks).reduce((a,t)=>a+t.length,0);

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",
      background:"#06090d",color:"#00d084",fontFamily:"monospace",fontSize:14,letterSpacing:3}}>
      ◈ ЗАВАНТАЖЕННЯ...
    </div>
  );

  const S=styles;
  return (
    <div style={S.app}>
      {/* Toast */}
      {toast && (
        <div style={{...S.toast, background: toast.type==="ok"?"#00d08422":"#ef444422",
          border:`1px solid ${toast.type==="ok"?"#00d08488":"#ef444488"}`,
          color: toast.type==="ok"?"#00d084":"#ef4444"}}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header style={S.header}>
        <div style={S.brand}>
          <div style={S.brandIcon}>◈</div>
          <div>
            <div style={S.brandName}>CAMTRACK</div>
            <div style={S.brandSub}>multi-camera zone configurator</div>
          </div>
        </div>
        <nav style={S.nav}>
          {[["map","⬚  MAP"],["cameras","⊞  CAMERAS"],["streams","▶  STREAMS"],["export","⟨/⟩  EXPORT"]].map(([id,lbl])=>(
            <button key={id} onClick={()=>setTab(id)} style={{...S.navBtn,...(tab===id?S.navBtnOn:{})}}>
              {lbl}
            </button>
          ))}
        </nav>
        <div style={S.statusBar}>
          {totalTracks>0&&<span style={{...S.statusDot,background:"#ef4444",boxShadow:"0 0 5px #ef4444"}}/>}
          {totalTracks===0&&<span style={S.statusDot}/>}
          {cameras.length} CAM &nbsp;·&nbsp; {cameras.filter(c=>c.zone_polygon_m?.length>2||c.zone?.length>2).length} ZONES
          {totalTracks>0&&<span style={{color:"#ef4444"}}>&nbsp;·&nbsp; {totalTracks} TRACKED</span>}
        </div>
        <button onClick={saveConfig} disabled={saving} style={S.saveBtn}>
          {saving?"⏳ ЗБЕРЕЖЕННЯ...":"💾 SAVE & APPLY"}
        </button>
      </header>

      {/* MAP TAB */}
      {tab==="map"&&(
        <div style={S.mapLayout}>
          <div style={S.toolbar}>
            <ToolSec label="TOOL">
              {[["select","↖ SELECT"],["place","+ PLACE CAM"]].map(([t,l])=>(
                <button key={t} onClick={()=>{setTool(t);setDrawPts([]);}}
                  style={{...S.toolBtn,...(tool===t?S.toolBtnOn:{})}}>
                  {l}
                </button>
              ))}
            </ToolSec>
            {selected&&(
              <ToolSec label="ZONE">
                <button onClick={()=>{setDrawPts([]);setTool("zone");}}
                  style={{...S.toolBtn,...(tool==="zone"?S.toolBtnOn:{})}}>
                  ✏ DRAW ZONE
                </button>
                <button onClick={()=>setCameras(p=>p.map(c=>c.id===selectedId?{...c,zone_polygon_m:[],zone:[]}:c))}
                  style={S.toolBtnDanger}>
                  ✕ CLEAR ZONE
                </button>
                {tool==="zone"&&(
                  <div style={S.hint}>
                    Клік → точка<br/>
                    Біля початку або<br/>
                    дабл-клік → закрити
                  </div>
                )}
              </ToolSec>
            )}
            <ToolSec label="ДВІР (м)">
              {[["w","Ш"],["h","В"]].map(([k,l])=>(
                <div key={k} style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={S.miniLabel}>{l}</span>
                  <input type="number" value={yard[k]} min={5} max={200}
                    onChange={e=>setYard(v=>({...v,[k]:parseFloat(e.target.value)||v[k]}))}
                    style={{...S.numInput,flex:1}}/>
                </div>
              ))}
            </ToolSec>
            <div style={{marginTop:"auto"}}>
              <div style={S.miniLabel}>LEGEND</div>
              {[["#3b9ef5","FIXED"],["#f59e0b","PTZ"],["#ffffff22","OVERLAP"]].map(([c,l])=>(
                <div key={l} style={{display:"flex",alignItems:"center",gap:6,marginTop:6}}>
                  <span style={{width:8,height:8,borderRadius:"50%",background:c}}/>
                  <span style={{fontSize:9,color:"#6a8292"}}>{l}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={S.canvasWrap}>
            <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
              onClick={handleClick} onMouseMove={handleMove}
              onDoubleClick={handleDbl} onMouseLeave={()=>setMouse(null)}
              style={{...S.canvas,cursor:tool==="place"||tool==="zone"?"crosshair":"default"}}
            />
            <div style={S.mapFoot}>{yard.w}м × {yard.h}м</div>
          </div>

          <div style={S.sidePanel}>
            {selected
              ? <CamPanel cam={selected} color={colorOf(selected)}
                  onUpdate={(f,v)=>updateCam(selected.id,f,v)}
                  onPtz={(f,v)=>updatePtz(selected.id,f,v)}
                  onDelete={()=>deleteCam(selected.id)}/>
              : <div style={S.empty}>
                  <div style={{fontSize:28,marginBottom:12,opacity:.3}}>⊡</div>
                  <div style={{fontSize:11,lineHeight:1.9,color:"#3a5262"}}>
                    Обери камеру<br/>або <b style={{color:"#00d08488"}}>+ PLACE CAM</b>
                  </div>
                </div>}
          </div>
        </div>
      )}

      {/* CAMERAS TAB */}
      {tab==="cameras"&&(
        <div style={S.camTab}>
          <div style={S.camTabHeader}>
            <span style={{fontSize:11,letterSpacing:3,color:"#6a8292"}}>
              CAMERAS ({cameras.length})
            </span>
            <button onClick={addCam} style={S.addBtn}>+ ADD CAMERA</button>
          </div>
          <div style={S.camCards}>
            {cameras.length===0&&<div style={{...S.empty,padding:40}}>
              Немає камер. Додай через кнопку або намалюй на карті.
            </div>}
            {cameras.map((cam,i)=>(
              <CamCard key={cam.id} cam={cam} color={CAM_COLORS[i%CAM_COLORS.length]}
                tracks={tracks[cam.id]||[]}
                onUpdate={(f,v)=>updateCam(cam.id,f,v)}
                onPtz={(f,v)=>updatePtz(cam.id,f,v)}
                onDelete={()=>deleteCam(cam.id)}/>
            ))}
          </div>
        </div>
      )}

      {/* STREAMS TAB */}
      {tab==="streams"&&(
        <div style={S.streamsTab}>
          <div style={S.camTabHeader}>
            <span style={{fontSize:11,letterSpacing:3,color:"#6a8292"}}>LIVE STREAMS</span>
            <span style={{fontSize:10,color:"#3a5262"}}>MJPEG з bbox детекції</span>
          </div>
          <div style={S.streamsGrid}>
            {cameras.map((cam,i)=>{
              const camTracks=tracks[cam.id]||[];
              const color=CAM_COLORS[i%CAM_COLORS.length];
              return (
                <div key={cam.id} style={S.streamCard}>
                  <div style={{...S.streamHeader,borderColor:color}}>
                    <span style={{width:6,height:6,borderRadius:"50%",background:color}}/>
                    <span style={{fontWeight:"bold",fontSize:12}}>{cam.name}</span>
                    <span style={{fontSize:9,border:`1px solid ${color}`,color,padding:"1px 4px"}}>
                      {cam.type.toUpperCase()}
                    </span>
                    {camTracks.length>0&&(
                      <span style={{fontSize:10,color:"#ef4444",marginLeft:"auto"}}>
                        ● {camTracks.length} особ
                      </span>
                    )}
                  </div>
                  <div style={S.streamImgWrap}>
                    <img
                      src={`/api/stream/${cam.id}`}
                      alt={cam.name}
                      style={S.streamImg}
                      onError={e=>{e.target.style.display="none";}}
                    />
                    {camTracks.length===0&&(
                      <div style={S.streamNoTrack}>Очікування детекції...</div>
                    )}
                  </div>
                  <div style={S.streamFooter}>
                    {camTracks.map(t=>(
                      <span key={t.id} style={S.trackBadge}>#{t.id}</span>
                    ))}
                    {camTracks.length===0&&<span style={{color:"#3a5262",fontSize:10}}>—</span>}
                  </div>
                </div>
              );
            })}
            {cameras.length===0&&<div style={{...S.empty,gridColumn:"1/-1",padding:40}}>
              Спочатку налаштуй камери на вкладці MAP.
            </div>}
          </div>
        </div>
      )}

      {/* EXPORT TAB */}
      {tab==="export"&&<ExportTab cameras={cameras} yard={yard}/>}
    </div>
  );
}

// ─── Camera Side Panel ────────────────────────────────────────────────────────
function CamPanel({cam,color,onUpdate,onPtz,onDelete}){
  const zone=cam.zone_polygon_m||cam.zone||[];
  return(
    <div style={{padding:14,display:"flex",flexDirection:"column",gap:8}}>
      <div style={{display:"flex",alignItems:"center",gap:8,paddingBottom:10,
        borderBottom:"1px solid #1a2a35",marginBottom:4}}>
        <span style={{width:8,height:8,borderRadius:"50%",background:color,flexShrink:0}}/>
        <span style={{fontSize:13,fontWeight:"bold",flex:1}}>{cam.name}</span>
        <span style={{fontSize:9,border:`1px solid ${color}`,color,padding:"2px 5px",letterSpacing:1}}>
          {cam.type.toUpperCase()}
        </span>
      </div>
      <Fld label="NAME"><input value={cam.name} onChange={e=>onUpdate("name",e.target.value)} style={styles.inp}/></Fld>
      <Fld label="TYPE">
        <select value={cam.type} onChange={e=>onUpdate("type",e.target.value)} style={styles.inp}>
          <option value="fixed">Fixed</option>
          <option value="ptz">PTZ (Pan-Tilt-Zoom)</option>
        </select>
      </Fld>
      <Fld label="IP"><input value={cam.ip} onChange={e=>onUpdate("ip",e.target.value)} style={styles.inp}/></Fld>
      <Fld label="RTSP 4K (detection)"><input value={cam.rtsp_4k||""} onChange={e=>onUpdate("rtsp_4k",e.target.value)} style={styles.inp}/></Fld>
      <Fld label="RTSP SD (display)"><input value={cam.rtsp_sd||""} onChange={e=>onUpdate("rtsp_sd",e.target.value)} style={styles.inp}/></Fld>
      {cam.type==="ptz"&&<>
        <Fld label="ONVIF URL"><input value={cam.onvif_url||""} onChange={e=>onUpdate("onvif_url",e.target.value)} style={styles.inp}/></Fld>
        <div style={styles.miniLabel}>PTZ LIMITS (°)</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          {[["pan_min","Pan Min"],["pan_max","Pan Max"],["tilt_min","Tilt Min"],["tilt_max","Tilt Max"]].map(([k,l])=>(
            <div key={k}>
              <div style={styles.miniLabel}>{l}</div>
              <input type="number" value={cam.ptz_limits?.[k]??0} onChange={e=>onPtz(k,e.target.value)} style={{...styles.inp,textAlign:"center"}}/>
            </div>
          ))}
        </div>
      </>}
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginTop:4}}>
        <span style={styles.miniLabel}>ZONE</span>
        <span style={{color:zone.length>=3?"#00d084":"#555"}}>
          {zone.length>=3?`${zone.length} pts ✓`:"Not drawn"}
        </span>
      </div>
      <button onClick={onDelete} style={styles.deleteBtnFull}>✕ REMOVE CAMERA</button>
    </div>
  );
}

// ─── Camera Card ──────────────────────────────────────────────────────────────
function CamCard({cam,color,tracks,onUpdate,onPtz,onDelete}){
  const [open,setOpen]=useState(false);
  const zone=cam.zone_polygon_m||cam.zone||[];
  return(
    <div style={{...styles.card,borderLeftColor:color}}>
      <div style={styles.cardRow} onClick={()=>setOpen(!open)}>
        <span style={{width:8,height:8,borderRadius:"50%",background:color}}/>
        <span style={{fontSize:13,fontWeight:"bold",flex:1}}>{cam.name}</span>
        <span style={{fontSize:9,border:`1px solid ${color}`,color,padding:"2px 4px",letterSpacing:1}}>{cam.type.toUpperCase()}</span>
        <span style={{fontSize:10,color:"#4a6272"}}>{cam.ip}</span>
        {tracks.length>0&&<span style={{fontSize:10,color:"#ef4444"}}>● {tracks.length}</span>}
        <span style={{
          fontSize:9,padding:"2px 6px",borderRadius:2,letterSpacing:1,
          background:zone.length>=3?"#00d08420":"#1a1a1a",
          color:zone.length>=3?"#00d084":"#555",
        }}>{zone.length>=3?"ZONE ✓":"NO ZONE"}</span>
        <span style={{fontSize:9,color:"#3a5262"}}>{open?"▲":"▼"}</span>
      </div>
      {open&&(
        <div style={{padding:"0 14px 14px",borderTop:"1px solid #1a2a35"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,paddingTop:12}}>
            {[["NAME","name"],["IP","ip"]].map(([l,f])=>(
              <div key={f}><div style={styles.miniLabel}>{l}</div>
                <input value={cam[f]||""} onChange={e=>onUpdate(f,e.target.value)} style={styles.inp}/>
              </div>
            ))}
            <div style={{gridColumn:"1/-1"}}><div style={styles.miniLabel}>RTSP 4K (detection)</div>
              <input value={cam.rtsp_4k||""} onChange={e=>onUpdate("rtsp_4k",e.target.value)} style={styles.inp}/>
            </div>
            <div style={{gridColumn:"1/-1"}}><div style={styles.miniLabel}>RTSP SD (display)</div>
              <input value={cam.rtsp_sd||""} onChange={e=>onUpdate("rtsp_sd",e.target.value)} style={styles.inp}/>
            </div>
            <div><div style={styles.miniLabel}>TYPE</div>
              <select value={cam.type} onChange={e=>onUpdate("type",e.target.value)} style={styles.inp}>
                <option value="fixed">Fixed</option>
                <option value="ptz">PTZ</option>
              </select>
            </div>
            {cam.type==="ptz"&&<div style={{gridColumn:"1/-1"}}>
              <div style={styles.miniLabel}>ONVIF URL</div>
              <input value={cam.onvif_url||""} onChange={e=>onUpdate("onvif_url",e.target.value)} style={styles.inp}/>
            </div>}
          </div>
          {cam.type==="ptz"&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginTop:10}}>
              {[["pan_min","Pan Min°"],["pan_max","Pan Max°"],["tilt_min","Tilt Min°"],["tilt_max","Tilt Max°"]].map(([k,l])=>(
                <div key={k}><div style={styles.miniLabel}>{l}</div>
                  <input type="number" value={cam.ptz_limits?.[k]??0} onChange={e=>onPtz(k,e.target.value)}
                    style={{...styles.inp,textAlign:"center"}}/>
                </div>
              ))}
            </div>
          )}
          <button onClick={onDelete} style={{...styles.deleteBtnFull,marginTop:10}}>✕ REMOVE</button>
        </div>
      )}
    </div>
  );
}

// ─── Export Tab ───────────────────────────────────────────────────────────────
function ExportTab({cameras,yard}){
  const [copied,setCopied]=useState(false);
  const config=JSON.stringify({
    version:"1.0",
    yard:{width_m:yard.w,height_m:yard.h},
    cameras:cameras.map((c,i)=>({
      ...c,
      position_m:c.position_m||c.position,
      zone_polygon_m:c.zone_polygon_m||c.zone||[],
      color:CAM_COLORS[i%CAM_COLORS.length],
      ptz_limits:c.type==="ptz"?c.ptz_limits:null,
    })),
    tracking:{detection_confidence:0.5,reid_similarity_threshold:0.72,
      zone_overlap_handoff_ratio:0.3,ptz_smoothing_factor:0.3,max_lost_frames:30,frame_skip:2},
  },null,2);
  const copy=()=>{navigator.clipboard.writeText(config);setCopied(true);setTimeout(()=>setCopied(false),2000);};
  const dl=()=>{
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([config],{type:"application/json"}));
    a.download="camtrack_config.json";a.click();
  };
  return(
    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden",padding:20,gap:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{fontSize:13,letterSpacing:4,color:"#00d084",marginBottom:4}}>EXPORT CONFIG</div>
          <div style={{fontSize:10,color:"#4a6272"}}>Цей файл вже автоматично зберігається на backend через SAVE & APPLY</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={copy} style={styles.ghostBtn}>{copied?"✓ COPIED":"⎘  COPY"}</button>
          <button onClick={dl} style={styles.accentBtn}>↓  DOWNLOAD</button>
        </div>
      </div>
      <div style={{background:"#0d1520",border:"1px solid #1a2a35",padding:"8px 14px",fontSize:11,display:"flex",gap:12,alignItems:"center"}}>
        <span style={{fontSize:9,color:"#4a6272",letterSpacing:2}}>PATH</span>
        <code style={{color:"#00d084",fontFamily:"inherit"}}>/app/config/camtrack_config.json</code>
      </div>
      <pre style={{flex:1,background:"#0a0f14",border:"1px solid #1a2a35",padding:14,
        overflow:"auto",fontSize:11,lineHeight:1.7,color:"#7a9aaa",margin:0,fontFamily:"monospace"}}>
        {config}
      </pre>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function Fld({label,children}){return<div style={{marginBottom:6}}><div style={styles.miniLabel}>{label}</div>{children}</div>;}
function ToolSec({label,children}){return<div style={{display:"flex",flexDirection:"column",gap:4}}><div style={{fontSize:9,color:"#3a5262",letterSpacing:2,marginBottom:2}}>{label}</div>{children}</div>;}
function getBBox(pts){const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);return{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};}
function rectsOverlap(a,b){const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y),x2=Math.min(a.x+a.w,b.x+b.w),y2=Math.min(a.y+a.h,b.y+b.h);if(x2<=x||y2<=y)return null;return{x,y,w:x2-x,h:y2-y};}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles={
  app:{display:"flex",flexDirection:"column",height:"100vh",overflow:"hidden",background:"#06090d",color:"#c8d8e4",fontFamily:"'Courier New',monospace"},
  toast:{position:"fixed",top:12,left:"50%",transform:"translateX(-50%)",zIndex:9999,padding:"10px 20px",fontSize:12,letterSpacing:1,borderRadius:2},
  header:{display:"flex",alignItems:"center",gap:16,padding:"0 16px",height:52,background:"#09111a",borderBottom:"1px solid #1a2a35",flexShrink:0},
  brand:{display:"flex",alignItems:"center",gap:10},
  brandIcon:{fontSize:22,color:"#00d084",lineHeight:1},
  brandName:{fontSize:15,fontWeight:"bold",letterSpacing:4,color:"#00d084"},
  brandSub:{fontSize:8,color:"#3a5262",letterSpacing:2},
  nav:{display:"flex",gap:3,flex:1},
  navBtn:{background:"transparent",border:"1px solid #1a2535",color:"#3a5262",padding:"5px 12px",cursor:"pointer",fontFamily:"inherit",fontSize:10,letterSpacing:2},
  navBtnOn:{background:"#00d08412",border:"1px solid #00d08450",color:"#00d084"},
  statusBar:{fontSize:10,color:"#3a5262",display:"flex",alignItems:"center",gap:6,letterSpacing:1,whiteSpace:"nowrap"},
  statusDot:{width:5,height:5,borderRadius:"50%",background:"#00d084",boxShadow:"0 0 5px #00d084",display:"inline-block"},
  saveBtn:{background:"#00d08422",border:"1px solid #00d084",color:"#00d084",padding:"6px 14px",cursor:"pointer",fontFamily:"inherit",fontSize:10,letterSpacing:1,flexShrink:0},

  mapLayout:{display:"flex",flex:1,overflow:"hidden"},
  toolbar:{width:148,background:"#09111a",borderRight:"1px solid #1a2a35",padding:12,display:"flex",flexDirection:"column",gap:14,overflowY:"auto",flexShrink:0},
  toolBtn:{background:"transparent",border:"1px solid #1a2535",color:"#7a9aaa",padding:"6px 8px",cursor:"pointer",fontFamily:"inherit",fontSize:10,textAlign:"left",letterSpacing:1},
  toolBtnOn:{background:"#00d08412",border:"1px solid #00d08450",color:"#00d084"},
  toolBtnDanger:{background:"transparent",border:"1px solid #3a1a1a",color:"#ef444466",padding:"6px 8px",cursor:"pointer",fontFamily:"inherit",fontSize:10,textAlign:"left",letterSpacing:1},
  hint:{fontSize:9,color:"#3a5262",lineHeight:1.7,padding:"5px 0 0 8px",borderLeft:"2px solid #1a2535"},
  numInput:{background:"#0d1520",border:"1px solid #1a2a35",color:"#c8d8e4",padding:"4px 6px",fontFamily:"inherit",fontSize:11,width:"100%",boxSizing:"border-box"},
  miniLabel:{fontSize:9,color:"#3a5262",letterSpacing:2,marginBottom:2},
  canvasWrap:{flex:1,display:"flex",alignItems:"center",justifyContent:"center",background:"#04060a",position:"relative",overflow:"hidden"},
  canvas:{display:"block",maxWidth:"100%",maxHeight:"100%"},
  mapFoot:{position:"absolute",bottom:6,right:10,fontSize:9,color:"#1e3040",letterSpacing:1,pointerEvents:"none"},
  sidePanel:{width:210,background:"#09111a",borderLeft:"1px solid #1a2a35",overflowY:"auto",flexShrink:0},
  inp:{background:"#0d1520",border:"1px solid #1a2a35",color:"#c8d8e4",padding:"5px 7px",fontFamily:"inherit",fontSize:11,width:"100%",boxSizing:"border-box"},
  deleteBtnFull:{background:"transparent",border:"1px solid #3a1a1a",color:"#ef444466",padding:"7px",cursor:"pointer",fontFamily:"inherit",fontSize:10,width:"100%",letterSpacing:1,marginTop:4},
  empty:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",color:"#3a5262",textAlign:"center"},
  camTab:{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"},
  camTabHeader:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 18px",borderBottom:"1px solid #1a2a35"},
  addBtn:{background:"#00d08412",border:"1px solid #00d08450",color:"#00d084",padding:"6px 14px",cursor:"pointer",fontFamily:"inherit",fontSize:10,letterSpacing:1},
  camCards:{flex:1,overflowY:"auto",padding:"10px 18px",display:"flex",flexDirection:"column",gap:6},
  card:{background:"#09111a",borderLeft:"3px solid",border:"1px solid #1a2a35"},
  cardRow:{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",cursor:"pointer",userSelect:"none"},
  ghostBtn:{background:"transparent",border:"1px solid #1a2535",color:"#7a9aaa",padding:"6px 14px",cursor:"pointer",fontFamily:"inherit",fontSize:10,letterSpacing:1},
  accentBtn:{background:"#00d08412",border:"1px solid #00d08450",color:"#00d084",padding:"6px 14px",cursor:"pointer",fontFamily:"inherit",fontSize:10,letterSpacing:1},
  streamsTab:{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"},
  streamsGrid:{flex:1,overflowY:"auto",padding:16,display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(440px,1fr))",gap:12,alignContent:"start"},
  streamCard:{background:"#09111a",border:"1px solid #1a2a35",display:"flex",flexDirection:"column"},
  streamHeader:{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderBottom:"1px solid #1a2a35",borderLeft:"3px solid"},
  streamImgWrap:{position:"relative",background:"#040608",minHeight:160},
  streamImg:{width:"100%",display:"block"},
  streamNoTrack:{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#3a5262"},
  streamFooter:{padding:"6px 12px",display:"flex",gap:6,flexWrap:"wrap",minHeight:30,alignItems:"center"},
  trackBadge:{fontSize:10,background:"#ef444422",color:"#ef4444",border:"1px solid #ef444444",padding:"2px 8px",borderRadius:2},
};
