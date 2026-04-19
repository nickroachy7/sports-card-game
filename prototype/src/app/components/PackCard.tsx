import { motion } from 'motion/react';
import { Card, CARD_DIMS, RARITY_COLOR } from '../types';
import { CardFront } from './CardFront';
import { CardBack } from './CardBack';

interface PackCardProps {
  card: Card;
  index: number;
  isRevealed: boolean;
  isCollecting: boolean;
  onFlip: () => void;
}

export function PackCard({ card, index, isRevealed, isCollecting, onFlip }: PackCardProps) {
  const { width, height } = CARD_DIMS.pack;
  const rarityColor = RARITY_COLOR[card.rarity];

  return (
    <motion.div
      initial={{ y: 120, opacity: 0, scale: 0.9 }}
      animate={
        isCollecting
          ? { y: -100, opacity: 0, scale: 0.85, transition: { duration: 0.45, delay: index * 0.07, ease: 'easeIn' } }
          : { y: 0, opacity: 1, scale: 1, transition: { duration: 0.55, delay: index * 0.09, type: 'spring', damping: 18, stiffness: 110 } }
      }
      onClick={!isRevealed ? onFlip : undefined}
      style={{ cursor: isRevealed ? 'default' : 'pointer', width, height }}
    >
      <div style={{ perspective: '1200px', width, height }}>
        <motion.div
          animate={{ rotateY: isRevealed ? 180 : 0 }}
          transition={{ duration: 0.55, type: 'spring', damping: 22, stiffness: 130 }}
          style={{
            transformStyle: 'preserve-3d',
            width: '100%',
            height: '100%',
            position: 'relative',
          }}
        >
          {/* ── BACK FACE ── */}
          <div style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            borderRadius: 10,
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            <CardBack showHint={!isRevealed} />
          </div>

          {/* ── FRONT FACE ── */}
          <div style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            borderRadius: 10,
            overflow: 'hidden',
            boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 0 2px ${rarityColor}55`,
          }}>
            <CardFront card={card} size="pack" />
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
