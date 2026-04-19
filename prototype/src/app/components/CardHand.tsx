import { useRef } from 'react';
import { useDrop } from 'react-dnd';
import { motion, AnimatePresence } from 'motion/react';
import { Card, DragItem } from '../types';
import { GameCard } from './GameCard';

interface CardHandProps {
  cards: Card[];
  onReturnToHand: (item: DragItem) => void;
  onCardClick: (card: Card) => void;
}

export function CardHand({ cards, onReturnToHand, onCardClick }: CardHandProps) {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isOver, canDrop }, drop] = useDrop<DragItem, void, { isOver: boolean; canDrop: boolean }>({
    accept: 'CARD',
    canDrop: item => item.source === 'lineup',
    drop: item => {
      if (item.source === 'lineup') onReturnToHand(item);
    },
    collect: monitor => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  drop(ref);

  const isActive = isOver && canDrop;

  return (
    <div
      ref={ref}
      style={{
        borderTop: `2px solid ${isActive ? '#aaaaaa' : '#4a4a4a'}`,
        background: isActive ? '#383838' : '#2e2e2e',
        // No overflow set here — lets cards lift freely above the tray
        transition: 'border-color 0.15s, background 0.15s',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      {/* Label row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 28px 0',
      }}>
        <span style={{ fontSize: 8, fontFamily: "'Space Mono', monospace", color: '#999999', letterSpacing: 3, textTransform: 'uppercase' }}>
          Hand
        </span>
        <span style={{ fontSize: 7, fontFamily: "'Space Mono', monospace", color: '#666666', letterSpacing: 1 }}>
          {cards.length} {cards.length === 1 ? 'card' : 'cards'}
        </span>
        <AnimatePresence>
          {isActive && (
            <motion.span
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -4 }}
              style={{ fontSize: 7, fontFamily: "'Space Mono', monospace", color: '#aaaaaa', letterSpacing: 2 }}
            >
              DROP TO RETURN
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Cards scroll row
          paddingTop creates headroom inside the overflow-x:auto container so
          hover-lifted cards (y: -6, scale: 1.03) never exceed the top boundary */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          overflowX: 'auto',
          // overflow-x:auto forces overflow-y:auto — paddingTop gives the
          // card room to lift into so it's never clipped
          paddingTop: 24,
          paddingBottom: 20,
          paddingLeft: 28,
          paddingRight: 28,
          scrollbarWidth: 'none',
        }}
      >
        {cards.length === 0 ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            height: 94,
            fontSize: 8,
            fontFamily: "'Space Mono', monospace",
            color: '#555555',
            letterSpacing: 2,
            whiteSpace: 'nowrap',
          }}>
            OPEN A PACK TO RECEIVE CARDS
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {cards.map((card, i) => (
              <motion.div
                key={card.id}
                layout
                initial={{ x: 20, opacity: 0, scale: 0.9 }}
                animate={{ x: 0, opacity: 1, scale: 1 }}
                exit={{ x: -10, opacity: 0, scale: 0.85 }}
                transition={{ type: 'spring', damping: 22, stiffness: 280, delay: i * 0.03 }}
              >
                <GameCard card={card} source="hand" handIndex={i} size="hand" onClick={() => onCardClick(card)} />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Right fade for overflow hint */}
      {cards.length > 6 && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 64,
          background: `linear-gradient(to right, transparent, ${isActive ? '#383838' : '#2e2e2e'})`,
          pointerEvents: 'none',
          transition: 'background 0.15s',
        }} />
      )}
    </div>
  );
}