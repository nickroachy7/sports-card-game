import { useState } from 'react';
import { motion } from 'motion/react';
import {
  Scale, UserPlus, UserMinus,
  Star, TrendingDown, Lock,
  BarChart3, ArrowLeft,
} from 'lucide-react';
import { Card, Position, Rarity, RARITY_COLOR } from '../types';
import { CardFront } from './CardFront';

// ─── lookup tables ─────────────────────────────────────────────────────────────

const POS_FULL: Record<Position, string> = {
  PG: 'Point Guard',
  SG: 'Shooting Guard',
  SF: 'Small Forward',
  PF: 'Power Forward',
  C:  'Center',
};

const STAT_FULL: Record<string, string> = {
  SPD: 'Speed',
  AST: 'Assist',
  STL: 'Steal',
  SCR: 'Scoring',
  DEF: 'Defense',
  REB: 'Rebound',
  BLK: 'Block',
  STR: 'Strength',
};

const RARITY_FLAVOR: Record<Rarity, string> = {
  legendary: 'A generational talent and franchise cornerstone. Building your lineup around this card puts you in championship contention.',
  epic:      'Elite performer capable of taking over any matchup. A must-start in any competitive fantasy roster.',
  rare:      'High-ceiling starter who elevates everyone around them. A reliable pick for any draft position.',
  common:    'A dependable contributor with proven strengths. Every championship roster needs quality depth.',
};

interface RoleInfo { title: string; desc: string }
const ROLE_MAP: Record<string, RoleInfo> = {
  AST: { title: 'Floor General',      desc: 'Primary ball-handler and offensive orchestrator' },
  SCR: { title: 'Pure Scorer',        desc: 'Elite offensive weapon and shot creator' },
  REB: { title: 'Glass Cleaner',      desc: 'Controls the boards on both ends of the floor' },
  DEF: { title: 'Lockdown Defender',  desc: "Shuts down the opposing team's top scorer" },
  SPD: { title: 'Speedster',          desc: 'Creates mismatches with elite-level athleticism' },
  BLK: { title: 'Rim Protector',      desc: 'Anchors the defense and alters shots in the paint' },
  STL: { title: 'Ball Hawk',          desc: 'Forces turnovers and sparks fast-break offense' },
  STR: { title: 'Post Enforcer',      desc: 'Physical low-post presence who commands the paint' },
};

function getRole(card: Card): RoleInfo {
  const top = card.stats.reduce((a, b) => (a.value > b.value ? a : b));
  return ROLE_MAP[top.label] ?? { title: 'All-Around', desc: 'Versatile and well-rounded contributor' };
}

function getAcquiredDate(card: Card): string {
  const ts = parseInt(card.id.split('-')[1]);
  const d = isNaN(ts) ? new Date() : new Date(ts);
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

// ─── ActionButton ─────────────────────────────────────────────────────────────

interface ActionButtonProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Icon: React.ComponentType<any>;
  title: string;
  subtitle: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'normal' | 'danger';
}

function ActionButton({ Icon, title, subtitle, onClick, disabled = false, variant = 'normal' }: ActionButtonProps) {
  const [hovered, setHovered] = useState(false);
  const active = hovered && !disabled;

  const titleColor = variant === 'danger'
    ? (active ? '#e07070' : '#a05050')
    : disabled ? '#404040' : active ? '#e8e8e8' : '#cccccc';
  const subColor   = disabled ? '#444444' : active ? '#999999' : '#666666';
  const iconColor  = variant === 'danger'
    ? (active ? '#e07070' : '#784040')
    : disabled ? '#363636' : active ? '#aaaaaa' : '#585858';
  const boxBorder  = active ? '#555' : '#2c2c2c';

  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:           14,
        width:        '100%',
        padding:      '10px 18px',
        background:    active ? '#272727' : 'transparent',
        border:       'none',
        borderRadius:  6,
        cursor:        disabled ? 'default' : 'pointer',
        textAlign:    'left',
        transition:   'background 0.1s',
      }}
    >
      <div style={{
        width:          42,
        height:         42,
        border:         `1px solid ${boxBorder}`,
        borderRadius:    8,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        background:     '#181818',
        flexShrink:      0,
        transition:     'border-color 0.12s',
      }}>
        <Icon size={16} color={iconColor} strokeWidth={1.6} />
      </div>
      <div>
        <div style={{
          fontSize:      10,
          fontFamily:   "'Space Mono', monospace",
          color:         titleColor,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          marginBottom:   3,
          transition:    'color 0.1s',
        }}>
          {title}
        </div>
        <div style={{
          fontSize:      7,
          fontFamily:   "'Space Mono', monospace",
          color:         subColor,
          letterSpacing: 0.3,
          transition:   'color 0.1s',
        }}>
          {subtitle}
        </div>
      </div>
    </button>
  );
}

// ─── StatBar ───────────────────────────────────────────────────────────────────

function StatBar({ label, value, color, delay }: { label: string; value: number; color: string; delay: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{
        width: 64, fontSize: 7, fontFamily: "'Space Mono', monospace",
        color: '#999999', letterSpacing: 1.5, textTransform: 'uppercase', flexShrink: 0,
      }}>
        {STAT_FULL[label] ?? label}
      </span>
      <div style={{ flex: 1, height: 3, background: '#2e2e2e', borderRadius: 2, overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ type: 'spring', stiffness: 150, damping: 22, delay }}
          style={{ height: '100%', background: color, borderRadius: 2 }}
        />
      </div>
      <span style={{
        width: 26, fontSize: 10, fontFamily: "'Space Mono', monospace",
        color: '#cccccc', textAlign: 'right', flexShrink: 0,
      }}>
        {value}
      </span>
    </div>
  );
}

// ─── InfoPair ──────────────────────────────────────────────────────────────────

function InfoPair({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: 7, fontFamily: "'Space Mono', monospace", color: '#999999', letterSpacing: 2, marginBottom: 5, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 10, fontFamily: "'Space Mono', monospace", color: accent ?? '#cccccc', letterSpacing: 0.5 }}>
        {value}
      </div>
    </div>
  );
}

// ─── CardDetailView ────────────────────────────────────────────────────────────

export interface CardDetailViewProps {
  card:            Card;
  source:          'hand' | 'lineup';
  onBack:          () => void;
  onAddToLineup?:  () => void;
  onSendToBench?:  () => void;
  onQuicksell?:    () => void;
}

// Scale factor for the card display — visually larger than "pack" size
const CARD_SCALE = 1.28;
const BASE_W     = 144;
const BASE_H     = 202;
const SCALED_W   = Math.round(BASE_W * CARD_SCALE);
const SCALED_H   = Math.round(BASE_H * CARD_SCALE);

export function CardDetailView({
  card,
  source,
  onBack,
  onAddToLineup,
  onSendToBench,
  onQuicksell,
}: CardDetailViewProps) {
  const rarityColor  = RARITY_COLOR[card.rarity];
  const role         = getRole(card);
  const acquiredDate = getAcquiredDate(card);

  return (
    <div style={{
      width:         '100%',
      flex:           1,
      display:       'flex',
      flexDirection: 'column',
      gap:            14,
      minHeight:      0,
    }}>

      {/* ── Back button + player header ──────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0 }}>
        <motion.button
          whileHover={{ x: -2 }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          onClick={onBack}
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:           7,
            background:   'transparent',
            border:       '1px solid #3a3a3a',
            color:        '#888888',
            fontFamily:  "'Space Mono', monospace",
            fontSize:     7,
            letterSpacing: 2,
            textTransform: 'uppercase',
            cursor:       'pointer',
            borderRadius:  6,
            padding:      '7px 14px',
            transition:   'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = '#666';
            e.currentTarget.style.color = '#ccc';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = '#3a3a3a';
            e.currentTarget.style.color = '#888888';
          }}
        >
          <ArrowLeft size={10} strokeWidth={2} />
          Back to Lineup
        </motion.button>

        <div style={{ width: 1, height: 20, background: '#3a3a3a' }} />

        <div>
          <span style={{
            fontSize:      15,
            fontFamily:   "'Space Mono', monospace",
            color:        '#e8e8e8',
            letterSpacing: 2,
            textTransform: 'uppercase',
            marginRight:   12,
          }}>
            {card.playerName}
          </span>
          <span style={{ fontSize: 7, fontFamily: "'Space Mono', monospace", color: '#666666', letterSpacing: 2 }}>
            #{card.rating} {card.position}
          </span>
          <span style={{ fontSize: 7, fontFamily: "'Space Mono', monospace", color: '#3a3a3a', margin: '0 8px' }}>·</span>
          <span style={{
            fontSize:  7, fontFamily: "'Space Mono', monospace",
            color:     rarityColor, letterSpacing: 2, textTransform: 'uppercase',
          }}>
            {card.rarity}
          </span>
        </div>
      </div>

      {/* ── Main panel: 3 columns ─────────────────────────────────────────── */}
      <div style={{
        flex:         1,
        display:      'flex',
        background:   'transparent',
        overflow:     'hidden',
        minHeight:     0,
      }}>

        {/* ── Col 1 · Card ──────────────────────────────────────────────── */}
        <div style={{
          flexShrink:     0,
          width:           SCALED_W + 52,
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          gap:             18,
          borderRight:    '1px solid #272727',
          padding:        '28px 24px',
        }}>
          {/* Card with scale effect */}
          <motion.div
            initial={{ rotateY: -24, opacity: 0, scale: 0.9 }}
            animate={{ rotateY: 0,   opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24, delay: 0.04 }}
            style={{ perspective: '700px' }}
          >
            <div style={{
              position:     'relative',
              width:         SCALED_W,
              height:        SCALED_H,
              flexShrink:    0,
            }}>
              <div style={{
                position:        'absolute',
                top:              0,
                left:             0,
                width:            BASE_W,
                height:           BASE_H,
                transformOrigin: 'top left',
                transform:       `scale(${CARD_SCALE})`,
                borderRadius:     10,
                overflow:        'hidden',
                boxShadow:       `0 8px 24px rgba(0,0,0,0.35), 0 0 0 1.5px ${rarityColor}55`,
              }}>
                <CardFront card={card} size="pack" />
              </div>
            </div>
          </motion.div>

          {/* OVR badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: rarityColor, boxShadow: `0 0 7px ${rarityColor}99`,
            }} />
            <span style={{ fontSize: 26, fontFamily: "'Space Mono', monospace", color: '#e8e8e8', lineHeight: 1 }}>
              {card.rating}
            </span>
            <span style={{
              fontSize: 7, fontFamily: "'Space Mono', monospace", color: '#999999',
              letterSpacing: 2, alignSelf: 'flex-end', paddingBottom: 3,
            }}>
              OVR
            </span>
          </div>
        </div>

        {/* ── Col 2 · Actions ───────────────────────────────────────────── */}
        <div style={{
          flexShrink:    0,
          width:          270,
          borderRight:   '1px solid #272727',
          display:       'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap:            2,
          padding:       '18px 6px',
        }}>
          <ActionButton
            Icon={Scale}
            title="Compare"
            subtitle="Compare against your current lineup"
            disabled
          />

          {source === 'hand' ? (
            <ActionButton
              Icon={UserPlus}
              title="Add to Lineup"
              subtitle={onAddToLineup ? 'Move to first open lineup slot' : 'No open lineup slots'}
              onClick={onAddToLineup}
              disabled={!onAddToLineup}
            />
          ) : (
            <ActionButton
              Icon={UserMinus}
              title="Send to Bench"
              subtitle="Return this card to your hand"
              onClick={onSendToBench}
            />
          )}

          <ActionButton
            Icon={Star}
            title="Set as Captain"
            subtitle="Earns 1.5× fantasy points this week"
            disabled
          />

          <ActionButton
            Icon={BarChart3}
            title="View Full Stats"
            subtitle="Detailed season stat breakdown"
            disabled
          />

          <ActionButton
            Icon={TrendingDown}
            title="Quicksell"
            subtitle="Permanently remove from roster"
            onClick={onQuicksell}
            variant="danger"
          />

          <ActionButton
            Icon={Lock}
            title="Lock Card"
            subtitle="Prevent accidental actions"
            disabled
          />
        </div>

        {/* ── Col 3 · Info ──────────────────────────────────────────────── */}
        <div style={{
          flex:          1,
          display:       'flex',
          flexDirection: 'column',
          gap:            0,
          overflow:      'auto',
          scrollbarWidth: 'none',
        }}>

          {/* Details section */}
          <div style={{ padding: '22px 24px 20px', borderBottom: '1px solid #2e2e2e' }}>
            <div style={{
              fontSize: 7, fontFamily: "'Space Mono', monospace", color: '#999999',
              letterSpacing: 3, textTransform: 'uppercase', marginBottom: 16,
            }}>
              Details
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              rowGap: 16, columnGap: 12,
            }}>
              <InfoPair label="Team"     value={card.team} />
              <InfoPair label="Position" value={POS_FULL[card.position]} />
              <InfoPair label="Rarity"   value={card.rarity.toUpperCase()} accent={rarityColor} />
              <InfoPair label="Overall"  value={`${card.rating} OVR`} />
              <InfoPair label="Acquired" value={acquiredDate} />
              <InfoPair label="Source"   value="Pack Opening" />
            </div>
          </div>

          {/* Stats section */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #2e2e2e' }}>
            <div style={{
              fontSize: 7, fontFamily: "'Space Mono', monospace", color: '#999999',
              letterSpacing: 3, textTransform: 'uppercase', marginBottom: 16,
            }}>
              Attributes
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {card.stats.map((stat, i) => (
                <StatBar
                  key={stat.label}
                  label={stat.label}
                  value={stat.value}
                  color={rarityColor}
                  delay={0.08 + i * 0.07}
                />
              ))}
            </div>
          </div>

          {/* Description section */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #2e2e2e' }}>
            <div style={{
              fontSize: 7, fontFamily: "'Space Mono', monospace", color: '#999999',
              letterSpacing: 3, textTransform: 'uppercase', marginBottom: 12,
            }}>
              Description
            </div>
            <div style={{
              fontSize: 8, fontFamily: "'Space Mono', monospace", color: '#888888',
              letterSpacing: 0.3, lineHeight: 1.8,
            }}>
              {RARITY_FLAVOR[card.rarity]}
            </div>
          </div>

          {/* Archetype section */}
          <div style={{ padding: '20px 24px' }}>
            <div style={{
              fontSize: 7, fontFamily: "'Space Mono', monospace", color: '#999999',
              letterSpacing: 3, textTransform: 'uppercase', marginBottom: 14,
            }}>
              Archetype
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 9,
                border: `1.5px solid ${rarityColor}44`,
                background: `${rarityColor}0d`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <span style={{
                  fontSize: 11, fontFamily: "'Space Mono', monospace",
                  color: rarityColor, letterSpacing: 0.5,
                }}>
                  {card.position}
                </span>
              </div>
              <div>
                <div style={{
                  fontSize: 8, fontFamily: "'Space Mono', monospace",
                  color: rarityColor, letterSpacing: 1.5,
                  textTransform: 'uppercase', marginBottom: 4,
                }}>
                  {role.title}
                </div>
                <div style={{ fontSize: 7, fontFamily: "'Space Mono', monospace", color: '#888888', letterSpacing: 0.4 }}>
                  {role.desc}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}