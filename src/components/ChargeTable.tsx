import React, { useMemo } from "react";
import { formatUK } from "@/lib/timezone";
import { Card } from "@/components/ui/card";
import { Trash2, Calendar, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChargeTableProps {
  sessions: any[];
  onDeleteSession?: (id: string) => void;
  onEditSession?: (session: any) => void;
}

export default function ChargeTable({ sessions = [], onDeleteSession, onEditSession }: ChargeTableProps) {
  const safeSessions = useMemo(() => {
    if (!Array.isArray(sessions)) return [];
    return [...sessions]
      .filter(s => s && typeof s === 'object' && s.id)
      .sort((a, b) => {
        const dateA = a.created_at || a.session_date ? new Date(a.created_at || a.session_date).getTime() : 0;
        const dateB = b.created_at || b.session_date ? new Date(b.created_at || b.session_date).getTime() : 0;
        return dateB - dateA;
      });
  }, [sessions]);

  if (safeSessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-900/10 border border-white/5 rounded-2xl">
        <Calendar className="h-6 w-6 text-slate-500 mb-2" />
        <p className="text-xs text-slate-400 font-medium">No valid charging sessions logged yet.</p>
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
            const displayCost = typeof session.total_cost_gbp === 'number' ? session.total_cost_gbp.toFixed(2) : '0.00';
            const displayKwh = typeof session.energy_added_kwh === 'number' ? session.energy_added_kwh.toFixed(1) : '0.0';
            let displayDate = "Manual Session";
            
            try {
              if (session.created_at || session.session_date) {
                displayDate = formatUK(session.created_at || session.session_date, "dd MMM yyyy HH:mm");
              }
            } catch (e) {}

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
                  {onEditSession && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edit session"
                      className="h-7 w-7 text-slate-500 hover:text-amber-400"
                      onClick={() => onEditSession(session)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {onDeleteSession && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete session"
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
