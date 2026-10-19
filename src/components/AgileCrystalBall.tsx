import React from 'react';

const AgileCrystalBall: React.FC<{ region?: string }> = () => {
  return (
    <div className="w-full h-[85vh] min-h-[700px] flex flex-col bg-neutral-950 rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl">
      <div className="bg-neutral-900 px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
        <span className="text-sm font-semibold text-neutral-300 flex items-center gap-2">
          🔮 Crystal Ball — Tomorrow's Predictions
        </span>
        <a
          href="https://agile-rates.uk"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-amber-400 hover:underline"
        >
          Open in New Tab ↗
        </a>
      </div>
      <iframe 
        src="https://agile-rates.uk" 
        title="Agile Rates Tomorrow's Predictions"
        className="w-full flex-1 border-0 bg-neutral-950"
        allow="clipboard-write"
      />
    </div>
  );
};

export default AgileCrystalBall;
