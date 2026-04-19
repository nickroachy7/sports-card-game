import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card, Position, Rarity, RARITY_COLOR } from '../types';
import { CardFront } from './CardFront';

type PositionFilter = 'ALL' | Position;
type RarityFilter   = 'ALL' | Rarity;
type RatingFilter   = 'ALL' | '95+' | '90+' | '85+' | '80+' | '75+';
type SortField      = 'RATING' | 'RARITY' | 'NAME' | 'POSITION';
type SortDir        = 'DESC' | 'ASC';

const RARITY_ORDER: Record<Rarity, number> = { legendary: 4, epic: 3, rare: 2, common: 1 };
const POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
const RARITIES:  Rarity[]   = ['legendary', 'epic', 'rare', 'common'];

const CARD_W = 116;
const CARD_H = 163;

const FONT = "'Space Mono', monospace";

// ─── Filter row ───────────────────────────────────────────────────────────────
// Collapsed row matches QA stat rows (label left, value right).
// Expanded: tight pill buttons inline below — same font scale as QA.
interface FilterRowProps {
  label:    string;
  value:    string;
  options:  string[];
  open:     boolean;
  onToggle: () => void;
  onSelect: (v: string) => void;
  // if true, don't draw the top border (used for very first row)
  noTopBorder?: boolean;
}

function FilterRow({ label, value, options, open, onToggle, onSelect, noTopBorder }: FilterRowProps) {
  // "default" means the filter/sort hasn't been changed from its initial state
  const isDefault =
    value === 'ALL' || value === 'RATING' || value === 'DESCENDING';

  return (
    <div style={{ borderTop: noTopBorder ? 'none' : '1px solid #383838' }}>
      {/* Collapsed header — same layout as a QA stat row */}
      <div
        onClick={onToggle}
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '8px 0',
          cursor:         'pointer',
          userSelect:     'none',
        }}
      >
        {/* Label — identical to QA "TEAM OVR" label style */}
        <span style={{
          fontSize:      7,
          fontFamily:    FONT,
          letterSpacing:  2,
          color:         '#999999',
          textTransform: 'uppercase',
        }}>
          {label}
        </span>

        {/* Value + chevron */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize:      8,
            fontFamily:    FONT,
            letterSpacing:  1,
            color:         isDefault ? '#666666' : '#cccccc',
            textTransform: 'uppercase',
          }}>
            {value}
          </span>
          <motion.span
            animate={{ rotate: open ? 90 : 0 }}
            transition={{ duration: 0.14 }}
            style={{ fontSize: 6, color: '#555555', display: 'block', lineHeight: 1 }}
          >
            ▶
          </motion.span>
        </div>
      </div>

      {/* Expanded pills */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="opts"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{    height: 0, opacity: 0 }}
            transition={{ duration: 0.16, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, paddingBottom: 10 }}>
              {options.map(opt => {
                const active = value.toUpperCase() === opt.toUpperCase();
                return (
                  <button
                    key={opt}
                    onClick={() => onSelect(opt)}
                    style={{
                      padding:       '3px 8px',
                      fontSize:       7,
                      fontFamily:     FONT,
                      letterSpacing:  1.5,
                      textTransform: 'uppercase',
                      background:    active ? '#484848' : 'transparent',
                      color:         active ? '#e8e8e8' : '#666666',
                      border:        `1px solid ${active ? '#606060' : '#3a3a3a'}`,
                      borderRadius:   3,
                      cursor:        'pointer',
                      transition:    'all 0.1s',
                    }}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
interface CollectionPageProps {
  cards: Card[];
}

export function CollectionPage({ cards }: CollectionPageProps) {
  const [posFilter,    setPosFilter]    = useState<PositionFilter>('ALL');
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>('ALL');
  const [teamFilter,   setTeamFilter]   = useState<string>('ALL');
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('ALL');
  const [sortField,    setSortField]    = useState<SortField>('RATING');
  const [sortDir,      setSortDir]      = useState<SortDir>('DESC');
  const [openFilter,   setOpenFilter]   = useState<string | null>(null);
  const [hovered,      setHovered]      = useState<string | null>(null);

  const teams = useMemo(
    () => ['ALL', ...Array.from(new Set(cards.map(c => c.team))).sort()],
    [cards],
  );

  const filtered = useMemo(() => {
    let r = [...cards];
    if (posFilter    !== 'ALL') r = r.filter(c => c.position === posFilter);
    if (rarityFilter !== 'ALL') r = r.filter(c => c.rarity   === rarityFilter);
    if (teamFilter   !== 'ALL') r = r.filter(c => c.team     === teamFilter);
    if (ratingFilter !== 'ALL') {
      const min = parseInt(ratingFilter);
      r = r.filter(c => c.rating >= min);
    }
    r.sort((a, b) => {
      let d = 0;
      if      (sortField === 'RATING')   d = a.rating - b.rating;
      else if (sortField === 'RARITY')   d = RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity];
      else if (sortField === 'NAME')     d = a.playerName.localeCompare(b.playerName);
      else if (sortField === 'POSITION') d = POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position);
      return sortDir === 'DESC' ? -d : d;
    });
    return r;
  }, [cards, posFilter, rarityFilter, teamFilter, ratingFilter, sortField, sortDir]);

  const toggle = (id: string) => setOpenFilter(prev => prev === id ? null : id);

  const filterDefs = [
    {
      id: 'position', label: 'POSITION', value: posFilter,
      options: ['ALL', ...POSITIONS],
      onSelect: (v: string) => { setPosFilter(v as PositionFilter); setOpenFilter(null); },
    },
    {
      id: 'rarity', label: 'RARITY',
      value: rarityFilter === 'ALL' ? 'ALL' : rarityFilter.toUpperCase(),
      options: ['ALL', ...RARITIES.map(r => r.toUpperCase())],
      onSelect: (v: string) => {
        setRarityFilter(v === 'ALL' ? 'ALL' : v.toLowerCase() as Rarity);
        setOpenFilter(null);
      },
    },
    {
      id: 'team', label: 'TEAM', value: teamFilter,
      options: teams,
      onSelect: (v: string) => { setTeamFilter(v); setOpenFilter(null); },
    },
    {
      id: 'rating', label: 'OVR RATING', value: ratingFilter,
      options: ['ALL', '95+', '90+', '85+', '80+', '75+'],
      onSelect: (v: string) => { setRatingFilter(v as RatingFilter); setOpenFilter(null); },
    },
    {
      id: 'sort', label: 'SORT BY', value: sortField,
      options: ['RATING', 'RARITY', 'NAME', 'POSITION'],
      onSelect: (v: string) => { setSortField(v as SortField); setOpenFilter(null); },
    },
    {
      id: 'order', label: 'ORDER',
      value: sortDir === 'DESC' ? 'DESCENDING' : 'ASCENDING',
      options: ['DESCENDING', 'ASCENDING'],
      onSelect: (v: string) => { setSortDir(v === 'DESCENDING' ? 'DESC' : 'ASC'); setOpenFilter(null); },
    },
  ];

  const hasActiveFilters =
    posFilter !== 'ALL' || rarityFilter !== 'ALL' ||
    teamFilter !== 'ALL' || ratingFilter !== 'ALL';

  // Rarity breakdown counts for display (only non-zero)
  const rarityRows = RARITIES
    .map(r => ({ rarity: r, count: filtered.filter(c => c.rarity === r).length }))
    .filter(row => row.count > 0);

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ── Card grid ─────────────────────────────────────────────── */}
      <div style={{ flex: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {cards.length === 0 ? (
            <div style={{
              height: '100%', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 14,
            }}>
              <div style={{ fontSize: 28, color: '#3a3a3a' }}>▦</div>
              <div style={{ fontSize: 8, fontFamily: 'monospace', color: '#555555', letterSpacing: 3 }}>
                NO CARDS YET
              </div>
              <div style={{ fontSize: 7, fontFamily: 'monospace', color: '#444444', letterSpacing: 2 }}>
                OPEN PACKS TO BUILD YOUR COLLECTION
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{
              height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 8, fontFamily: 'monospace', color: '#555555', letterSpacing: 3 }}>
                NO CARDS MATCH FILTERS
              </span>
            </div>
          ) : (
            <motion.div
              layout
              style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignContent: 'flex-start' }}
            >
              <AnimatePresence mode="popLayout">
                {filtered.map(card => {
                  const isHov = hovered === card.id;
                  return (
                    <motion.div
                      key={card.id}
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{    opacity: 0, scale: 0.85 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                      onMouseEnter={() => setHovered(card.id)}
                      onMouseLeave={() => setHovered(null)}
                      style={{
                        width:        CARD_W,
                        height:       CARD_H,
                        borderRadius: 8,
                        overflow:     'hidden',
                        border:       '1px solid #cccccc',
                        boxShadow:    isHov
                          ? `0 10px 28px rgba(0,0,0,0.6), 0 0 0 1.5px ${RARITY_COLOR[card.rarity]}aa`
                          : `0 3px 12px rgba(0,0,0,0.4), 0 0 0 1px ${RARITY_COLOR[card.rarity]}44`,
                        cursor:       'pointer',
                        flexShrink:    0,
                        transform:    isHov ? 'translateY(-6px) scale(1.04)' : 'none',
                        transition:   'transform 0.15s ease, box-shadow 0.15s ease',
                        position:     'relative',
                      }}
                    >
                      <CardFront card={card} size="lineup" />
                      {isHov && (
                        <div style={{
                          position:      'absolute',
                          inset:          0,
                          background:    `radial-gradient(ellipse at 50% 0%, ${RARITY_COLOR[card.rarity]}18 0%, transparent 65%)`,
                          pointerEvents: 'none',
                        }} />
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </div>

      {/* ── Right panel ───────────────────────────────────────────────
          Mirrors the QuickActions outer + inner container exactly:
          • same borderLeft divider colour
          • same flex: 1 + centre-aligned inner
          • inner: width 100%, maxWidth 260, gap 16, flexDirection column
      ─────────────────────────────────────────────────────────────── */}
      <div style={{
        flex:           1,
        borderLeft:    '1px solid #3e3e3e',
        overflowY:     'auto',
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
      }}>
        {/* Inner — pixel-match to QuickActions inner wrapper */}
        <div style={{
          width:         '100%',
          maxWidth:       260,
          flexShrink:     0,
          padding:       '28px 0',
          display:       'flex',
          flexDirection: 'column',
          gap:            16,
        }}>

          {/* ── Header — mirrors "LINEUP INFO" header exactly ── */}
          <div style={{
            display:        'flex',
            alignItems:     'baseline',
            justifyContent: 'space-between',
            paddingBottom:   10,
            borderBottom:   '1px solid #3e3e3e',
          }}>
            <span style={{ fontSize: 8, fontFamily: FONT, letterSpacing: 3, color: '#999999' }}>
              COLLECTION
            </span>
            <span style={{
              fontSize: 8, fontFamily: FONT, letterSpacing: 1,
              color: filtered.length === cards.length ? '#666666' : '#cccccc',
            }}>
              {filtered.length} / {cards.length}
            </span>
          </div>

          {/* ── Filter rows — all 6, first has no top border ── */}
          <div>
            {filterDefs.map((f, idx) => (
              <FilterRow
                key={f.id}
                label={f.label}
                value={f.value}
                options={f.options}
                open={openFilter === f.id}
                onToggle={() => toggle(f.id)}
                onSelect={f.onSelect}
                noTopBorder={idx === 0}
              />
            ))}
          </div>

          {/* ── Card count — mirrors "TEAM OVR" block exactly ── */}
          <div style={{
            display:        'flex',
            justifyContent: 'space-between',
            alignItems:     'baseline',
            paddingTop:      4,
            borderTop:      '1px solid #383838',
          }}>
            <span style={{ fontSize: 7, fontFamily: FONT, color: '#999999', letterSpacing: 2 }}>
              {hasActiveFilters ? 'SHOWING' : 'TOTAL CARDS'}
            </span>
            <AnimatePresence mode="wait">
              <motion.span
                key={filtered.length}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y:  0 }}
                style={{ fontSize: 20, fontFamily: FONT, color: '#e8e8e8', lineHeight: 1 }}
              >
                {filtered.length}
              </motion.span>
            </AnimatePresence>
          </div>

          {/* ── Rarity breakdown — mirrors per-position rows exactly ── */}
          {rarityRows.length > 0 && (
            <div style={{
              display:       'flex',
              flexDirection: 'column',
              gap:            8,
              paddingTop:     4,
              borderTop:     '1px solid #383838',
            }}>
              {rarityRows.map(({ rarity, count }) => (
                <div
                  key={rarity}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    {/* Dot — same 5×5 circle as QA position indicator */}
                    <div style={{
                      width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                      background: RARITY_COLOR[rarity],
                      border: `1px solid ${RARITY_COLOR[rarity]}80`,
                    }} />
                    <span style={{ fontSize: 7, fontFamily: FONT, color: '#999999', letterSpacing: 1 }}>
                      {rarity.toUpperCase()}
                    </span>
                  </div>
                  <span style={{ fontSize: 8, fontFamily: FONT, color: '#cccccc' }}>
                    {count}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* ── Reset filters ── */}
          <AnimatePresence>
            {hasActiveFilters && (
              <motion.button
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{    opacity: 0, y: 6 }}
                onClick={() => {
                  setPosFilter('ALL'); setRarityFilter('ALL');
                  setTeamFilter('ALL'); setRatingFilter('ALL');
                  setOpenFilter(null);
                }}
                style={{
                  padding:       '9px',
                  width:         '100%',
                  background:    'transparent',
                  color:         '#999999',
                  border:        '1px solid #555555',
                  borderRadius:   6,
                  fontSize:       8,
                  fontFamily:     FONT,
                  letterSpacing:  2,
                  cursor:        'pointer',
                  transition:    'color 0.15s, border-color 0.15s',
                }}
              >
                RESET FILTERS
              </motion.button>
            )}
          </AnimatePresence>

        </div>
      </div>

    </div>
  );
}