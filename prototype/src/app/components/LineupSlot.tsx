import { useRef, useState, useEffect } from 'react';
import { useDrop } from 'react-dnd';
import { motion, AnimatePresence } from 'motion/react';
import { Card, DragItem, Position, CARD_DIMS, RARITY_COLOR, Token, TokenDragItem } from '../types';
import { GameCard } from './GameCard';
import { PlacedTokenChip } from './TokenChip';

interface LineupSlotProps {
  position:       Position;
  slotIndex:      number;
  card:           Card | null;
  token:          Token | null;
  onDrop:         (item: DragItem, slotIndex: number) => void;
  onRemove:       (slotIndex: number) => void;
  onTokenDrop:    (item: TokenDragItem, slotIndex: number) => void;
  onTokenRemove:  (slotIndex: number) => void;
  anyDragging:    boolean;
  onCardClick:    (card: Card) => void;
}

const HOVER_PAD      = 8;
const TOKEN_SIZE     = 30;   // placed-coin diameter

const SNAP: Parameters<typeof motion.div>[0]['transition'] = {
  type: 'spring', stiffness: 700, damping: 36, mass: 0.6,
};

export function LineupSlot({
  position, slotIndex, card, token,
  onDrop, onRemove, onTokenDrop, onTokenRemove,
  anyDragging, onCardClick,
}: LineupSlotProps) {
  const dropRef = useRef<HTMLDivElement>(null);

  const [flashKey, setFlashKey] = useState(0);
  const prevCardIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (card && card.id !== prevCardIdRef.current) setFlashKey(k => k + 1);
    prevCardIdRef.current = card?.id ?? null;
  }, [card]);

  // Accept BOTH card drags and token drags
  const [{ isOver, canDrop, isTokenHover }, drop] = useDrop<
    DragItem | TokenDragItem,
    void,
    { isOver: boolean; canDrop: boolean; isTokenHover: boolean }
  >({
    accept: ['CARD', 'TOKEN'],
    canDrop: (item, monitor) => {
      if (monitor.getItemType() === 'TOKEN') {
        // Token may only land on an occupied slot
        return !!card;
      }
      return true;
    },
    drop: (item, monitor) => {
      if (monitor.getItemType() === 'TOKEN') {
        onTokenDrop(item as TokenDragItem, slotIndex);
      } else {
        onDrop(item as DragItem, slotIndex);
      }
    },
    collect: monitor => ({
      isOver:      monitor.isOver(),
      canDrop:     monitor.canDrop(),
      // true only when a TOKEN is hovering over this slot
      isTokenHover: monitor.isOver() && monitor.getItemType() === 'TOKEN' && !!card,
    }),
  });

  drop(dropRef);

  const { width, height } = CARD_DIMS.lineup;
  const isActive    = isOver && canDrop;
  const isCardHover = isActive && !isTokenHover;
  const rarityColor = card ? RARITY_COLOR[card.rarity] : null;
  const idlePulse   = anyDragging && !card && !isActive;

  // Token anchor: center of placed coin = card bottom-right corner
  const tokenLeft = HOVER_PAD + width  - TOKEN_SIZE / 2;
  const tokenTop  = HOVER_PAD + height - TOKEN_SIZE / 2;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>

      {/* Position badge */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '3px 9px',
        borderRadius:    4,
        background:      isCardHover ? '#505050' : card ? '#383838' : '#2e2e2e',
        border:         `1px solid ${isCardHover ? '#888888' : card ? '#505050' : '#404040'}`,
        transition:     'background 0.1s, border-color 0.1s',
        minWidth:        34,
      }}>
        <span style={{
          fontSize:       8,
          fontFamily:    "'Space Mono', monospace",
          letterSpacing:  2,
          textTransform: 'uppercase',
          color:          isCardHover ? '#ffffff' : card ? '#cccccc' : '#888888',
          transition:    'color 0.1s',
        }}>
          {position}
        </span>
      </div>

      {/* Drop hit-area */}
      <div
        ref={dropRef}
        style={{ padding: HOVER_PAD, margin: -HOVER_PAD, position: 'relative' }}
      >
        {/* Slot shell */}
        <motion.div
          animate={{ scale: isCardHover ? 1.05 : idlePulse ? [1, 1.022, 1] : 1 }}
          transition={idlePulse
            ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }
            : SNAP}
          style={{
            width,
            height,
            borderRadius: 10,
            border: isCardHover
              ? '2px solid #e0e0e0'
              : card
              ? `1.5px solid ${rarityColor}66`
              : anyDragging
              ? '1.5px dashed #aaaaaa'
              : '1.5px dashed #505050',
            background: isCardHover ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.02)',
            position: 'relative',
          }}
        >
          {/* Empty placeholder */}
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
                  gap: 6, pointerEvents: 'none',
                }}
              >
                <div style={{ fontSize: 22, color: '#555555', lineHeight: 1 }}>+</div>
                <div style={{ fontSize: 7, fontFamily: "'Space Mono', monospace", color: '#666666', letterSpacing: 2 }}>
                  DROP HERE
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Landing flash */}
          <AnimatePresence>
            {flashKey > 0 && card && (
              <motion.div
                key={`flash-${flashKey}`}
                initial={{ opacity: 0.65, scale: 0.92 }}
                animate={{ opacity: 0,    scale: 1.08 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.38, ease: [0.2, 0.8, 0.4, 1] }}
                style={{
                  position: 'absolute', inset: -3, borderRadius: 13,
                  background: rarityColor
                    ? `radial-gradient(ellipse at center, ${rarityColor}55 0%, transparent 75%)`
                    : 'rgba(255,255,255,0.4)',
                  pointerEvents: 'none', zIndex: 20,
                }}
              />
            )}
          </AnimatePresence>
        </motion.div>

        {/* Card — outside shell so hover lift overflows */}
        <AnimatePresence mode="wait">
          {card && (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, scale: 1.14, y: -22, rotate: SLOT_TILTS[slotIndex] }}
              animate={{ opacity: 1, scale: 1,    y:   0, rotate: 0 }}
              exit={{    opacity: 0, scale: 0.88,  y:   8 }}
              transition={{ type: 'spring', stiffness: 620, damping: 24, mass: 0.7 }}
              style={{ position: 'absolute', top: HOVER_PAD, left: HOVER_PAD }}
            >
              <GameCard
                card={card}
                source="lineup"
                slotIndex={slotIndex}
                size="lineup"
                onClick={() => onCardClick(card)}
                onDoubleClick={() => onRemove(slotIndex)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Token anchor indicator — shown while a token is hovering ── */}
        <AnimatePresence>
          {isTokenHover && (
            <motion.div
              key="token-target"
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1   }}
              exit={{    opacity: 0, scale: 0.4 }}
              transition={{ type: 'spring', stiffness: 600, damping: 24 }}
              style={{
                position:     'absolute',
                top:           tokenTop,
                left:          tokenLeft,
                width:         TOKEN_SIZE,
                height:        TOKEN_SIZE,
                borderRadius: '50%',
                border:       '2px dashed rgba(255,255,255,0.55)',
                background:   'rgba(255,255,255,0.10)',
                pointerEvents: 'none',
                zIndex:         18,
              }}
            />
          )}
        </AnimatePresence>

        {/* ── Placed token coin ── */}
        <AnimatePresence>
          {card && token && (
            <div
              key={`placed-${token.id}`}
              style={{
                position: 'absolute',
                top:       tokenTop,
                left:      tokenLeft,
                zIndex:    25,
              }}
            >
              <PlacedTokenChip
                token={token}
                slotIndex={slotIndex}
                onRemove={() => onTokenRemove(slotIndex)}
              />
            </div>
          )}
        </AnimatePresence>

        {/* Outer glow ring on card-drop hover */}
        <AnimatePresence>
          {isCardHover && (
            <motion.div
              key="glow"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1   }}
              exit={{    opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.1 }}
              style={{
                position: 'absolute',
                top:   HOVER_PAD - 6, left:  HOVER_PAD - 6,
                right: HOVER_PAD - 6, bottom: HOVER_PAD - 6,
                borderRadius: 15,
                border: '1.5px solid rgba(255,255,255,0.28)',
                pointerEvents: 'none',
              }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Remove hint */}
      <div style={{
        fontSize: 7, fontFamily: "'Space Mono', monospace", letterSpacing: 1,
        color: card ? '#666666' : 'transparent',
        userSelect: 'none',
        marginTop: 2,
      }}>
        dbl-click to remove
      </div>
    </div>
  );
}

const SLOT_TILTS = [-3.5, -1.5, 0, 1.5, 3.5];
