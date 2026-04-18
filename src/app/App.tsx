import { useState } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { AnimatePresence, motion } from 'motion/react';
import { Card, DragItem, Token, TokenDragItem } from './types';
import { drawPack, INITIAL_PACKS, INITIAL_TOKENS } from './gameData';
import { PackOpener } from './components/PackOpener';
import { PackCarousel } from './components/PackCarousel';
import { LineupArea } from './components/LineupArea';
import { CardHand } from './components/CardHand';
import { TokenTray } from './components/TokenTray';
import { CustomDragLayer } from './components/CustomDragLayer';
import { CardDetailView } from './components/CardDetailView';
import { Sidebar } from './components/Sidebar';
import { QuickActions } from './components/QuickActions';
import { CollectionPage } from './components/CollectionPage';

interface SelectedCard {
  card:   Card;
  source: 'hand' | 'lineup';
}

const VIEW_SPRING = { type: 'spring', stiffness: 340, damping: 32 } as const;

export default function App() {
  const [hand,           setHand]           = useState<Card[]>([]);
  const [lineup,         setLineup]         = useState<(Card | null)[]>([null, null, null, null, null]);
  const [tokens,         setTokens]         = useState<Token[]>(INITIAL_TOKENS);
  const [slotTokens,     setSlotTokens]     = useState<(Token | null)[]>([null, null, null, null, null]);
  const [packsLeft,      setPacksLeft]      = useState(INITIAL_PACKS);
  const [isCarouselOpen, setIsCarouselOpen] = useState(false);
  const [isOpenerOpen,   setIsOpenerOpen]   = useState(false);
  const [currentPack,    setCurrentPack]    = useState<Card[]>([]);
  const [selectedCard,   setSelectedCard]   = useState<SelectedCard | null>(null);
  const [submitFlash,    setSubmitFlash]    = useState(false);
  const [activeView,     setActiveView]     = useState<string>('lineup');

  // ── Pack flow ─────────────────────────────────────────────────────────────────
  const handleOpenPackButton = () => {
    if (packsLeft <= 0 || isOpenerOpen || isCarouselOpen) return;
    setIsCarouselOpen(true);
  };

  const handleSelectPack = () => {
    setIsCarouselOpen(false);
    setCurrentPack(drawPack());
    setPacksLeft(n => n - 1);
    setIsOpenerOpen(true);
  };

  const handleCollect = (cards: Card[]) => {
    setHand(prev => [...prev, ...cards]);
    setIsOpenerOpen(false);
    setCurrentPack([]);
  };

  // ── Drag & drop ───────────────────────────────────────────────────────────────
  const handleDropToSlot = (item: DragItem, targetSlot: number) => {
    if (item.source === 'hand' && item.handIndex !== undefined) {
      const dragged  = hand[item.handIndex];
      const existing = lineup[targetSlot];
      setLineup(prev => { const next = [...prev]; next[targetSlot] = dragged; return next; });
      setHand(prev => {
        const next = prev.filter((_, i) => i !== item.handIndex);
        return existing ? [...next, existing] : next;
      });
      // Token stays on slot when card is swapped in (slot-bound)
    } else if (item.source === 'lineup' && item.slotIndex !== undefined) {
      setLineup(prev => {
        const next = [...prev];
        const a = next[item.slotIndex!];
        next[item.slotIndex!] = next[targetSlot];
        next[targetSlot] = a;
        return next;
      });
      // Tokens stay on their original slots (slot-bound)
    }
  };

  const handleRemoveFromLineup = (slotIndex: number) => {
    const card = lineup[slotIndex];
    if (!card) return;
    // Return slot token to tray when card is benched
    const slotToken = slotTokens[slotIndex];
    if (slotToken) {
      setTokens(prev => [...prev, slotToken]);
      setSlotTokens(prev => { const next = [...prev]; next[slotIndex] = null; return next; });
    }
    setLineup(prev => { const next = [...prev]; next[slotIndex] = null; return next; });
    setHand(prev => [...prev, card]);
  };

  const handleReturnToHand = (item: DragItem) => {
    if (item.source !== 'lineup' || item.slotIndex === undefined) return;
    handleRemoveFromLineup(item.slotIndex);
  };

  // ── Token drag & drop ────────────────────────────────────────────────────────
  const handleDropTokenToSlot = (tokenItem: TokenDragItem, targetSlot: number) => {
    if (!lineup[targetSlot]) return;   // guard: only occupied slots
    if (tokenItem.source === 'slot' && tokenItem.slotIndex === targetSlot) return;

    const existingSlotToken = slotTokens[targetSlot];

    // Remove token from source
    if (tokenItem.source === 'tray') {
      setTokens(prev => prev.filter(t => t.id !== tokenItem.token.id));
    } else if (tokenItem.source === 'slot' && tokenItem.slotIndex !== undefined) {
      setSlotTokens(prev => {
        const next = [...prev]; next[tokenItem.slotIndex!] = null; return next;
      });
    }

    // Place in target slot
    setSlotTokens(prev => {
      const next = [...prev]; next[targetSlot] = tokenItem.token; return next;
    });

    // If target slot already had a different token, return it to tray
    if (existingSlotToken && existingSlotToken.id !== tokenItem.token.id) {
      setTokens(prev => [...prev, existingSlotToken]);
    }
  };

  const handleTokenRemoveFromSlot = (slotIndex: number) => {
    const tok = slotTokens[slotIndex];
    if (!tok) return;
    setSlotTokens(prev => { const next = [...prev]; next[slotIndex] = null; return next; });
    setTokens(prev => [...prev, tok]);
  };

  const handleReturnTokenToTray = (tokenItem: TokenDragItem) => {
    if (tokenItem.source !== 'slot' || tokenItem.slotIndex === undefined) return;
    handleTokenRemoveFromSlot(tokenItem.slotIndex);
  };

  // ── Card detail actions ───────────────────────────────────────────────────────
  const handleAddToLineup = () => {
    if (!selectedCard || selectedCard.source !== 'hand') return;
    const { card } = selectedCard;
    const firstEmpty = lineup.findIndex(c => c === null);
    if (firstEmpty === -1) return;
    setLineup(prev => { const next = [...prev]; next[firstEmpty] = card; return next; });
    setHand(prev => prev.filter(c => c.id !== card.id));
    setSelectedCard(null);
  };

  const handleSendToBench = () => {
    if (!selectedCard || selectedCard.source !== 'lineup') return;
    const { card } = selectedCard;
    const slotIdx = lineup.findIndex(c => c?.id === card.id);
    if (slotIdx === -1) return;
    // Return token to tray when card is benched via action button
    const slotToken = slotTokens[slotIdx];
    if (slotToken) {
      setTokens(prev => [...prev, slotToken]);
      setSlotTokens(prev => { const next = [...prev]; next[slotIdx] = null; return next; });
    }
    setLineup(prev => { const next = [...prev]; next[slotIdx] = null; return next; });
    setHand(prev => [...prev, card]);
    setSelectedCard(null);
  };

  const handleQuicksell = () => {
    if (!selectedCard) return;
    const { card, source } = selectedCard;
    if (source === 'hand') {
      setHand(prev => prev.filter(c => c.id !== card.id));
    } else {
      const slotIdx = lineup.findIndex(c => c?.id === card.id);
      if (slotIdx !== -1) {
        setLineup(prev => { const next = [...prev]; next[slotIdx] = null; return next; });
      }
    }
    setSelectedCard(null);
  };

  const handleSubmitLineup = () => {
    setSubmitFlash(true);
    setTimeout(() => setSubmitFlash(false), 1200);
  };

  // ── Derived state ─────────────────────────────────────────────────────────────
  const lineupFilled = lineup.filter(Boolean).length;
  const showDragHint = hand.length > 0 && lineupFilled < 5 && !selectedCard;
  const hasOpenSlot  = lineup.some(c => c === null);

  return (
    <DndProvider backend={HTML5Backend}>
      <CustomDragLayer />
      <div style={{
        height:        '100vh',
        display:       'flex',
        flexDirection: 'column',
        background:    '#363636',
        color:         '#e8e8e8',
        fontFamily:   "'Space Mono', monospace",
        overflow:      'hidden',
      }}>

        {/* ── TOP BAR ───────────────────────────────────────────────────── */}
        <div style={{
          height:         54,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '0 28px',
          borderBottom:   '1px solid #4a4a4a',
          background:     '#2e2e2e',
          flexShrink:      0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 11, letterSpacing: 4, color: '#e8e8e8' }}>CARD DRAFT</span>
            <div style={{ width: 1, height: 14, background: '#555555' }} />
            <span style={{ fontSize: 7, color: '#999999', letterSpacing: 3 }}>BASKETBALL</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {[
              { label: 'LINEUP', value: `${lineupFilled} / 5` },
              { label: 'HAND',   value: hand.length },
              { label: 'PACKS',  value: packsLeft   },
            ].map((item, i, arr) => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 7, color: '#999999', letterSpacing: 2, marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 10, color: '#cccccc', letterSpacing: 1 }}>{item.value}</div>
                </div>
                {i < arr.length - 1 && <div style={{ width: 1, height: 24, background: '#444444' }} />}
              </div>
            ))}
          </div>

          <div style={{ fontSize: 7, color: '#666666', letterSpacing: 2 }}>
            STARTING LINEUP
          </div>
        </div>

        {/* ── BODY (sidebar + main) ─────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Sidebar */}
          <Sidebar activeView={activeView} onNavigate={setActiveView} />

          {/* Main content */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

            {/* ── COLLECTION VIEW ─────────────────────────────────────── */}
            <AnimatePresence mode="wait">
              {activeView === 'collection' && (
                <motion.div
                  key="collection-view"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0  }}
                  exit={{    opacity: 0, x: 16 }}
                  transition={VIEW_SPRING}
                  style={{ position: 'absolute', inset: 0, zIndex: 5 }}
                >
                  <CollectionPage
                    cards={[
                      ...hand,
                      ...(lineup.filter(Boolean) as Card[]),
                    ]}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── MAIN AREA (Lineup) ───────────────────────────────────── */}
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
              <AnimatePresence mode="wait">

                {/* ── Lineup view ──────────────────────────────────────── */}
                {!selectedCard && activeView === 'lineup' && (
                  <motion.div
                    key="lineup-view"
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1   }}
                    exit={{    opacity: 0, scale: 0.97 }}
                    transition={VIEW_SPRING}
                    style={{
                      position:       'absolute',
                      inset:           0,
                      display:        'flex',
                      alignItems:     'center',
                      padding:        '16px 28px 12px',
                      gap:             0,
                    }}
                  >
                    {/* Formation — fills left 2/3 of the space */}
                    <div style={{
                      flex:           2,
                      display:       'flex',
                      flexDirection: 'column',
                      alignItems:    'center',
                      justifyContent:'center',
                      height:        '100%',
                      gap:            12,
                    }}>
                      <span style={{
                        fontSize: 9, fontFamily: 'monospace', color: '#aaaaaa',
                        letterSpacing: 4, textTransform: 'uppercase',
                      }}>
                        Starting Lineup
                      </span>
                      <LineupArea
                        lineup={lineup}
                        slotTokens={slotTokens}
                        onDrop={handleDropToSlot}
                        onRemove={handleRemoveFromLineup}
                        onTokenDrop={handleDropTokenToSlot}
                        onTokenRemove={handleTokenRemoveFromSlot}
                        onCardClick={(card) => setSelectedCard({ card, source: 'lineup' })}
                      />
                      <AnimatePresence>
                        {showDragHint && (
                          <motion.div
                            key="hint"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ delay: 0.3 }}
                            style={{
                              fontSize: 8, fontFamily: 'monospace',
                              color: '#888888', letterSpacing: 3, textAlign: 'center',
                            }}
                          >
                            DRAG CARDS FROM HAND INTO LINEUP SLOTS
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Divider */}
                    <div style={{
                      width:          1,
                      alignSelf:     'stretch',
                      background:    '#3a3a3a',
                      margin:        '24px 0',
                      flexShrink:     0,
                    }} />

                    {/* Quick actions — fills right 1/3 */}
                    <div style={{
                      flex:           1,
                      display:       'flex',
                      alignItems:    'center',
                      justifyContent:'center',
                      height:        '100%',
                      maxWidth:       320,
                    }}>
                      <QuickActions
                        lineup={lineup}
                        packsLeft={packsLeft}
                        handCount={hand.length}
                        onOpenPack={handleOpenPackButton}
                        onClearLineup={() => {
                          const cards = lineup.filter(Boolean) as Card[];
                          // Return all slot tokens to tray
                          const activeTokens = slotTokens.filter(Boolean) as Token[];
                          setLineup([null, null, null, null, null]);
                          setHand(prev => [...prev, ...cards]);
                          setSlotTokens([null, null, null, null, null]);
                          if (activeTokens.length > 0) setTokens(prev => [...prev, ...activeTokens]);
                        }}
                        onSubmit={handleSubmitLineup}
                      />
                    </div>
                  </motion.div>
                )}

                {/* ── Detail view ───────────────────────────────────────── */}
                {selectedCard && (
                  <motion.div
                    key={`detail-${selectedCard.card.id}`}
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1   }}
                    exit={{    opacity: 0, scale: 0.97 }}
                    transition={VIEW_SPRING}
                    style={{
                      position: 'absolute',
                      inset:     0,
                      padding:  '24px 28px 16px',
                      display:  'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <CardDetailView
                      card={selectedCard.card}
                      source={selectedCard.source}
                      onBack={() => setSelectedCard(null)}
                      onAddToLineup={
                        selectedCard.source === 'hand' && hasOpenSlot
                          ? handleAddToLineup
                          : undefined
                      }
                      onSendToBench={
                        selectedCard.source === 'lineup'
                          ? handleSendToBench
                          : undefined
                      }
                      onQuicksell={handleQuicksell}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── CARD HAND & TOKEN TRAY ───────────────────────────────── */}
            {activeView !== 'collection' && (
              <>
                <TokenTray
                  tokens={tokens}
                  onReturnToTray={handleReturnTokenToTray}
                />
                <CardHand
                  cards={hand}
                  onCardClick={(card) => setSelectedCard({ card, source: 'hand' })}
                  onReturnToHand={handleReturnToHand}
                />
              </>
            )}
          </div>
        </div>

        {/* ── OVERLAYS ──────────────────────────────────────────────────── */}
        <AnimatePresence>
          {isCarouselOpen && (
            <PackCarousel
              packCount={packsLeft + 1}
              onSelect={handleSelectPack}
              onClose={() => setIsCarouselOpen(false)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isOpenerOpen && currentPack.length > 0 && (
            <PackOpener
              cards={currentPack}
              onCollect={handleCollect}
            />
          )}
        </AnimatePresence>

        {/* Submit flash overlay */}
        <AnimatePresence>
          {submitFlash && (
            <motion.div
              key="submit-flash"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{    opacity: 0 }}
              style={{
                position:       'fixed',
                inset:           0,
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                pointerEvents:  'none',
                zIndex:          999,
              }}
            >
              <motion.div
                initial={{ scale: 0.88, opacity: 0 }}
                animate={{ scale: 1,    opacity: 1 }}
                exit={{    scale: 1.06, opacity: 0 }}
                style={{
                  padding:      '20px 40px',
                  background:   '#2a2a2a',
                  border:       '1px solid #555555',
                  borderRadius:  10,
                  fontSize:      12,
                  fontFamily:   'monospace',
                  color:        '#e8e8e8',
                  letterSpacing: 4,
                }}
              >
                LINEUP LOCKED IN
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DndProvider>
  );
}