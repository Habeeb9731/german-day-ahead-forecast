interface BarGrowProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  fillOpacity?: number;
  index?: number;
  value?: number | [number, number];
  radius?: number;
}

const STEP_MS = 18;

/** A rounded bar that grows out of the zero line, each one slightly after the last. */
export function BarGrow({ x = 0, y = 0, width = 0, height = 0, fill, fillOpacity, index = 0, value, radius = 6 }: BarGrowProps) {
  if (!height) return null;
  const end = Array.isArray(value) ? value[1] : value;
  return (
    <rect
      className="entrance-bar"
      x={x}
      y={y}
      width={width}
      height={height}
      rx={Math.min(radius, width / 2)}
      fill={fill}
      fillOpacity={fillOpacity}
      style={{ transformOrigin: end !== undefined && end < 0 ? "top" : "bottom", animationDelay: `${index * STEP_MS}ms` }}
    />
  );
}
