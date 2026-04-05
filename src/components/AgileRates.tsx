import { useMemo, useState, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine, LabelList } from "recharts";
import { fetchAgileRates } from "@/lib/octopus-api";
import { addSession } from "@/lib/charge-data";
import type { Vehicle } from "@/lib/vehicle-data";
import { Zap, Loader2, X, MousePointerClick, Save, ChevronLeft, ChevronRight } from "lucide-react";
import PriceList from "@/components/PriceList";
import { format } from "date-fns";
import { toast } from "sonner";

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
  vehicles?: Vehicle[];
  onSessionSaved?: () => void;
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
      // Dampen zoom: use square root of ratio for gentler response
      const ratio = dist / startDist;
      const dampened = ratio > 1 ? 1 + Math.sqrt(ratio - 1) * 0.5 : 1 - Math.sqrt(1 - ratio) * 0.5;
      const newScale = Math.min(Math.max(startScale * dampened, 1), 3);

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

const UK_REGIONS: { code: string; label: string }[] = [
  { code: "F", label: "North Eastern" },
  { code: "A", label: "Eastern" },
  { code: "B", label: "East Midlands" },
  { code: "C", label: "London" },
  { code: "D", label: "Merseyside & N. Wales" },
  { code: "E", label: "West Midlands" },
  { code: "G", label: "North Western" },
  { code: "H", label: "Southern" },
  { code: "J", label: "South Eastern" },
  { code: "K", label: "South Wales" },
  { code: "L", label: "South Western" },
  { code: "M", label: "Yorkshire" },
  { code: "N", label: "South Scotland" },
  { code: "P", label: "North Scotland" },
];

export default function AgileRates({ onWindowsChange, vehicles = [], onSessionSaved }: AgileRatesProps) {
  const now = useMemo(() => new Date(), []);
  const periodFrom = useMemo(() => new Date(now.getTime() - 60 * 60 * 1000).toISOString(), [now]);
  const periodTo = useMemo(() => {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 30, 0, 0);
    return tomorrow.toISOString();
  }, [now]);

  const [region, setRegion] = useState("F");
  const [saveNotes, setSaveNotes] = useState("");
  const [saveVehicleId, setSaveVehicleId] = useState(() => (vehicles.find(v => v.is_default) || vehicles[0])?.id || "");

  const [selectedWindows, setSelectedWindows] = useState<SelectedWindow[]>([]);

  const { data: rates, isLoading, error } = useQuery({
    queryKey: ["agile-rates", periodFrom, region],
    queryFn: () => fetchAgileRates(undefined, periodFrom, periodTo, region),
    refetchInterval: 30 * 60 * 1000,
    retry: 2,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const [slotOffset, setSlotOffset] = useState(0);

  const currentRateIdx = useMemo(() => {
    if (!rates) return -1;
    const sorted = [...rates].sort((a, b) => a.valid_from.localeCompare(b.valid_from));
    return sorted.findIndex((r) => {
      const from = new Date(r.valid_from).getTime();
      const to = new Date(r.valid_to).getTime();
      return now.getTime() >= from && now.getTime() < to;
    });
  }, [rates, now]);

  const sortedRates = useMemo(() => {
    if (!rates) return [];
    return [...rates].sort((a, b) => a.valid_from.localeCompare(b.valid_from));
  }, [rates]);

  const viewedSlotIdx = currentRateIdx >= 0 ? currentRateIdx + slotOffset : -1;
  const viewedRate = viewedSlotIdx >= 0 && viewedSlotIdx < sortedRates.length ? sortedRates[viewedSlotIdx] : undefined;
  const currentRate = currentRateIdx >= 0 ? sortedRates[currentRateIdx] : undefined;
  const canPrev = viewedSlotIdx > 0;
  const canNext = viewedSlotIdx >= 0 && viewedSlotIdx < sortedRates.length - 1;

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
          <CardContent className="flex items-center gap-2 p-4">
            <div className="flex flex-col gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-5 w-5" disabled={!canPrev} onClick={() => setSlotOffset(o => o - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-5 w-5" disabled={!canNext} onClick={() => setSlotOffset(o => o + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Zap className="h-8 w-8 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className={`text-2xl font-bold ${viewedRate && viewedRate.value_inc_vat <= 0 ? 'neon-glow' : ''}`}>
                {viewedRate ? `${viewedRate.value_inc_vat.toFixed(2)}p` : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {slotOffset === 0 ? "Current Rate" : viewedRate ? `${format(new Date(viewedRate.valid_from), "HH:mm")}–${format(new Date(viewedRate.valid_to), "HH:mm")}` : "—"}
              </p>
              {slotOffset !== 0 && (
                <button className="text-[10px] text-primary underline" onClick={() => setSlotOffset(0)}>Back to now</button>
              )}
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
            <Zap className="h-8 w-8 shrink-0 text-chart-warning" />
            <div>
              <p className="text-2xl font-bold">{avg > 0 ? `${avg.toFixed(2)}p` : "—"}</p>
              <p className="text-xs text-muted-foreground">Average</p>
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

            {/* Save as session */}
            {vehicles.length > 0 && (
              <div className="space-y-3 border-t border-border pt-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Vehicle</Label>
                    <Select value={saveVehicleId} onValueChange={setSaveVehicleId}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                      <SelectContent>
                        {vehicles.map(v => (
                          <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Notes</Label>
                    <Textarea className="h-8 text-xs min-h-[32px]" placeholder="Optional..." value={saveNotes} onChange={e => setSaveNotes(e.target.value)} rows={1} />
                  </div>
                </div>
                <Button
                  className="w-full gap-2"
                  onClick={() => {
                    const vehicle = vehicles.find(v => v.id === saveVehicleId);
                    if (!vehicle || !selectedCost) return;
                    const sorted = [...selectedWindows].sort((a, b) => a.valid_from.localeCompare(b.valid_from));
                    addSession({
                      session_date: new Date().toISOString().slice(0, 10),
                      start_time: sorted.length > 0 ? format(new Date(sorted[0].valid_from), "HH:mm") : undefined,
                      end_time: sorted.length > 0 ? format(new Date(sorted[sorted.length - 1].valid_to), "HH:mm") : undefined,
                      vehicle_id: vehicle.id,
                      vehicle_name: vehicle.name,
                      charge_mode: "agile_cheapest",
                      start_soc: 0,
                      end_soc: 0,
                      energy_added_kwh: parseFloat(selectedCost.totalKwh),
                      grid_kwh: 0,
                      total_cost_gbp: parseFloat(selectedCost.totalCost),
                      avg_pence_per_kwh: parseFloat(selectedCost.avgPrice),
                      num_slots: selectedCost.slots,
                      tariff_code: "AGILE-24-10-01",
                      notes: saveNotes,
                    });
                    toast.success("Charge session saved!");
                    setSelectedWindows([]);
                    setSaveNotes("");
                    onSessionSaved?.();
                  }}
                >
                  <Save className="h-4 w-4" /> Save as Charge Session
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="neon-border">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <CardTitle className="text-sm sm:text-lg flex items-center gap-1 sm:gap-2">
              Agile Rates (p/kWh)
              <span className="text-[10px] sm:text-xs text-muted-foreground font-normal">tap bars to select windows</span>
            </CardTitle>
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UK_REGIONS.map(r => (
                  <SelectItem key={r.code} value={r.code} className="text-xs">{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
                    interval={5}
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
                    position={{ x: 0, y: 0 }}
                    wrapperStyle={{ top: 0, right: 0, left: 'auto', position: 'absolute', pointerEvents: 'none' }}
                    contentStyle={{
                      borderRadius: "var(--radius)",
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--popover))",
                      color: "hsl(var(--popover-foreground))",
                      fontSize: "12px",
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

      {rates && rates.length > 0 && (
        <PriceList rates={rates} now={now} />
      )}
    </div>
  );
}
