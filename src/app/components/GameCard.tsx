import { useRef, useEffect } from 'react';
import { useDrag } from 'react-dnd';
import { getEmptyImage } from 'react-dnd-html5-backend';
import { motion } from 'motion/react';
import { Card, DragItem, CARD_DIMS, RARITY_COLOR } from '../types';
import { CardFront } from './CardFront';

interface GameCardProps {
  card: Card;
  source: 'hand' | 'lineup';
  handIndex?: number;
  slotIndex?: number;
  size?: 'hand' | 'lineup';
  onClick?: () => void;
  onDoubleClick?: () => void;
}

export function GameCard({ card, source, handIndex, slotIndex, size = 'hand', onClick, onDoubleClick }: GameCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag, dragPreview] = useDrag<DragItem, void, { isDragging: boolean }>({
    type: 'CARD',
    item: { card, source, handIndex, slotIndex },
    collect: monitor => ({ isDragging: monitor.isDragging() }),
  });

  // Replace browser ghost with our custom layer
  useEffect(() => {
    dragPreview(getEmptyImage(), { captureDraggingState: true });
  }, [dragPreview]);

  drag(ref);

  const { width, height } = CARD_DIMS[size];
  const rarityColor = RARITY_COLOR[card.rarity];

  return (
    <motion.div
      ref={ref}
      whileHover={!isDragging ? { y: -6, scale: 1.03 } : undefined}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      onClick={!isDragging ? onClick : undefined}
      onDoubleClick={onDoubleClick}
      style={{
        width,
        height,
        borderRadius: 8,
        background: isDragging ? 'transparent' : '#ffffff',
        border: isDragging ? `1.5px dashed #555555` : `1px solid #cccccc`,
        boxShadow: isDragging
          ? 'none'
          : `0 4px 18px rgba(0,0,0,0.45), 0 0 0 1.5px ${rarityColor}66`,
        // Opacity snaps instantly on drag start — no 150ms delay before ghost appears
        opacity: isDragging ? 0.28 : 1,
        cursor: isDragging ? 'grabbing' : 'grab',
        overflow: 'hidden',
        flexShrink: 0,
        userSelect: 'none',
        position: 'relative',
        // willChange promotes to GPU layer so hover transform is compositor-only
        willChange: 'transform',
        // Only transition properties that Motion doesn't own (border, box-shadow).
        // Do NOT transition opacity or transform here — Motion handles those.
        transition: 'border 0.08s, box-shadow 0.08s',
      }}
    >
      {/* Skeleton rows visible only while dragging */}
      {isDragging && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: size === 'hand' ? 5 : 8,
          padding: size === 'hand' ? '7px 8px' : '10px 12px',
          pointerEvents: 'none',
        }}>
          <div style={{ height: size === 'hand' ? 3 : 4, borderRadius: 2, background: '#4a4a4a' }} />
          <div style={{ height: size === 'hand' ? 10 : 16, borderRadius: 2, background: '#444444', width: '60%' }} />
          <div style={{ height: size === 'hand' ? 24 : 38, borderRadius: 2, background: '#3e3e3e' }} />
          <div style={{ height: size === 'hand' ? 6 : 8, borderRadius: 2, background: '#444444', width: '75%' }} />
        </div>
      )}
      {!isDragging && <CardFront card={card} size={size} />}
    </motion.div>
  );
}