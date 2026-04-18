import { AnimatePresence, motion } from 'motion/react';
import { Card, LINEUP_POSITIONS, RARITY_COLOR } from '../types';

const FONT = "'Space Mono', monospace";

interface QuickActionsProps {
  lineup:        (Card | null)[];
  packsLeft:     number;
  handCount:     number;
  onOpenPack:    () => void;
  onClearLineup: () => void;
  onSubmit:      () => void;
}

export function QuickActions({
  lineup, packsLeft, handCount, onOpenPack, onClearLineup, onSubmit,
}: QuickActionsProps) {
  const filled     = lineup.filter(Boolean).length;
  const isComplete = filled === 5;
  const hasCards   = filled > 0;

  const avgRating = filled > 0
    ? Math.round(
        (lineup.filter(Boolean) as Card[]).reduce((s, c) => s + c.rating, 0) / filled
      )
    : null;

  return (
    <div style={{
      width:         '100%',
      maxWidth:       260,
      flexShrink:     0,
      alignSelf:     'center',
      display:       'flex',
      flexDirection: 'column',
      gap:            16,
    }}>

      {/* ── Header row ── */}
      <div style={{
        display:        'flex',
        alignItems:     'baseline',
        justifyContent: 'space-between',
        paddingBottom:   10,
        borderBottom:   '1px solid #3e3e3e',
      }}>
        <span style={{ fontSize: 8, fontFamily: FONT, letterSpacing: 3, color: '#999999' }}>
          LINEUP INFO
        </span>
        <span style={{
          fontSize: 8, fontFamily: FONT, letterSpacing: 1,
          color: isComplete ? '#cccccc' : '#666666',
        }}>
          {filled} / 5
        </span>
      </div>

      {/* ── Progress bar ── */}
      <div>
        <div style={{
          height: 3, borderRadius: 2,
          background: '#2e2e2e',
          overflow: 'hidden',
        }}>
          <motion.div
            animate={{ width: `${(filled / 5) * 100}%` }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            style={{
              height: '100%', borderRadius: 2,
              background: isComplete ? '#cccccc' : '#555555',
            }}
          />
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          marginTop: 5,
        }}>
          <span style={{ fontSize: 7, fontFamily: FONT, color: '#666666', letterSpacing: 2 }}>
            SLOTS FILLED
          </span>
          <span style={{ fontSize: 7, fontFamily: FONT, color: '#666666', letterSpacing: 1 }}>
            {filled} OF 5
          </span>
        </div>
      </div>

      {/* ── OVR ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      }}>
        <span style={{ fontSize: 7, fontFamily: FONT, color: '#999999', letterSpacing: 2 }}>
          TEAM OVR
        </span>
        <AnimatePresence mode="wait">
          {avgRating != null ? (
            <motion.span
              key={avgRating}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y:  0 }}
              style={{ fontSize: 20, fontFamily: FONT, color: '#e8e8e8', lineHeight: 1 }}
            >
              {avgRating}
            </motion.span>
          ) : (
            <span style={{ fontSize: 11, fontFamily: FONT, color: '#444444' }}>—</span>
          )}
        </AnimatePresence>
      </div>

      {/* ── Per-position rows ── */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        paddingTop: 4, borderTop: '1px solid #383838',
      }}>
        {LINEUP_POSITIONS.map((pos, i) => {
          const card = lineup[i];
          return (
            <div key={pos} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{
                  width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                  background: card ? RARITY_COLOR[card.rarity] : '#3a3a3a',
                  border: `1px solid ${card ? RARITY_COLOR[card.rarity] + '80' : '#4a4a4a'}`,
                }} />
                <span style={{ fontSize: 7, fontFamily: FONT, color: '#999999', letterSpacing: 1 }}>
                  {pos}
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                {card ? (
                  <>
                    <span style={{ fontSize: 8, fontFamily: FONT, color: '#cccccc' }}>
                      {card.rating}
                    </span>
                    <span style={{ fontSize: 7, fontFamily: FONT, color: '#666666', marginLeft: 6 }}>
                      {card.playerName.split(' ').pop()?.toUpperCase().slice(0, 8)}
                    </span>
                  </>
                ) : (
                  <span style={{ fontSize: 7, fontFamily: FONT, color: '#444444', letterSpacing: 1 }}>
                    EMPTY
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── IN HAND ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingTop: 4, borderTop: '1px solid #383838',
      }}>
        <span style={{ fontSize: 7, fontFamily: FONT, color: '#999999', letterSpacing: 2 }}>IN HAND</span>
        <span style={{ fontSize: 11, fontFamily: FONT, color: '#cccccc' }}>{handCount}</span>
      </div>

      {/* ── Action buttons ── */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 7,
        paddingTop: 4, borderTop: '1px solid #3a3a3a',
      }}>

        {/* Lock in — only when complete */}
        <AnimatePresence>
          {isComplete && (
            <motion.button
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{    opacity: 0, y: 6 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={onSubmit}
              style={{
                padding: '10px', background: '#e8e8e8', color: '#111111',
                border: 'none', borderRadius: 6,
                fontSize: 8, fontFamily: FONT, letterSpacing: 2, cursor: 'pointer',
              }}
            >
              LOCK IN LINEUP
            </motion.button>
          )}
        </AnimatePresence>

        {/* Clear */}
        <motion.button
          whileHover={hasCards ? { scale: 1.02 } : undefined}
          whileTap={hasCards   ? { scale: 0.97 } : undefined}
          onClick={hasCards ? onClearLineup : undefined}
          style={{
            padding: '9px', background: 'transparent',
            color:  hasCards ? '#999999' : '#444444',
            border: `1px solid ${hasCards ? '#555555' : '#3a3a3a'}`,
            borderRadius: 6, fontSize: 8, fontFamily: FONT, letterSpacing: 2,
            cursor: hasCards ? 'pointer' : 'default',
            transition: 'color 0.15s, border-color 0.15s',
          }}
        >
          CLEAR LINEUP
        </motion.button>

        {/* Open pack */}
        <motion.button
          whileHover={packsLeft > 0 ? { scale: 1.02 } : undefined}
          whileTap={packsLeft  > 0 ? { scale: 0.97 } : undefined}
          onClick={packsLeft > 0 ? onOpenPack : undefined}
          style={{
            padding: '9px',
            background: packsLeft > 0 ? '#383838' : 'transparent',
            color:      packsLeft > 0 ? '#cccccc'  : '#444444',
            border: `1px solid ${packsLeft > 0 ? '#505050' : '#3a3a3a'}`,
            borderRadius: 6, fontSize: 8, fontFamily: FONT, letterSpacing: 2,
            cursor: packsLeft > 0 ? 'pointer' : 'default',
            transition: 'all 0.15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          OPEN PACK
          {packsLeft > 0 && (
            <span style={{
              background: '#505050', color: '#cccccc',
              fontSize: 7, fontFamily: FONT, padding: '1px 5px', borderRadius: 3,
            }}>
              {packsLeft}
            </span>
          )}
        </motion.button>
      </div>
    </div>
  );
}
