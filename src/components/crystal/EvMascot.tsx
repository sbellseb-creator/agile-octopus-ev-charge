interface EvMascotProps {
  mood: "confused" | "happy";
  className?: string;
}

/** Little EV character. Inline SVG, no external assets. */
export default function EvMascot({ mood, className }: EvMascotProps) {
  const happy = mood === "happy";
  return (
    <svg
      viewBox="0 0 160 120"
      className={className}
      role="img"
      aria-label={happy ? "Happy EV character" : "EV character scratching its head, unsure"}
    >
      {/* body */}
      <rect x="20" y="52" width="110" height="38" rx="14" fill="#6366f1" />
      <path d="M42 52 L56 30 H100 L116 52 Z" fill="#818cf8" />
      <path d="M50 52 L61 35 H78 V52 Z M82 52 V35 H98 L108 52 Z" fill="#e0e7ff" opacity="0.85" />
      {/* wheels */}
      <circle cx="46" cy="92" r="12" fill="#0f172a" /><circle cx="46" cy="92" r="5" fill="#94a3b8" />
      <circle cx="104" cy="92" r="12" fill="#0f172a" /><circle cx="104" cy="92" r="5" fill="#94a3b8" />
      {/* face on the front */}
      <circle cx="92" cy="68" r="4.5" fill="#fff" /><circle cx="110" cy="68" r="4.5" fill="#fff" />
      <circle cx={happy ? 93 : 91} cy={happy ? 68 : 69} r="2" fill="#0f172a" />
      <circle cx={happy ? 111 : 109} cy={happy ? 68 : 69} r="2" fill="#0f172a" />
      {happy ? (
        <path d="M94 77 Q101 85 108 77" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      ) : (
        <path d="M95 80 Q100 76 105 80 T110 80" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      )}
      {/* charge port bolt */}
      <path d="M30 62 l6 -8 v6 h5 l-6 8 v-6 z" fill="#facc15" />
      {/* arm */}
      {happy ? (
        <path d="M124 64 Q142 50 146 32" stroke="#a5b4fc" strokeWidth="5" fill="none" strokeLinecap="round" />
      ) : (
        <g>
          <path d="M120 56 Q138 44 108 28" stroke="#a5b4fc" strokeWidth="5" fill="none" strokeLinecap="round">
            <animate attributeName="d" dur="1s" repeatCount="indefinite"
              values="M120 56 Q138 44 108 28;M120 56 Q140 40 112 26;M120 56 Q138 44 108 28" />
          </path>
        </g>
      )}
      {/* thought / sparkle */}
      {happy ? (
        <text x="130" y="22" fontSize="16">✨</text>
      ) : (
        <text x="124" y="20" fontSize="16" fill="#cbd5e1">?</text>
      )}
    </svg>
  );
}
