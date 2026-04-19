import { AnimatePresence, motion } from 'motion/react';
import { useDragLayer } from 'react-dnd';
import { Card, DragItem, LINEUP_POSITIONS, Token, TokenDragItem } from '../types';
import { LineupSlot } from './LineupSlot';

interface LineupAreaProps {
  lineup:        (Card | null)[];
  slotTokens:    (Token | null)[];
  onDrop:        (item: DragItem, slotIndex: number) => void;
  onRemove:      (slotIndex: number) => void;
  onTokenDrop:   (item: TokenDragItem, slotIndex: number) => void;
  onTokenRemove: (slotIndex: number) => void;
  onCardClick:   (card: Card) => void;
}

// Formation rows: Guards → Forwards → Center (2-2-1)
const ROWS = [
  [0, 1],    // PG, SG
  [2, 3, 4], // SF, PF, C
];

export function LineupArea({
  lineup, slotTokens,
  onDrop, onRemove, onTokenDrop, onTokenRemove, onCardClick,
}: LineupAreaProps) {
  const anyDragging = useDragLayer(monitor => monitor.isDragging());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      {ROWS.map((rowIndices, rowIdx) => (
        <div
          key={rowIdx}
          style={{
            display:        'flex',
            gap:             20,
            alignItems:     'flex-start',
            justifyContent: 'center',
          }}
        >
          {rowIndices.map(i => (
            <LineupSlot
              key={LINEUP_POSITIONS[i]}
              position={LINEUP_POSITIONS[i]}
              slotIndex={i}
              card={lineup[i]}
              token={slotTokens[i]}
              onDrop={onDrop}
              onRemove={onRemove}
              onTokenDrop={onTokenDrop}
              onTokenRemove={onTokenRemove}
              anyDragging={anyDragging}
              onCardClick={onCardClick}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
