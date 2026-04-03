import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Clock, TrendingDown } from "lucide-react";
import { format } from "date-fns";

interface Rate {
  valid_from: string;
  valid_to: string;
  value_inc_vat: number;
}

function rateColorClass(p: number): string {
  if (p <= 0) return "text-[hsl(var(--neon-green))]";
  if (p < 8) return "text-[hsl(var(--neon-cyan))]";
  if (p < 15) return "text-chart-good";
  if (p < 25) return "text-chart-warning";
  return "text-chart-danger";
}

function rateBgClass(p: number): string {
  if (p <= 0) return "bg-[hsl(var(--neon-green)/0.1)]";
  if (p < 8) return "bg-[hsl(var(--neon-cyan)/0.1)]";
  if (p < 15) return "bg-chart-good/10";
  if (p < 25) return "bg-chart-warning/10";
  return "bg-chart-danger/10";
}

interface Props {
  rates: Rate[];
  now: Date;
}

export default function PriceList({ rates, now }: Props) {
  const [tab, setTab] = useState<"now" | "cheapest">("now");

  const futureRates = useMemo(() => {
    if (!rates) return [];
    return rates
      .filter((r) => new Date(r.valid_to).getTime() > now.getTime())
      .sort((a, b) => a.valid_from.localeCompare(b.valid_from));
  }, [rates, now]);

  const sortedByPrice = useMemo(
    () => [...futureRates].sort((a, b) => a.value_inc_vat - b.value_inc_vat),
    [futureRates]
  );

  const currentSlotFrom = useMemo(() => {
    const current = rates?.find((r) => {
      const from = new Date(r.valid_from).getTime();
      const to = new Date(r.valid_to).getTime();
      return now.getTime() >= from && now.getTime() < to;
    });
    return current?.valid_from || null;
  }, [rates, now]);

  const displayRates = tab === "now" ? futureRates : sortedByPrice;

  if (futureRates.length === 0) return null;

  return (
    <Card className="neon-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm sm:text-lg">Price List</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "now" | "cheapest")}>
          <TabsList className="grid grid-cols-2 w-full mb-3">
            <TabsTrigger value="now" className="gap-1.5 text-xs sm:text-sm">
              <Clock className="h-3.5 w-3.5" /> By Time
            </TabsTrigger>
            <TabsTrigger value="cheapest" className="gap-1.5 text-xs sm:text-sm">
              <TrendingDown className="h-3.5 w-3.5" /> Cheapest First
            </TabsTrigger>
          </TabsList>

          <div className="max-h-[400px] overflow-y-auto space-y-1 pr-1">
            {displayRates.map((r, i) => {
              const isCurrent = r.valid_from === currentSlotFrom;
              const fromTime = format(new Date(r.valid_from), "HH:mm");
              const toTime = format(new Date(r.valid_to), "HH:mm");
              const fromDate = format(new Date(r.valid_from), "EEE dd");
              const isNextDay = new Date(r.valid_from).getDate() !== now.getDate();

              return (
                <div
                  key={r.valid_from}
                  className={`flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
                    isCurrent
                      ? "bg-primary/15 border border-primary/40"
                      : i % 2 === 0
                        ? "bg-muted/30"
                        : ""
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs text-muted-foreground w-[90px] shrink-0">
                      {isNextDay && (
                        <span className="text-[10px] text-muted-foreground mr-1">{fromDate}</span>
                      )}
                      {fromTime}–{toTime}
                    </span>
                    {isCurrent && (
                      <Badge variant="default" className="text-[10px] px-1.5 py-0">
                        NOW
                      </Badge>
                    )}
                    {tab === "cheapest" && i < 3 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/40 text-primary">
                        #{i + 1}
                      </Badge>
                    )}
                  </div>
                  <span className={`font-bold tabular-nums ${rateColorClass(r.value_inc_vat)}`}>
                    {r.value_inc_vat.toFixed(2)}p
                  </span>
                </div>
              );
            })}
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
}
