import { useState, useEffect, useRef } from "react";

export function useWebSocket() {
  const [tracks, setTracks]       = useState({});
  const [ptzStates, setPtzStates] = useState({});
  const wsRef = useRef(null);

  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(`ws://${location.host}/ws/tracks`);
      ws.onmessage = e => {
        const data   = JSON.parse(e.data);
        const states = data._states || {};
        const trackMap = {};
        for (const [k, v] of Object.entries(data)) {
          if (k !== "_states") trackMap[k] = Array.isArray(v) ? v : [];
        }
        setTracks(trackMap);
        setPtzStates(states);
      };
      ws.onclose = () => setTimeout(connect, 3000);
      wsRef.current = ws;
    };
    connect();
    return () => wsRef.current?.close();
  }, []);

  return { tracks, ptzStates };
}
