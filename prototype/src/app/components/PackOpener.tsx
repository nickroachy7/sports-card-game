import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card } from '../types';
import { PackCard } from './PackCard';
import { CardBack } from './CardBack';

type Phase = 'sealed' | 'revealing' | 'collecting';

interface PackOpenerProps {
  cards: Card[];
  onCollect: (cards: Card[]) => void;
}

export function PackOpener({ cards, onCollect }: PackOpenerProps) {
  const [phase, setPhase] = useState<Phase>('sealed');
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [isCollecting, setIsCollecting] = useState(false);

  const allRevealed = revealed.size === cards.length;

  const handleTearOpen = () => setPhase('revealing');

  const handleFlip = (index: number) => {
    setRevealed(prev => new Set([...prev, index]));
  };

  const handleRevealAll = () => {
    setRevealed(new Set(cards.map((_, i) => i)));
  };

  const handleCollect = async () => {
    setIsCollecting(true);
    await new Promise(r => setTimeout(r, 650));
    onCollect(cards);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(30, 30, 30, 0.96)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      {/* ── HEADER ── */}
      <motion.div
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15 }}
        style={{ marginBottom: 48, textAlign: 'center' }}
      >
        <div style={{ fontSize: 9, letterSpacing: 4, color: '#999999', fontFamily: "'Space Mono', monospace", textTransform: 'uppercase', marginBottom: 8 }}>
          Pack Opening
        </div>
        <div style={{ fontSize: 11, letterSpacing: 1, color: '#888888', fontFamily: "'Space Mono', monospace" }}>
          {phase === 'sealed'
            ? 'Click the pack to open it'
            : allRevealed
            ? `All ${cards.length} cards revealed`
            : `Click each card  ·  ${revealed.size} / ${cards.length} revealed`}
        </div>
      </motion.div>

      {/* ── SEALED PACK ── */}
      <AnimatePresence>
        {phase === 'sealed' && (
          <motion.div
            key="sealed-pack"
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ scale: 1.1, opacity: 0, y: -24 }}
            transition={{ duration: 0.45, type: 'spring', damping: 18 }}
            onClick={handleTearOpen}
            whileHover={{ scale: 1.03, y: -5 }}
            whileTap={{ scale: 0.97 }}
            style={{
              cursor: 'pointer',
              width: 180,
              height: 252,
              borderRadius: 12,
              overflow: 'hidden',
              border: '1px solid #333333',
              position: 'relative',
              boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
            }}
          >
            <CardBack showHint={false} />

            {/* Pack label overlay */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              pointerEvents: 'none',
            }}>
              <div style={{ fontSize: 8, letterSpacing: 3, color: '#666666', fontFamily: "'Space Mono', monospace", marginBottom: 4 }}>SPORTS</div>
              <div style={{ fontSize: 13, letterSpacing: 3, color: '#999999', fontFamily: "'Space Mono', monospace" }}>PACK</div>
              <div style={{ width: 28, height: 1, background: '#383838', margin: '10px auto' }} />
              <div style={{ fontSize: 7, letterSpacing: 2, color: '#666666', fontFamily: "'Space Mono', monospace" }}>5 CARDS</div>
            </div>

            <div style={{
              position: 'absolute',
              bottom: 0, left: 0, right: 0,
              padding: '14px 0 10px',
              background: 'linear-gradient(transparent, rgba(14,14,14,0.9))',
              textAlign: 'center',
              fontSize: 8,
              color: '#666666',
              fontFamily: "'Space Mono', monospace",
              letterSpacing: 2,
            }}>
              CLICK TO OPEN
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CARD REVEAL ROW ── */}
      {phase === 'revealing' && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
          {cards.map((card, i) => (
            <PackCard
              key={card.id}
              card={card}
              index={i}
              isRevealed={revealed.has(i)}
              isCollecting={isCollecting}
              onFlip={() => handleFlip(i)}
            />
          ))}
        </div>
      )}

      {/* ── ACTIONS ── */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
        style={{ marginTop: 44, display: 'flex', gap: 12, alignItems: 'center' }}
      >
        {phase === 'revealing' && !allRevealed && (
          <motion.button
            whileHover={{ scale: 1.03, borderColor: '#666666', color: '#999999' }}
            whileTap={{ scale: 0.97 }}
            onClick={handleRevealAll}
            style={{
              padding: '10px 24px',
              background: 'transparent',
              border: '1px solid #383838',
              color: '#888888',
              fontFamily: "'Space Mono', monospace",
              fontSize: 9,
              letterSpacing: 2,
              cursor: 'pointer',
              borderRadius: 6,
            }}
          >
            REVEAL ALL
          </motion.button>
        )}

        {phase === 'revealing' && allRevealed && !isCollecting && (
          <motion.button
            initial={{ scale: 0.88, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 16 }}
            whileHover={{ scale: 1.04, background: '#ffffff' }}
            whileTap={{ scale: 0.97 }}
            onClick={handleCollect}
            style={{
              padding: '12px 36px',
              background: '#f0f0f0',
              border: 'none',
              color: '#1a1a1a',
              fontFamily: "'Space Mono', monospace",
              fontSize: 10,
              letterSpacing: 3,
              cursor: 'pointer',
              borderRadius: 6,
              boxShadow: '0 4px 20px rgba(240,240,240,0.12)',
            }}
          >
            COLLECT ALL
          </motion.button>
        )}
      </motion.div>

      {/* ── RARITY LEGEND ── */}
      {phase === 'revealing' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          style={{ position: 'absolute', bottom: 28, display: 'flex', gap: 24 }}
        >
          {[
            { label: 'Common', color: '#888888' },
            { label: 'Rare', color: '#aaaaaa' },
            { label: 'Epic', color: '#cccccc' },
            { label: 'Legendary', color: '#e8e8e8' },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: r.color }} />
              <span style={{ fontSize: 7, fontFamily: "'Space Mono', monospace", color: '#666666', letterSpacing: 1 }}>{r.label}</span>
            </div>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}