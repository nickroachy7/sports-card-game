import { useRef } from 'react';
import { useDrop } from 'react-dnd';
import { motion, AnimatePresence } from 'motion/react';
import { Token, TokenDragItem } from '../types';
import { TrayTokenChip } from './TokenChip';

const FONT = "'Space Mono', monospace";

interface TokenTrayProps {
  tokens:          Token[];
  onReturnToTray:  (item: TokenDragItem) => void;
}

export function TokenTray({ tokens, onReturnToTray }: TokenTrayProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Accept slot-source tokens being dragged back to the tray
  const [{ isOver, canDrop }, drop] = useDrop<
    TokenDragItem,
    void,
    { isOver: boolean; canDrop: boolean }
  >({
    accept: 'TOKEN',
    canDrop: item => item.source === 'slot',
    drop:    item => { if (item.source === 'slot') onReturnToTray(item); },
    collect: m => ({ isOver: m.isOver(), canDrop: m.canDrop() }),
  });

  drop(ref);

  const isActive = isOver && canDrop;

  return (
    <div
      ref={ref}
      style={{
        background:  isActive ? '#343434' : '#2e2e2e',
        borderTop:   `1px solid ${isActive ? '#606060' : '#3e3e3e'}`,
        flexShrink:   0,
        transition:  'background 0.15s, border-color 0.15s',
        position:    'relative',
      }}
    >
      {/* ── Label row ── */}
      <div style={{
        display:    'flex',
        alignItems: 'center',
        gap:         12,
        padding:    '10px 28px 0',
      }}>
        <span style={{ fontSize: 8, fontFamily: FONT, color: '#999999', letterSpacing: 3 }}>
          TOKENS
        </span>
        <span style={{ fontSize: 7, fontFamily: FONT, color: '#666666', letterSpacing: 1 }}>
          {tokens.length} available
        </span>

        <AnimatePresence>
          {isActive && (
            <motion.span
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x:  0 }}
              exit={{    opacity: 0, x: -4 }}
              style={{ fontSize: 7, fontFamily: FONT, color: '#aaaaaa', letterSpacing: 2 }}
            >
              DROP TO RETURN
            </motion.span>
          )}
        </AnimatePresence>

        {/* Token type legend — always visible as ghost */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 14 }}>
          {tokens.length === 0 && (
            <span style={{ fontSize: 7, fontFamily: FONT, color: '#444444', letterSpacing: 2 }}>
              — PLACE ON LINEUP CARDS —
            </span>
          )}
        </div>
      </div>

      {/* ── Token scroll row ── */}
      <div style={{
        display:       'flex',
        gap:            20,
        overflowX:     'auto',
        padding:       '20px 28px 20px',   // top padding gives room for the label below each chip
        paddingTop:     22,
        scrollbarWidth: 'none',
        alignItems:    'center',
        minHeight:      80,
      }}>
        {tokens.length === 0 ? (
          <div style={{
            height:     40,
            display:    'flex',
            alignItems: 'center',
            fontSize:   8,
            fontFamily: FONT,
            color:      '#444444',
            letterSpacing: 2,
            whiteSpace: 'nowrap',
          }}>
            ALL TOKENS PLACED
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {tokens.map((token, i) => (
              <div key={token.id} style={{ paddingBottom: 14 }}>
                <TrayTokenChip token={token} trayIndex={i} />
              </div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Right fade */}
      {tokens.length > 8 && (
        <div style={{
          position:      'absolute',
          right:          0,
          top:            0,
          bottom:         0,
          width:          48,
          background:    `linear-gradient(to right, transparent, ${isActive ? '#343434' : '#2e2e2e'})`,
          pointerEvents: 'none',
          transition:    'background 0.15s',
        }} />
      )}
    </div>
  );
}
