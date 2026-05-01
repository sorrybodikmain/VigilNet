export function StreamImg({ camId, crop = "full", style, imgStyle, onError }) {
  if (crop === "full") {
    return (
      <img
        src={`/api/stream/${camId}`}
        alt={camId}
        style={style}
        onError={onError}
      />
    );
  }

  const isTop = crop === "top";
  return (
    <div style={{ width: "100%", height: "100%", ...style, overflow: "hidden", position: "relative" }}>
      <img
        src={`/api/stream/${camId}`}
        alt={camId}
        style={{
          width: "100%",
          height: "200%",
          display: "block",
          transform: `translateY(${isTop ? "0%" : "-50%"})`,
          ...imgStyle,
        }}
        onError={onError}
      />
    </div>
  );
}
