interface CardBackProps {
  showHint?: boolean;
}

export function CardBack({ showHint = true }: CardBackProps) {
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#3a3a3a' }}>
      {/* Dot grid pattern */}
      <div style={{ position: 'absolute', inset: 10, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gridTemplateRows: 'repeat(7, 1fr)', gap: 3 }}>
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} style={{ borderRadius: 2, background: '#484848' }} />
        ))}
      </div>

      {/* Inner border */}
      <div style={{ position: 'absolute', inset: 7, border: '1px solid #4a4a4a', borderRadius: 6 }} />

      {/* Center badge */}
      <div style={{
        position: 'relative',
        width: 40,
        height: 40,
        borderRadius: '50%',
        background: '#303030',
        border: '1.5px solid #555555',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
      }}>
        <span style={{ fontSize: 16, color: '#666666', userSelect: 'none' }}>◆</span>
      </div>

      {/* Tap hint */}
      {showHint && (
        <div style={{
          position: 'absolute',
          bottom: 12,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontSize: 7,
          color: '#666666',
          fontFamily: 'monospace',
          letterSpacing: 2,
          userSelect: 'none',
        }}>
          TAP TO REVEAL
        </div>
      )}
    </div>
  );
}