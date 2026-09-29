import React, { useMemo } from "react";
import { formatUK } from "@/lib/timezone";
import { Card } from "@/components/ui/card";
import { AlertTriangle, Trash2, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChargeSession {
  id: string;
  vehicle_id: string;
  added_kwh: number;
  cost: number;
  created_at: string;
  notes?: string;
}

interface ChargeTableProps {
  sessions: ChargeSession[];
  onDeleteSession?: (id: string) => void;
}

export default function ChargeTable({ sessions = [], onDeleteSession }: ChargeTableProps) {
  // 🛡️ SAFELY CLEAN AND FILTER CORRUPTED DATA RECORDS BEFORE LOOPING
  const safeSessions = useMemo(() => {
    if (!Array.isArray(sessions)) return [];
    return [...sessions]
      .filter(s => s && typeof s === 'object' && s.id)
      .sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });
  }, [sessions]);

  if (safeSessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-900/10 border border-white/5 rounded-2xl">
        <Calendar className="h-6 w-6 text-slate-500 mb-2" />
        <p className="text-xs text-slate-400 font-medium">No valid charging sessions log recorded yet.</p>
      </div>
    );
  }

  return (
    <Card className="bg-slate-900/40 border border-white/5 rounded-3xl overflow-hidden p-4">
      <div className="space-y-2">
        <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider mb-2">
          Historical Log Summary ({safeSessions.length})
        </h3>
        <div className="divide-y divide-white/5">
          {safeSessions.map((session) => {
            const displayCost = typeof session.cost === 'number' ? session.cost.toFixed(2) : '0.00';
            const displayKwh = typeof session.added_kwh === 'number' ? session.added_kwh.toFixed(1) : '0.0';
            let displayDate = "Unknown Date";
            
            try {
              if (session.created_at) {
                displayDate = formatUK(session.created_at, "dd MMM yyyy HH:mm");
              }
            } catch (e) {
              // Fail silent safety net
            }

            return (
              <div key={session.id} className="py-3 flex items-center justify-between gap-4 text-xs font-mono">
                <div>
                  <span className="block font-sans font-bold text-white">{displayDate}</span>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    {displayKwh} kWh added {session.notes ? `• ${session.notes}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-extrabold text-emerald-400">£{displayCost}</span>
                  {onDeleteSession && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-500 hover:text-rose-400"
                      onClick={() => onDeleteSession(session.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
