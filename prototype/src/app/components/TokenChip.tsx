import { useRef, useEffect } from 'react';
import { useDrag } from 'react-dnd';
import { getEmptyImage } from 'react-dnd-html5-backend';
import { motion, AnimatePresence } from 'motion/react';
import { Token, TokenDragItem, TOKEN_COLOR } from '../types';

const FONT = "'Space Mono', monospace";

// ─── Shared visual ────────────────────────────────────────────────────────────
// Renders the circular coin face — no drag logic, pure visual.

interface CoinProps {
  token:   Token;
  size:    number;
  dimmed?: boolean;
}

export function TokenCoin({ token, size, dimmed = false }: CoinProps) {
  const color    = TOKEN_COLOR[token.type];
  const fontSize = Math.round(size * 0.34);

  return (
    <div style={{
      width:        size,
      height:       size,
      borderRadius: '50%',
      background:   'radial-gradient(ellipse at 35% 30%, #3e3e3e, #181818)',
      border:       `2px solid ${color}`,
      boxShadow: [
        // outer rim gap
        `0 0 0 1px rgba(0,0,0,0.75)`,
        // top highlight (embossed face)
        `inset 0 1px 4px rgba(255,255,255,0.14)`,
        // bottom shadow
        `inset 0 -1px 4px rgba(0,0,0,0.55)`,
        // lift shadow
        `0 4px 16px rgba(0,0,0,0.75)`,
        // color glow
        `0 0 8px ${color}28`,
      ].join(', '),
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      opacity:         dimmed ? 0.35 : 1,
      transition:     'opacity 0.15s',
      flexShrink:      0,
    }}>
      <span style={{
        fontSize,
        fontFamily: FONT,
        fontWeight: 700,
        color,
        lineHeight: 1,
        userSelect: 'none',
        // Slight text shadow matching the color for depth
        textShadow: `0 0 6px ${color}88`,
      }}>
        {token.symbol}
      </span>
    </div>
  );
}

// ─── Tray chip (draggable) ────────────────────────────────────────────────────

interface TrayChipProps {
  token:      Token;
  trayIndex:  number;
}

export function TrayTokenChip({ token, trayIndex }: TrayChipProps) {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag, dragPreview] = useDrag<
    TokenDragItem,
    void,
    { isDragging: boolean }
  >({
    type: 'TOKEN',
    item: { token, source: 'tray', trayIndex },
    collect: m => ({ isDragging: m.isDragging() }),
  });

  useEffect(() => {
    dragPreview(getEmptyImage(), { captureDraggingState: true });
  }, [dragPreview]);

  drag(ref);

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ scale: 0.7, opacity: 0 }}
      animate={{ scale: 1,   opacity: 1 }}
      exit={{    scale: 0.7, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
      whileHover={!isDragging ? { y: -5, scale: 1.08 } : undefined}
      style={{
        cursor:     isDragging ? 'grabbing' : 'grab',
        opacity:    isDragging ? 0.28 : 1,
        transition: 'opacity 0.08s',
        flexShrink: 0,
        position:   'relative',
      }}
      title={`${token.label} — ${token.description}`}
    >
      <TokenCoin token={token} size={40} />
      {/* Label below */}
      <div style={{
        position:  'absolute',
        bottom:    -14,
        left:       '50%',
        transform: 'translateX(-50%)',
        fontSize:   6,
        fontFamily: FONT,
        color:      TOKEN_COLOR[token.type],
        letterSpacing: 1,
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      }}>
        {token.label}
      </div>
    </motion.div>
  );
}

// ─── Placed chip (on card in lineup slot, also draggable) ────────────────────

interface PlacedChipProps {
  token:     Token;
  slotIndex: number;
  onRemove:  () => void;
}

export function PlacedTokenChip({ token, slotIndex, onRemove }: PlacedChipProps) {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag, dragPreview] = useDrag<
    TokenDragItem,
    void,
    { isDragging: boolean }
  >({
    type: 'TOKEN',
    item: { token, source: 'slot', slotIndex },
    collect: m => ({ isDragging: m.isDragging() }),
  });

  useEffect(() => {
    dragPreview(getEmptyImage(), { captureDraggingState: true });
  }, [dragPreview]);

  drag(ref);

  return (
    <AnimatePresence>
      <motion.div
        ref={ref}
        key={token.id}
        initial={{ scale: 0, rotate: -200, opacity: 0 }}
        animate={{ scale: 1, rotate:    0, opacity: 1 }}
        exit={{    scale: 0, rotate:  160, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 22 }}
        onDoubleClick={e => { e.stopPropagation(); onRemove(); }}
        title={`${token.label} — double-click to return`}
        style={{
          cursor:     isDragging ? 'grabbing' : 'grab',
          opacity:    isDragging ? 0.22 : 1,
          transition: 'opacity 0.08s',
          // parent is responsible for absolute positioning
        }}
      >
        <TokenCoin token={token} size={30} />
      </motion.div>
    </AnimatePresence>
  );
}
