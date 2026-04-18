import { useRef } from 'react';
import { useDragLayer, XYCoord } from 'react-dnd';
import { CARD_DIMS, RARITY_COLOR } from '../types';
import { CardFront } from './CardFront';
import { TokenCoin } from './TokenChip';

export function CustomDragLayer() {
  const prevOffsetRef = useRef<XYCoord | null>(null);
  const rotRef        = useRef(0);

  const { isDragging, item, itemType, sourceOffset } = useDragLayer(monitor => ({
    item:         monitor.getItem(),
    itemType:     monitor.getItemType(),
    sourceOffset: monitor.getSourceClientOffset(),
    isDragging:   monitor.isDragging(),
  }));

  if (!isDragging || !item || !sourceOffset) return null;

  // ── Token drag preview ─────────────────────────────────────────────────────
  if (itemType === 'TOKEN') {
    const TOKEN_SIZE = 46;
    const { x, y } = sourceOffset;
    const transform = `translate3d(${x}px, ${y}px, 0) scale(1.15)`;

    return (
      <div style={{ position: 'fixed', pointerEvents: 'none', zIndex: 9999, inset: 0 }}>
        {/* Ground shadow */}
        <div style={{
          position:    'absolute',
          left:         x + TOKEN_SIZE / 2 - 18,
          top:          y + TOKEN_SIZE + 6,
          width:        36,
          height:       12,
          borderRadius: '50%',
          background:  'rgba(0,0,0,0.45)',
          filter:      'blur(6px)',
          willChange:  'transform',
        }} />
        {/* Token coin */}
        <div style={{
          position:        'absolute',
          top:              0,
          left:             0,
          transform,
          transformOrigin: 'center center',
          willChange:      'transform',
        }}>
          <TokenCoin token={item.token} size={TOKEN_SIZE} />
        </div>
      </div>
    );
  }

  // ── Card drag preview ──────────────────────────────────────────────────────
  // Velocity-based tilt — computed from position delta each render
  let rotation = 0;
  if (sourceOffset) {
    if (prevOffsetRef.current) {
      const dx = sourceOffset.x - prevOffsetRef.current.x;
      rotRef.current = rotRef.current * 0.72 + dx * 0.6;
      rotRef.current = Math.max(-18, Math.min(18, rotRef.current));
    }
    prevOffsetRef.current = sourceOffset;
    rotation = rotRef.current;
  } else {
    prevOffsetRef.current = null;
    rotRef.current = 0;
  }

  const isFromHand = item.source === 'hand';
  const size       = isFromHand ? 'hand' : 'lineup';
  const scale      = isFromHand ? 1.22 : 1.07;
  const { width, height } = CARD_DIMS[size];
  const rarityColor = RARITY_COLOR[item.card?.rarity] ?? '#aaaaaa';
  const { x, y } = sourceOffset;

  const transform = `translate3d(${x}px, ${y}px, 0) scale(${scale}) rotate(${rotation}deg)`;

  return (
    <div style={{ position: 'fixed', pointerEvents: 'none', zIndex: 9999, inset: 0 }}>
      {/* Ground shadow */}
      <div style={{
        position:        'absolute',
        left:             0,
        top:              0,
        width,
        height,
        transform:       `translate3d(${x + width / 2}px, ${y + height + 4}px, 0) scaleY(0.22) scaleX(0.78)`,
        transformOrigin: 'top center',
        borderRadius:    '50%',
        background:      'rgba(0,0,0,0.5)',
        filter:          'blur(10px)',
        willChange:      'transform',
      }} />

      {/* Card */}
      <div style={{
        position:        'absolute',
        top:              0,
        left:             0,
        width,
        height,
        transform,
        transformOrigin: 'center center',
        willChange:      'transform',
        borderRadius:     9,
        background:      '#ffffff',
        border:          `1.5px solid ${rarityColor}`,
        boxShadow: `
          0 ${isFromHand ? 30 : 20}px ${isFromHand ? 64 : 44}px rgba(0,0,0,0.80),
          0 8px 20px rgba(0,0,0,0.55),
          0 0 0 2px ${rarityColor}44
        `,
        overflow: 'hidden',
      }}>
        <CardFront card={item.card} size={size} />
      </div>
    </div>
  );
}
