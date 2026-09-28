type AthleteAbstractVisualProps = {
  compact?: boolean
  fill?: boolean
  route?: boolean
}

export function AthleteAbstractVisual({ compact = false, fill = false, route = false }: AthleteAbstractVisualProps) {
  return (
    <div className={`athlete-abstract-visual${compact ? ' athlete-abstract-visual--compact' : ''}${fill ? ' athlete-abstract-visual--fill' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 720 280" preserveAspectRatio={fill ? 'xMidYMid slice' : 'xMidYMid meet'} role="presentation">
        <defs>
          <linearGradient id="athleteMountainFar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c9a7dc" />
            <stop offset="100%" stopColor="#eee4f3" />
          </linearGradient>
          <linearGradient id="athleteMountainMid" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8141a2" />
            <stop offset="100%" stopColor="#55206f" />
          </linearGradient>
          <linearGradient id="athleteMountainFront" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#55206f" />
            <stop offset="100%" stopColor="#2c103a" />
          </linearGradient>
        </defs>
        <rect width="720" height="280" fill="#f7f2fa" />
        <circle cx="610" cy="61" r="43" fill="#d6aa24" />
        <path d="M0 246 90 187 151 218 232 161 307 215 400 175 493 223 584 180 720 240 720 280 0 280Z" fill="url(#athleteMountainFar)" />
        <path d="M0 266 126 169 220 243 320 151 441 250 531 180 646 258 720 221 720 280 0 280Z" fill="url(#athleteMountainMid)" />
        <path d="M18 280 184 151 303 258 402 172 512 268 608 203 681 268 720 247 720 280Z" fill="url(#athleteMountainFront)" />
        <path d="M184 151 184 280 303 258Z" fill="#6d2c8b" opacity=".62" />
        <path d="M402 172 402 280 512 268Z" fill="#48155e" opacity=".72" />
        {route && <>
          <path d="M591 220C615 202 609 186 630 171C651 155 642 135 660 116" fill="none" stroke="#d6aa24" strokeWidth="4" strokeLinecap="round" strokeDasharray="5 11" />
          <circle cx="592" cy="219" r="5" fill="#d6aa24" />
          <circle cx="625" cy="175" r="5" fill="#d6aa24" />
          <circle cx="660" cy="116" r="5" fill="#d6aa24" />
        </>}
      </svg>
    </div>
  )
}
