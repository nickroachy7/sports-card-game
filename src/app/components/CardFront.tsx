import { Card, RARITY_COLOR } from '../types';

interface CardFrontProps {
  card: Card;
  size: 'hand' | 'lineup' | 'pack';
}

export function CardFront({ card, size }: CardFrontProps) {
  const rarityColor = RARITY_COLOR[card.rarity];
  const isSm = size === 'hand';
  const isLg = size === 'pack';

  const stripeH = isSm ? 3 : 4;
  const padH = isSm ? '5px 7px' : isLg ? '9px 13px' : '7px 10px';
  const posFontSize = isSm ? 8 : isLg ? 11 : 9;
  const ratingFontSize = isSm ? 26 : isLg ? 52 : 36;
  const nameFontSize = isSm ? 7 : isLg ? 11 : 9;
  const statLabelSize = isSm ? 6 : isLg ? 8 : 7;
  const statValSize = isSm ? 9 : isLg ? 14 : 11;
  const rarityTagSize = isSm ? 6 : isLg ? 8 : 7;
  const statPad = isSm ? '5px 7px' : isLg ? '9px 13px' : '7px 10px';

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column', background: '#ffffff' }}>
      {/* Rarity stripe */}
      <div style={{ height: stripeH, background: rarityColor, flexShrink: 0 }} />

      {/* Header row */}
      <div style={{ padding: padH, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: posFontSize, fontFamily: "'Space Mono', monospace", color: '#555555', letterSpacing: 1 }}>
          {card.position}
        </span>
        <span style={{ fontSize: posFontSize, fontFamily: "'Space Mono', monospace", color: '#888888' }}>
          {card.team}
        </span>
      </div>

      {/* Rating */}
      <div style={{ textAlign: 'center', padding: isSm ? '0 0 3px' : '2px 0 6px', flexShrink: 0 }}>
        <span style={{
          fontSize: ratingFontSize,
          fontWeight: 800,
          color: '#111111',
          lineHeight: 1,
          fontFamily: "'Space Mono', monospace",
          display: 'block',
        }}>
          {card.rating}
        </span>
      </div>

      {/* Player name */}
      <div style={{
        padding: padH,
        borderTop: '1px solid #e8e8e8',
        borderBottom: '1px solid #e8e8e8',
        flexShrink: 0,
        overflow: 'hidden',
        background: '#f4f4f4',
      }}>
        <span style={{
          fontSize: nameFontSize,
          fontFamily: "'Space Mono', monospace",
          color: '#111111',
          letterSpacing: isSm ? 0.3 : 0.8,
          textTransform: 'uppercase',
          display: 'block',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {card.playerName}
        </span>
      </div>

      {/* Stats */}
      <div style={{ padding: statPad, display: 'flex', justifyContent: 'space-around', flexShrink: 0 }}>
        {card.stats.map(stat => (
          <div key={stat.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: statLabelSize, color: '#999999', fontFamily: "'Space Mono', monospace", letterSpacing: 1, marginBottom: 2 }}>
              {stat.label}
            </div>
            <div style={{ fontSize: statValSize, color: '#222222', fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Rarity tag */}
      <div style={{
        position: 'absolute',
        bottom: isSm ? 3 : 6,
        right: isSm ? 5 : 9,
        fontSize: rarityTagSize,
        color: rarityColor,
        fontFamily: "'Space Mono', monospace",
        letterSpacing: 1,
        fontWeight: 700,
      }}>
        {card.rarity.toUpperCase()}
      </div>
    </div>
  );
}