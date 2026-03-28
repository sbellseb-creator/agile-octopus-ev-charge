import { useMemo, useState, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine, LabelList } from "recharts";
import { fetchAgileRates } from "@/lib/octopus-api";
import { Zap, Loader2, X, MousePointerClick, ChevronDown } from "lucide-react";
import { format } from "date-fns";

function rateColor(p: number): string {
  if (p <= 0) return "hsl(var(--neon-green))";
  if (p < 8) return "hsl(var(--neon-cyan))";
  if (p < 15) return "hsl(var(--chart-good))";
  if (p < 25) return "hsl(var(--chart-warning))";
  return "hsl(var(--chart-danger))";
}

interface SelectedWindow {
  valid_from: string;
  valid_to: string;
  price: number;
}

interface AgileRatesProps {
  onWindowsChange?: (windows: SelectedWindow[]) => void;
}

// Group continuous windows into ranges for display
function groupContinuousWindows(windows: SelectedWindow[]): { from: string; to: string; prices: number[]; count: number }[] {
  if (windows.length === 0) return [];
  const sorted = [...windows].sort((a, b) => a.valid_from.localeCompare(b.valid_from));
  const groups: { from: string; to: string; prices: number[]; count: number }[] = [];
  let current = { from: sorted[0].valid_from, to: sorted[0].valid_to, prices: [sorted[0].price], count: 1 };

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].valid_from === current.to) {
      current.to = sorted[i].valid_to;
      current.prices.push(sorted[i].price);
      current.count++;
    } else {
      groups.push(current);
      current = { from: sorted[i].valid_from, to: sorted[i].valid_to, prices: [sorted[i].price], count: 1 };
    }
  }
  groups.push(current);
  return groups;
}

// Custom label to show arrow on current slot
const CurrentSlotArrow = (props: any) => {
  const { x, y, width, value, index, chartData } = props;
  if (!chartData?.[index]?.isCurrent) return null;
  const cx = x + width / 2;
  return (
    <g>
      <polygon
        points={`${cx},${y - 18} ${cx - 6},${y - 8} ${cx + 6},${y - 8}`}
        fill="hsl(var(--primary))"
      />
      <text x={cx} y={y - 22} textAnchor="middle" fontSize={9} fill="hsl(var(--primary))" fontWeight="bold">
        NOW
      </text>
    </g>
  );
};

function PinchZoomChart({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const pinchRef = useRef({ startDist: 0, startScale: 1, startMid: { x: 0, y: 0 }, startTranslate: { x: 0, y: 0 } });

  const getDistance = (t1: React.Touch, t2: React.Touch) =>
    Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = getDistance(e.touches[0], e.touches[1]);
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      pinchRef.current = { startDist: dist, startScale: scale, startMid: { x: midX, y: midY }, startTranslate: { ...translate } };
    }
  }, [scale, translate]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = getDistance(e.touches[0], e.touches[1]);
      const { startDist, startScale, startMid, startTranslate } = pinchRef.current;
      const newScale = Math.min(Math.max(startScale * (dist / startDist), 1), 5);

      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

      const newTranslateX = startTranslate.x + (midX - startMid.x);
      const newTranslateY = startTranslate.y + (midY - startMid.y);

      setScale(newScale);
      setTranslate({ x: newTranslateX, y: newTranslateY });
    }
  }, []);

  const handleDoubleClick = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const isZoomed = scale > 1;

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="overflow-hidden"
        style={{ touchAction: 'pan-y' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onDoubleClick={handleDoubleClick}
      >
        <div
          style={{
            transform: `scale(${scale}) translate(${translate.x / scale}px, ${translate.y / scale}px)`,
            transformOrigin: 'center center',
            transition: isZoomed ? 'none' : 'transform 0.2s ease-out',
          }}
        >
          {children}
        </div>
      </div>
      {isZoomed && (
        <p className="text-[10px] text-muted-foreground text-center mt-1">Pinch to zoom · Double-tap to reset</p>
      )}
      {!isZoomed && (
        <p className="text-[10px] text-muted-foreground text-center mt-1 sm:hidden">Pinch to zoom</p>
      )}
    </div>
  );
}

export default function AgileRates({ onWindowsChange }: AgileRatesProps) {
  const now = useMemo(() => new Date(), []);
  const periodFrom = useMemo(() => new Date(now.getTime() - 60 * 60 * 1000).toISOString(), [now]);
  const periodTo = useMemo(() => new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(), [now]);

  const [selectedWindows, setSelectedWindows] = useState<SelectedWindow[]>([]);

  const { data: rates, isLoading, error } = useQuery({
    queryKey: ["agile-rates", periodFrom],
    queryFn: () => fetchAgileRates(undefined, periodFrom, periodTo),
    refetchInterval: 30 * 60 * 1000,
    retry: 2,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const currentRate = rates?.find((r) => {
    const from = new Date(r.valid_from).getTime();
    const to = new Date(r.valid_to).getTime();
    return now.getTime() >= from && now.getTime() < to;
  });

  // Filter: only show previous slot + current + future
  const filteredRates = useMemo(() => {
    if (!rates) return [];
    const sorted = [...rates].sort((a, b) => a.valid_from.localeCompare(b.valid_from));
    const currentIdx = sorted.findIndex((r) => {
      const from = new Date(r.valid_from).getTime();
      const to = new Date(r.valid_to).getTime();
      return now.getTime() >= from && now.getTime() < to;
    });
    if (currentIdx < 0) return sorted.filter(r => new Date(r.valid_to).getTime() > now.getTime());
    const startIdx = Math.max(0, currentIdx - 1);
    return sorted.slice(startIdx);
  }, [rates, now]);

  const chartData = filteredRates.map((r) => ({
    time: format(new Date(r.valid_from), "HH:mm"),
    price: r.value_inc_vat,
    isCurrent: currentRate?.valid_from === r.valid_from,
    isSelected: selectedWindows.some(w => w.valid_from === r.valid_from),
    isCheap: r.value_inc_vat < 8 && r.value_inc_vat > 0,
    isNegative: r.value_inc_vat <= 0,
    valid_from: r.valid_from,
    valid_to: r.valid_to,
  }));

  const avg = chartData.length > 0
    ? chartData.reduce((s, d) => s + d.price, 0) / chartData.length
    : 0;

  const minPrice = chartData.length > 0 ? Math.min(...chartData.map(d => d.price)) : 0;
  const yMin = Math.min(0, Math.floor(minPrice / 5) * 5 - 5);

  const handleBarClick = useCallback((data: any) => {
    if (!data?.activePayload?.[0]?.payload) return;
    const p = data.activePayload[0].payload;
    setSelectedWindows(prev => {
      const exists = prev.some(w => w.valid_from === p.valid_from);
      const next = exists
        ? prev.filter(w => w.valid_from !== p.valid_from)
        : [...prev, { valid_from: p.valid_from, valid_to: p.valid_to, price: p.price }];
      onWindowsChange?.(next);
      return next;
    });
  }, [onWindowsChange]);

  const removeWindow = useCallback((valid_from: string) => {
    setSelectedWindows(prev => {
      const next = prev.filter(w => w.valid_from !== valid_from);
      onWindowsChange?.(next);
      return next;
    });
  }, [onWindowsChange]);

  const removeGroup = useCallback((group: { from: string; to: string }) => {
    setSelectedWindows(prev => {
      const next = prev.filter(w => w.valid_from < group.from || w.valid_from >= group.to);
      onWindowsChange?.(next);
      return next;
    });
  }, [onWindowsChange]);

  const selectedCost = useMemo(() => {
    if (selectedWindows.length === 0) return null;
    const kwhPerSlot = 6.9 * 0.5;
    const totalKwh = kwhPerSlot * selectedWindows.length;
    const totalCost = selectedWindows.reduce((s, w) => s + (w.price * kwhPerSlot) / 100, 0);
    const avgPrice = selectedWindows.reduce((s, w) => s + w.price, 0) / selectedWindows.length;
    return { totalKwh: totalKwh.toFixed(1), totalCost: totalCost.toFixed(2), avgPrice: avgPrice.toFixed(2), slots: selectedWindows.length };
  }, [selectedWindows]);

  const groupedWindows = useMemo(() => groupContinuousWindows(selectedWindows), [selectedWindows]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="neon-border">
          <CardContent className="flex items-center gap-3 p-4">
            <Zap className="h-8 w-8 shrink-0 text-primary" />
            <div>
              <p className={`text-2xl font-bold ${currentRate && currentRate.value_inc_vat <= 0 ? 'neon-glow' : ''}`}>
                {currentRate ? `${currentRate.value_inc_vat.toFixed(2)}p` : "—"}
              </p>
              <p className="text-xs text-muted-foreground">Current Rate (inc VAT)</p>
            </div>
          </CardContent>
        </Card>
        <Card className="neon-border">
          <CardContent className="flex items-center gap-3 p-4">
            <Zap className="h-8 w-8 shrink-0 text-chart-good" />
            <div>
              <p className="text-2xl font-bold">
                {chartData.length > 0 ? `${Math.min(...chartData.map((d) => d.price)).toFixed(2)}p` : "—"}
              </p>
              <p className="text-xs text-muted-foreground">Lowest</p>
            </div>
          </CardContent>
        </Card>
        <Card className="neon-border">
          <CardContent className="flex items-center gap-3 p-4">
            <Zap className="h-8 w-8 shrink-0 text-chart-danger" />
            <div>
              <p className="text-2xl font-bold">
                {chartData.length > 0 ? `${Math.max(...chartData.map((d) => d.price)).toFixed(2)}p` : "—"}
              </p>
              <p className="text-xs text-muted-foreground">Highest</p>
            </div>
          </CardContent>
        </Card>
        <Card className="neon-border">
          <CardContent className="flex items-center gap-3 p-4">
            <Zap className="h-8 w-8 shrink-0 text-chart-warning" />
            <div>
              <p className="text-2xl font-bold">{avg > 0 ? `${avg.toFixed(2)}p` : "—"}</p>
              <p className="text-xs text-muted-foreground">Average</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Selected windows summary */}
      {selectedCost && (
        <Card className="border-primary/40 neon-border">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <MousePointerClick className="h-4 w-4" />
              Selected Charge Windows
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div>
                <p className="text-xl font-bold">{selectedCost.slots}</p>
                <p className="text-xs text-muted-foreground">Slots</p>
              </div>
              <div>
                <p className="text-xl font-bold">{selectedCost.totalKwh} kWh</p>
                <p className="text-xs text-muted-foreground">Est. Energy</p>
              </div>
              <div>
                <p className="text-xl font-bold">£{selectedCost.totalCost}</p>
                <p className="text-xs text-muted-foreground">Est. Cost</p>
              </div>
              <div>
                <p className="text-xl font-bold">{selectedCost.avgPrice}p</p>
                <p className="text-xs text-muted-foreground">Avg p/kWh</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {groupedWindows.map((g) => {
                const avgP = g.prices.reduce((s, p) => s + p, 0) / g.prices.length;
                return (
                  <Badge
                    key={g.from}
                    variant="outline"
                    className="gap-1 border-primary/40 text-primary cursor-pointer hover:border-destructive hover:text-destructive transition-colors"
                    onClick={() => removeGroup(g)}
                  >
                    {format(new Date(g.from), "HH:mm")}–{format(new Date(g.to), "HH:mm")}
                    {g.count > 1 ? ` (${g.count} slots, avg ${avgP.toFixed(2)}p)` : ` (${avgP.toFixed(2)}p)`}
                    <X className="h-3 w-3" />
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="neon-border">
        <CardHeader>
          <CardTitle className="text-sm sm:text-lg flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            Agile Rates (p/kWh)
            <span className="text-[10px] sm:text-xs text-muted-foreground font-normal">tap bars to select windows</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="text-destructive text-sm py-4 text-center">
              Failed to load rates. Check your API key and try again.
            </p>
          ) : filteredRates.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">
              No rates available.
            </p>
          ) : (
            <PinchZoomChart>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={chartData} onClick={handleBarClick} style={{ cursor: 'pointer' }} margin={{ top: 30, right: 2, bottom: 5, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 8, fill: "hsl(var(--foreground))" }}
                    stroke="hsl(var(--muted-foreground))"
                    interval={2}
                    angle={0}
                    textAnchor="middle"
                    height={30}
                  />
                  <YAxis
                    unit="p"
                    tick={{ fontSize: 9, fill: "hsl(var(--foreground))" }}
                    stroke="hsl(var(--muted-foreground))"
                    domain={[yMin, 'auto']}
                    width={35}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "var(--radius)",
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--popover))",
                      color: "hsl(var(--popover-foreground))",
                    }}
                    labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                    itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                    formatter={(value: number) => [`${value.toFixed(2)}p/kWh`, "Price"]}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                  <ReferenceLine y={8} stroke="hsl(var(--neon-cyan))" strokeDasharray="2 4" strokeOpacity={0.5} />
                  <Bar dataKey="price" radius={[2, 2, 0, 0]}>
                    <LabelList
                      content={(props: any) => <CurrentSlotArrow {...props} chartData={chartData} />}
                    />
                    {chartData.map((entry, i) => {
                      let fill = rateColor(entry.price);
                      let opacity = 0.85;
                      let strokeW = 0;
                      let stroke = "none";

                      if (entry.isSelected) {
                        fill = "hsl(var(--accent))";
                        opacity = 1;
                        stroke = "hsl(var(--accent))";
                        strokeW = 2;
                      } else if (entry.isCurrent) {
                        stroke = "hsl(var(--foreground))";
                        strokeW = 2;
                      }

                      return (
                        <Cell
                          key={i}
                          fill={fill}
                          opacity={opacity}
                          stroke={stroke}
                          strokeWidth={strokeW}
                          className={`${entry.isCheap && !entry.isSelected ? 'neon-pulse' : ''} ${entry.isNegative && !entry.isSelected ? 'neon-glow-bar' : ''}`}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </PinchZoomChart>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
