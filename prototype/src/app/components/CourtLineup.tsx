import { useRef, useState, useEffect } from 'react';
import { useDrop, useDragLayer } from 'react-dnd';
import { motion, AnimatePresence } from 'motion/react';
import { Card, DragItem, Position, CARD_DIMS, RARITY_COLOR } from '../types';
import { GameCard } from './GameCard';

// ─── Slot positions as % of the court container ───────────────────────────────
// Basketball formation: PG at top of key, wings mid, posts low.
// LINEUP_POSITIONS = ['PG','SG','SF','PF','C']
const SLOT_CONFIG: { pos: Position; left: string; top: string; idx: number }[] = [
  { pos: 'PG', left: '50%',  top: '11%', idx: 0 },
  { pos: 'SG', left: '82%',  top: '43%', idx: 1 },
  { pos: 'SF', left: '18%',  top: '43%', idx: 2 },
  { pos: 'PF', left: '68%',  top: '76%', idx: 3 },
  { pos: 'C',  left: '32%',  top: '76%', idx: 4 },
];

const CARD_W = CARD_DIMS.hand.width;
const CARD_H = CARD_DIMS.hand.height;

// ─── CourtSlot ────────────────────────────────────────────────────────────────

interface CourtSlotProps {
  pos:         Position;
  idx:         number;
  left:        string;
  top:         string;
  card:        Card | null;
  onDrop:      (item: DragItem, slotIndex: number) => void;
  onRemove:    (slotIndex: number) => void;
  anyDragging: boolean;
  onCardClick: (card: Card) => void;
}

const SNAP = { type: 'spring', stiffness: 700, damping: 36, mass: 0.6 } as const;

function CourtSlot({ pos, idx, left, top, card, onDrop, onRemove, anyDragging, onCardClick }: CourtSlotProps) {
  const dropRef = useRef<HTMLDivElement>(null);

  const [flashKey, setFlashKey] = useState(0);
  const prevIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (card && card.id !== prevIdRef.current) setFlashKey(k => k + 1);
    prevIdRef.current = card?.id ?? null;
  }, [card]);

  const [{ isOver, canDrop }, drop] = useDrop<DragItem, void, { isOver: boolean; canDrop: boolean }>({
    accept: 'CARD',
    drop: item => onDrop(item, idx),
    collect: monitor => ({ isOver: monitor.isOver(), canDrop: monitor.canDrop() }),
  });
  drop(dropRef);

  const isActive    = isOver && canDrop;
  const rarityColor = card ? RARITY_COLOR[card.rarity] : null;
  const idlePulse   = anyDragging && !card && !isActive;

  return (
    <div
      ref={dropRef}
      style={{
        position:  'absolute',
        left,
        top,
        transform: 'translate(-50%, -50%)',
        zIndex:     card ? 3 : 1,
        padding:    12,
        margin:    -12,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>

        {/* Position label */}
        <div style={{
          fontSize:      8,
          fontFamily:   'monospace',
          letterSpacing: 3,
          textTransform: 'uppercase',
          color: isActive ? '#ffffff' : card ? '#aaaaaa' : anyDragging ? '#888888' : '#555555',
          transition: 'color 0.1s',
        }}>
          {pos}
        </div>

        <div style={{ position: 'relative' }}>
          {/* Slot shell */}
          <motion.div
            animate={{ scale: isActive ? 1.06 : idlePulse ? [1, 1.025, 1] : 1 }}
            transition={idlePulse
              ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }
              : SNAP}
            style={{
              width:        CARD_W,
              height:       CARD_H,
              borderRadius: 9,
              border: isActive
                ? '2px solid #d8d8d8'
                : card
                ? `1.5px solid ${rarityColor}66`
                : anyDragging
                ? '1.5px dashed #888888'
                : '1.5px dashed #444444',
              background: isActive
                ? 'rgba(255,255,255,0.10)'
                : 'rgba(255,255,255,0.015)',
              position: 'relative',
            }}
          >
            <AnimatePresence>
              {!card && (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: isActive ? 0 : 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1 }}
                  style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    gap: 4, pointerEvents: 'none',
                  }}
                >
                  <div style={{ fontSize: 18, color: '#484848', lineHeight: 1 }}>+</div>
                  <div style={{ fontSize: 6, fontFamily: 'monospace', color: '#484848', letterSpacing: 2 }}>DROP</div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Landing flash */}
            <AnimatePresence>
              {flashKey > 0 && card && (
                <motion.div
                  key={`flash-${flashKey}`}
                  initial={{ opacity: 0.6, scale: 0.9 }}
                  animate={{ opacity: 0,   scale: 1.12 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.36, ease: [0.2, 0.8, 0.4, 1] }}
                  style={{
                    position: 'absolute', inset: -4, borderRadius: 13,
                    background: rarityColor
                      ? `radial-gradient(ellipse at center, ${rarityColor}66 0%, transparent 70%)`
                      : 'rgba(255,255,255,0.4)',
                    pointerEvents: 'none', zIndex: 20,
                  }}
                />
              )}
            </AnimatePresence>
          </motion.div>

          {/* Card — outside shell so hover lift overflows cleanly */}
          <AnimatePresence mode="wait">
            {card && (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, scale: 1.12, y: -16 }}
                animate={{ opacity: 1, scale: 1,    y:   0 }}
                exit={{    opacity: 0, scale: 0.88,  y:   8 }}
                transition={{ type: 'spring', stiffness: 600, damping: 24 }}
                style={{ position: 'absolute', top: 0, left: 0 }}
              >
                <GameCard
                  card={card}
                  source="lineup"
                  slotIndex={idx}
                  size="hand"
                  onClick={() => onCardClick(card)}
                  onDoubleClick={() => onRemove(idx)}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Hover glow ring */}
          <AnimatePresence>
            {isActive && (
              <motion.div
                key="glow"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1   }}
                exit={{    opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.1 }}
                style={{
                  position: 'absolute', inset: -6, borderRadius: 15,
                  border: '1.5px solid rgba(255,255,255,0.22)',
                  pointerEvents: 'none', zIndex: 25,
                }}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Double-click hint */}
        <div style={{
          fontSize: 6, fontFamily: 'monospace', letterSpacing: 1,
          color: card ? '#555555' : 'transparent',
          userSelect: 'none',
        }}>
          dbl-click to remove
        </div>
      </div>
    </div>
  );
}

// ─── CourtLineup ──────────────────────────────────────────────────────────────

interface CourtLineupProps {
  lineup:      (Card | null)[];
  onDrop:      (item: DragItem, slotIndex: number) => void;
  onRemove:    (slotIndex: number) => void;
  onCardClick: (card: Card) => void;
}

export function CourtLineup({ lineup, onDrop, onRemove, onCardClick }: CourtLineupProps) {
  const anyDragging = useDragLayer(monitor => monitor.isDragging());
  const filledCount = lineup.filter(Boolean).length;

  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      width:         '100%',
      height:        '100%',
    }}>

      {/* Header strip */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        gap:             14,
        flexShrink:      0,
        paddingBottom:   8,
      }}>
        <div style={{ width: 32, height: 1, background: '#404040' }} />
        <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#aaaaaa', letterSpacing: 4 }}>
          STARTING LINEUP
        </span>
        <div style={{ width: 32, height: 1, background: '#404040' }} />
        <span style={{
          fontSize: 9, fontFamily: 'monospace', letterSpacing: 2,
          color: filledCount === 5 ? '#dddddd' : '#666666',
        }}>
          {filledCount} / 5
        </span>
      </div>

      {/* Formation area — fills all remaining height, slots positioned by % */}
      <div style={{ position: 'relative', flex: 1 }}>
        {SLOT_CONFIG.map(({ pos, left, top, idx }) => (
          <CourtSlot
            key={pos}
            pos={pos}
            idx={idx}
            left={left}
            top={top}
            card={lineup[idx]}
            onDrop={onDrop}
            onRemove={onRemove}
            anyDragging={anyDragging}
            onCardClick={onCardClick}
          />
        ))}

        {/* Lineup complete badge */}
        <AnimatePresence>
          {filledCount === 5 && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{
                position: 'absolute', bottom: 0, left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 8, fontFamily: 'monospace', color: '#777777', letterSpacing: 3,
              }}
            >
              <div style={{ width: 3, height: 3, borderRadius: '50%', background: '#777777' }} />
              LINEUP COMPLETE
              <div style={{ width: 3, height: 3, borderRadius: '50%', background: '#777777' }} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
