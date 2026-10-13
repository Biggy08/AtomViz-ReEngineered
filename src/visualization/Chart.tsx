import { useState } from "react";
import type { Result } from "../domain/types";
const colors = ["#256a62", "#5178bd", "#ac7351", "#8560a2"];
export function Chart({ result }: { result: Result }) {
  const [hover, setHover] = useState<number | null>(null);
  const rows = result.rows;
  const W = 820,
    H = 300,
    L = 70,
    R = 28,
    T = 22,
    B = 52;
  const xmin = rows[0][0],
    xmax = rows[rows.length - 1][0];
  const values = rows.flatMap((r) => result.series.map((s) => r[s.column]));
  const ymin = Math.min(0, ...values),
    ymax = Math.max(...values, 0.001);
  const x = (v: number) => L + ((v - xmin) / (xmax - xmin || 1)) * (W - L - R);
  const y = (v: number) =>
    H - B - ((v - ymin) / (ymax - ymin || 1)) * (H - T - B);
  const ticks = Array.from({ length: 5 }, (_, i) => i / 4);
  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${result.title}: ${result.xLabel} versus ${result.yLabel}`}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={L}
              x2={W - R}
              y1={y(ymin + t * (ymax - ymin))}
              y2={y(ymin + t * (ymax - ymin))}
              stroke="#e8ecef"
            />
            <text
              x={L - 12}
              y={y(ymin + t * (ymax - ymin)) + 4}
              textAnchor="end"
            >
              {(ymin + t * (ymax - ymin)).toPrecision(3)}
            </text>
            <text
              x={x(xmin + t * (xmax - xmin))}
              y={H - B + 22}
              textAnchor="middle"
            >
              {(xmin + t * (xmax - xmin)).toPrecision(3)}
            </text>
          </g>
        ))}
        <text x={W / 2} y={H - 6} textAnchor="middle">
          {result.xLabel}
        </text>
        <text
          transform={`translate(16 ${H / 2}) rotate(-90)`}
          textAnchor="middle"
        >
          {result.yLabel}
        </text>
        {result.series.map((s, i) => (
          <polyline
            key={s.column}
            points={rows.map((r) => `${x(r[0])},${y(r[s.column])}`).join(" ")}
            fill="none"
            stroke={colors[i % colors.length]}
            strokeWidth="2"
          />
        ))}
        {rows.length === 1 &&
          result.series.map((s, i) => (
            <circle
              key={s.column}
              cx={x(rows[0][0])}
              cy={y(rows[0][s.column])}
              r="4"
              fill={colors[i]}
            />
          ))}
        <rect
          x={L}
          y={T}
          width={W - L - R}
          height={H - T - B}
          fill="transparent"
          onMouseMove={(e) => {
            const rect =
              e.currentTarget.ownerSVGElement!.getBoundingClientRect();
            const v =
              xmin +
              ((((e.clientX - rect.left) * W) / rect.width - L) / (W - L - R)) *
                (xmax - xmin);
            let closest = 0;
            rows.forEach((r, i) => {
              if (Math.abs(r[0] - v) < Math.abs(rows[closest][0] - v))
                closest = i;
            });
            setHover(closest);
          }}
        />
        {hover !== null && (
          <line
            x1={x(rows[hover][0])}
            x2={x(rows[hover][0])}
            y1={T}
            y2={H - B}
            stroke="#bac7cc"
          />
        )}
      </svg>
      <div className="chart-legend">
        {result.series.map((s, i) => (
          <span key={s.column}>
            <i style={{ background: colors[i] }} />
            {s.label}
          </span>
        ))}
      </div>
      {hover !== null && (
        <div className="chart-readout">
          {result.xLabel}: {rows[hover][0].toPrecision(5)} ·{" "}
          {result.series
            .map((s) => `${s.label}: ${rows[hover][s.column].toPrecision(5)}`)
            .join(" · ")}
        </div>
      )}
    </div>
  );
}
