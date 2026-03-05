export default function Sparkline({ data, color, width = 196, height = 36 }) {
  if (!data || data.length < 2) return <div style={{ height }} />;
  const max = Math.max(...data), min = Math.min(...data), rng = max - min || 0.001;
  const pts = data.map((v, i) => {
    const px = (i / (data.length - 1)) * width;
    const py = height - ((v - min) / rng) * (height - 6) - 3;
    return `${px},${py}`;
  }).join(" ");
  const last = pts.split(" ").pop().split(",");
  const gradId = `sg${color.replace("#", "")}`;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={`${pts} ${width},${height} 0,${height}`}
        fill={`url(#${gradId})`} stroke="none" />
      <polyline points={pts} fill="none" stroke={color}
        strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.8" fill={color} />
    </svg>
  );
}
