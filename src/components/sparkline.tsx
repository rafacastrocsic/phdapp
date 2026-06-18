// Dependency-free inline-SVG sparkline for the metrics trend cards.
// Server-renderable (no client hooks). Plots a single numeric series
// as a smooth-ish polyline with a faint area fill and a dot on the
// latest point. Nulls are skipped (gaps), so an early run with no
// check-in data still draws the rest.

export function Sparkline({
  values,
  color = "#6f4cff",
  width = 220,
  height = 44,
}: {
  values: (number | null)[];
  color?: string;
  width?: number;
  height?: number;
}) {
  const pts = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v !== null);

  if (pts.length === 0) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center justify-center text-[10px] text-slate-300"
      >
        no data yet
      </div>
    );
  }

  const n = values.length;
  const xs = (i: number) =>
    n <= 1 ? width / 2 : (i / (n - 1)) * (width - 4) + 2;

  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const span = max - min || 1;
  // Leave 4px vertical padding; higher value = higher on screen.
  const ys = (v: number) => height - 4 - ((v - min) / span) * (height - 8);

  const coords = pts.map((p) => `${xs(p.i)},${ys(p.v)}`);
  const linePath = `M ${coords.join(" L ")}`;
  const last = pts[pts.length - 1]!;
  // Area fill: drop to the baseline at both ends.
  const areaPath =
    `M ${xs(pts[0]!.i)},${height} ` +
    `L ${coords.join(" L ")} ` +
    `L ${xs(last.i)},${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
    >
      <path d={areaPath} fill={color} opacity={0.08} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={xs(last.i)} cy={ys(last.v)} r={2.5} fill={color} />
    </svg>
  );
}
