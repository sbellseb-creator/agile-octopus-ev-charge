import React from 'react';
import { Sparkles } from 'lucide-react';

const AgileCrystalBall: React.FC<{ region?: string }> = () => {
  return (
    <div className="space-y-6 text-white max-w-7xl mx-auto pb-12 flex flex-col items-center justify-center min-h-[50vh]">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 max-w-lg w-full text-center shadow-xl space-y-4">
        <div className="w-16 h-16 rounded-full bg-amber-400/10 flex items-center justify-center text-amber-400 mx-auto">
          <Sparkles className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-white">Crystal Ball Predictions</h3>
        <p className="text-sm text-neutral-400">
          View tomorrow's forecasted electricity rates and upcoming cheap import windows directly on agile-rates.uk.
        </p>
        <div className="pt-4">
          <a
            href="https://agile-rates.uk/#tomorrows-predictions"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 w-full py-3 px-6 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold transition-colors shadow-lg"
          >
            <Sparkles className="w-4 h-4" />
            Open Tomorrow's Predictions
          </a>
        </div>
      </div>
    </div>
  );
};

export default AgileCrystalBall;
