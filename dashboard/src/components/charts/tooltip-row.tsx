import type { ReactNode } from "react";

/** One tooltip row. Value text keeps text colour; the swatch carries the series identity. */
export function TooltipRow({
  color,
  label,
  value,
}: {
  color: string;
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <div className="flex w-full items-center gap-2">
      <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} aria-hidden />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto pl-3 font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}
