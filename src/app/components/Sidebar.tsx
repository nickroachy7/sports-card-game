import { useState } from 'react';
import { motion } from 'motion/react';

interface NavItem {
  id:     string;
  icon:   string;
  label:  string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'lineup',     icon: '⬡', label: 'LINEUP'     },
  { id: 'collection', icon: '▦', label: 'COLLECTION'  },
  { id: 'packs',      icon: '▣', label: 'PACK STORE'  },
  { id: 'trades',     icon: '⇄', label: 'TRADES'      },
  { id: 'rankings',   icon: '≡', label: 'RANKINGS'    },
];

const BOTTOM_ITEMS: NavItem[] = [
  { id: 'history',  icon: '◷', label: 'HISTORY'  },
  { id: 'settings', icon: '◎', label: 'SETTINGS' },
];

const COLLAPSED_W = 48;
const EXPANDED_W  = 192;

interface SidebarProps {
  activeView:   string;
  onNavigate:   (id: string) => void;
}

export function Sidebar({ activeView, onNavigate }: SidebarProps) {
  const [hovered,     setHovered]     = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  return (
    <motion.div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      animate={{ width: hovered ? EXPANDED_W : COLLAPSED_W }}
      transition={{ type: 'spring', stiffness: 380, damping: 36, mass: 0.8 }}
      style={{
        height:        '100%',
        background:    '#2e2e2e',
        borderRight:   '1px solid #3e3e3e',
        display:       'flex',
        flexDirection: 'column',
        overflow:      'hidden',
        flexShrink:     0,
        position:      'relative',
        zIndex:         10,
      }}
    >
      {/* Logo mark */}
      <div style={{
        height:         54,
        display:        'flex',
        alignItems:     'center',
        padding:        '0 14px',
        borderBottom:   '1px solid #3e3e3e',
        flexShrink:      0,
        overflow:       'hidden',
      }}>
        <div style={{
          width:          20,
          height:         20,
          borderRadius:    4,
          background:     '#4a4a4a',
          border:         '1px solid #606060',
          flexShrink:      0,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          fontSize:        9,
          color:          '#aaaaaa',
        }}>
          ▪
        </div>
        <motion.span
          animate={{ opacity: hovered ? 1 : 0, x: hovered ? 0 : -6 }}
          transition={{ duration: 0.15, delay: hovered ? 0.06 : 0 }}
          style={{
            fontSize:      8,
            fontFamily:   "'Space Mono', monospace",
            color:        '#888888',
            letterSpacing: 3,
            marginLeft:    12,
            whiteSpace:   'nowrap',
          }}
        >
          MENU
        </motion.span>
      </div>

      {/* Main nav */}
      <div style={{ flex: 1, padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_ITEMS.map(item => (
          <SidebarItem
            key={item.id}
            item={item}
            expanded={hovered}
            active={activeView === item.id}
            isHovered={hoveredItem === item.id}
            onMouseEnter={() => setHoveredItem(item.id)}
            onMouseLeave={() => setHoveredItem(null)}
            onClick={() => onNavigate(item.id)}
          />
        ))}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: '#3e3e3e', margin: '0 12px' }} />

      {/* Bottom nav */}
      <div style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {BOTTOM_ITEMS.map(item => (
          <SidebarItem
            key={item.id}
            item={item}
            expanded={hovered}
            active={activeView === item.id}
            isHovered={hoveredItem === item.id}
            onMouseEnter={() => setHoveredItem(item.id)}
            onMouseLeave={() => setHoveredItem(null)}
            onClick={() => onNavigate(item.id)}
          />
        ))}
      </div>
    </motion.div>
  );
}

// ─── Individual nav item ──────────────────────────────────────────────────────
interface SidebarItemProps {
  item:         NavItem;
  expanded:     boolean;
  active:       boolean;
  isHovered:    boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick:      () => void;
}

function SidebarItem({
  item, expanded, active, isHovered, onMouseEnter, onMouseLeave, onClick,
}: SidebarItemProps) {
  const bg         = active ? '#404040' : isHovered ? '#383838' : 'transparent';
  const iconColor  = active ? '#e8e8e8' : isHovered ? '#cccccc' : '#888888';
  const labelColor = active ? '#e8e8e8' : isHovered ? '#cccccc' : '#999999';

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      style={{
        display:    'flex',
        alignItems: 'center',
        padding:    '9px 14px',
        cursor:     'pointer',
        background:  bg,
        transition: 'background 0.12s',
        position:   'relative',
        overflow:   'hidden',
      }}
    >
      {active && (
        <div style={{
          position:    'absolute',
          left:         0, top: 6, bottom: 6,
          width:        2,
          borderRadius: 1,
          background:  '#cccccc',
        }} />
      )}

      <div style={{
        width:          20,
        height:         20,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        flexShrink:      0,
        fontSize:        13,
        color:           iconColor,
        transition:     'color 0.12s',
      }}>
        {item.icon}
      </div>

      <motion.div
        animate={{ opacity: expanded ? 1 : 0, x: expanded ? 0 : -8 }}
        transition={{ duration: 0.14, delay: expanded ? 0.05 : 0 }}
        style={{
          marginLeft:    12,
          fontSize:       8,
          fontFamily:   "'Space Mono', monospace",
          letterSpacing:  2,
          color:          labelColor,
          whiteSpace:    'nowrap',
          transition:    'color 0.12s',
        }}
      >
        {item.label}
      </motion.div>
    </div>
  );
}