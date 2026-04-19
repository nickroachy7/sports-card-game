import { useState, useEffect, useCallback, useRef } from 'react';
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { CardBack } from './CardBack';

// ─── constants ────────────────────────────────────────────────────────────────
const PACK_W    = 148;
const PACK_H    = 208;
const RADIUS    = 268;    // carousel ring radius (px)
const PERSP     = 920;    // CSS perspective (px)
const DRAG_SENS = 0.55;   // degrees of rotation per dragged pixel
const MOMENTUM  = 160;    // ms of velocity to project on release for "flick" feel
const SPRING    = { stiffness: 280, damping: 30, mass: 1.05 } as const;

// ─── types ────────────────────────────────────────────────────────────────────
interface PackCarouselProps {
  packCount: number;
  onSelect: () => void;
  onClose:  () => void;
}

interface PackItemProps {
  index:          number;
  n:              number;
  springRotation: MotionValue<number>;
  isFront:        boolean;
  grabbing:       boolean;
  onClick:        () => void;
}

// ─── CarouselPackItem ─────────────────────────────────────────────────────────
function CarouselPackItem({ index, n, springRotation, isFront, grabbing, onClick }: PackItemProps) {
  const packAngle = (360 / n) * index;

  // Opacity follows the spring in real-time — bright at front, dim at back
  const opacity = useTransform(springRotation, (rot) => {
    const a  = ((packAngle + rot) % 360 + 360) % 360;
    const ea = a > 180 ? a - 360 : a;
    const c  = Math.cos(ea * (Math.PI / 180));
    return 0.14 + 0.86 * (c * 0.5 + 0.5);
  });

  return (
    <div
      style={{
        position:      'absolute',
        left:          -PACK_W / 2,
        top:           -PACK_H / 2,
        width:          PACK_W,
        height:         PACK_H,
        transform:     `rotateY(${packAngle}deg) translateZ(${RADIUS}px)`,
        willChange:    'transform',
        pointerEvents:  grabbing ? 'none' : 'auto',
        cursor:         grabbing ? 'grabbing' : 'pointer',
      }}
    >
      <motion.div
        style={{ width: '100%', height: '100%', opacity }}
        onClick={onClick}
        whileHover={!grabbing && isFront ? { y: -10 } : undefined}
        transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      >
        {/* Pack shell */}
        <div style={{
          position:     'relative',
          width:        '100%',
          height:       '100%',
          borderRadius:  12,
          overflow:     'hidden',
          boxShadow: isFront
            ? '0 28px 72px rgba(0,0,0,0.95), 0 0 0 1px rgba(255,255,255,0.10)'
            : '0 12px 36px rgba(0,0,0,0.7)',
        }}>
          <CardBack showHint={false} />

          {/* Pack label */}
          <div style={{
            position:       'absolute',
            inset:           0,
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'center',
            pointerEvents:  'none',
          }}>
            <div style={{ fontSize: 8,  letterSpacing: 3, color: '#666', fontFamily: 'monospace' }}>SPORTS</div>
            <div style={{ fontSize: 14, letterSpacing: 4, color: '#888', fontFamily: 'monospace', marginTop: 3 }}>PACK</div>
            <div style={{ width: 28, height: 1, background: '#4a4a4a', margin: '9px auto' }} />
            <div style={{ fontSize: 7,  letterSpacing: 2, color: '#555', fontFamily: 'monospace' }}>5 CARDS</div>
          </div>

          {/* "Click to open" footer — only visible on front pack when not dragging */}
          <motion.div
            animate={{ opacity: isFront && !grabbing ? 1 : 0 }}
            transition={{ duration: 0.18 }}
            style={{
              position:      'absolute',
              bottom: 0, left: 0, right: 0,
              padding:       '14px 0 10px',
              background:    'linear-gradient(transparent, rgba(10,10,10,0.88))',
              textAlign:     'center',
              fontSize:       7,
              color:         '#888',
              fontFamily:    'monospace',
              letterSpacing:  2,
              pointerEvents: 'none',
            }}
          >
            CLICK TO OPEN
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── PackCarousel ─────────────────────────────────────────────────────────────
export function PackCarousel({ packCount, onSelect, onClose }: PackCarouselProps) {
  const n    = Math.max(1, packCount);
  const step = 360 / n;

  const rotMV          = useMotionValue(0);
  const springRotation = useSpring(rotMV, SPRING);

  const [frontIndex, setFrontIndex] = useState(0);
  const [grabbing,   setGrabbing]   = useState(false);

  // Drag tracking refs — never cause re-renders
  const isDragging   = useRef(false);
  const dragMoved    = useRef(false);
  const dragStartX   = useRef(0);
  const dragStartRot = useRef(0);
  const velX         = useRef(0);       // px / ms
  const lastPtrX     = useRef(0);
  const lastPtrTime  = useRef(0);

  // Stable ref so window event handlers never close over stale frontIndex
  const frontRef = useRef(0);
  frontRef.current = frontIndex;

  // ── Rotate to pack i via shortest arc ─────────────────────────────────────
  const rotateTo = useCallback((idx: number) => {
    const normalised = ((idx % n) + n) % n;
    const target = -step * normalised;
    const cur    = rotMV.get();
    let   delta  = ((target - cur) % 360 + 360) % 360;
    if (delta > 180) delta -= 360;
    rotMV.set(cur + delta);
    setFrontIndex(normalised);
  }, [step, n, rotMV]);

  const rotateNext = useCallback(() => rotateTo((frontRef.current + 1) % n), [n, rotateTo]);
  const rotatePrev = useCallback(() => rotateTo((frontRef.current - 1 + n) % n), [n, rotateTo]);

  // ── Pack click — bail if it was actually a swipe ──────────────────────────
  const handlePackClick = useCallback((idx: number) => {
    if (dragMoved.current) return;
    if (idx === frontRef.current) onSelect();
    else rotateTo(idx);
  }, [onSelect, rotateTo]);

  // ── Pointer-down on the 3D scene ──────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== undefined && e.button !== 0) return;
    isDragging.current   = true;
    dragMoved.current    = false;
    dragStartX.current   = e.clientX;
    dragStartRot.current = springRotation.get();
    velX.current         = 0;
    lastPtrX.current     = e.clientX;
    lastPtrTime.current  = performance.now();
    setGrabbing(true);
  }, [springRotation]);

  // ── Window-level move + up (drag survives leaving the element) ────────────
  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - dragStartX.current;
      if (Math.abs(dx) > 4) dragMoved.current = true;

      const now = performance.now();
      const dt  = now - lastPtrTime.current;
      if (dt > 0) velX.current = (e.clientX - lastPtrX.current) / dt;
      lastPtrX.current    = e.clientX;
      lastPtrTime.current = now;

      // .jump() = instant, no spring lag during drag
      springRotation.jump(dragStartRot.current + dx * DRAG_SENS);
    };

    const handleUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      setGrabbing(false);
      if (!dragMoved.current) return; // genuine click — let onClick handle it

      // Project momentum forward, then snap to nearest pack
      const cur       = springRotation.get();
      const projected = cur + velX.current * MOMENTUM * DRAG_SENS;
      const nearStep  = Math.round(-projected / step);
      const snapRot   = -nearStep * step;
      const newIdx    = ((nearStep % n) + n) % n;

      setFrontIndex(newIdx);
      rotMV.set(snapRot);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup',   handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup',   handleUp);
    };
  }, [springRotation, rotMV, step, n]);

  // ── Keyboard navigation ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if      (e.key === 'ArrowRight') rotateNext();
      else if (e.key === 'ArrowLeft')  rotatePrev();
      else if (e.key === 'Enter')      onSelect();
      else if (e.key === 'Escape')     onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [rotateNext, rotatePrev, onSelect, onClose]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position:       'fixed',
        inset:           0,
        background:     'rgba(18, 18, 18, 0.97)',
        backdropFilter: 'blur(14px)',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        zIndex:          100,
        userSelect:     'none',
      }}
    >
      {/* Header */}
      <motion.div
        initial={{ y: -18, opacity: 0 }}
        animate={{ y: 0,   opacity: 1 }}
        transition={{ delay: 0.12, type: 'spring', stiffness: 300, damping: 28 }}
        style={{ marginBottom: 52, textAlign: 'center' }}
      >
        <div style={{ fontSize: 10, letterSpacing: 5, color: '#aaaaaa', fontFamily: 'monospace', marginBottom: 10 }}>
          SELECT A PACK
        </div>
        <div style={{ fontSize: 8, letterSpacing: 2, color: '#555555', fontFamily: 'monospace' }}>
          {n} pack{n !== 1 ? 's' : ''} remaining
          {n > 1 ? '  ·  swipe or use arrows to rotate' : ''}
        </div>
      </motion.div>

      {/* 3D scene */}
      <motion.div
        initial={{ scale: 0.88, opacity: 0 }}
        animate={{ scale: 1,    opacity: 1 }}
        transition={{ delay: 0.18, type: 'spring', stiffness: 280, damping: 26 }}
        onPointerDown={handlePointerDown}
        style={{
          position:          'relative',
          width:             '100%',
          height:             360,
          display:           'flex',
          alignItems:        'center',
          justifyContent:    'center',
          perspective:       `${PERSP}px`,
          perspectiveOrigin: '50% 52%',
          touchAction:       'none',
          cursor:             grabbing ? 'grabbing' : 'grab',
        }}
      >
        {/* Floor glow */}
        <div style={{
          position:      'absolute',
          bottom:         30,
          left:          '50%',
          transform:     'translateX(-50%)',
          width:          RADIUS * 2 + 80,
          height:         60,
          borderRadius:  '50%',
          background:    'radial-gradient(ellipse, rgba(200,200,200,0.05) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Rotating ring */}
        <motion.div
          style={{
            rotateY:        springRotation,
            transformStyle: 'preserve-3d',
            width:           0,
            height:          0,
            position:       'relative',
          }}
        >
          {Array.from({ length: n }).map((_, i) => (
            <CarouselPackItem
              key={i}
              index={i}
              n={n}
              springRotation={springRotation}
              isFront={i === frontIndex}
              grabbing={grabbing}
              onClick={() => handlePackClick(i)}
            />
          ))}
        </motion.div>
      </motion.div>

      {/* Navigation row */}
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0,  opacity: 1 }}
        transition={{ delay: 0.28 }}
        style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 44 }}
      >
        {n > 1 && (
          <motion.button
            whileHover={{ scale: 1.12, borderColor: '#777', color: '#cccccc' }}
            whileTap={{ scale: 0.90 }}
            onClick={rotatePrev}
            style={{
              width: 42, height: 42, borderRadius: '50%',
              border: '1px solid #3a3a3a', background: 'transparent',
              color: '#666', fontSize: 18, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'monospace', transition: 'border-color 0.15s, color 0.15s',
            }}
          >←</motion.button>
        )}

        <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
          {Array.from({ length: n }).map((_, i) => (
            <motion.div
              key={i}
              animate={{ background: i === frontIndex ? '#cccccc' : '#3a3a3a', scale: i === frontIndex ? 1.2 : 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 32 }}
              onClick={() => rotateTo(i)}
              style={{ width: 7, height: 7, borderRadius: '50%', cursor: 'pointer' }}
            />
          ))}
        </div>

        {n > 1 && (
          <motion.button
            whileHover={{ scale: 1.12, borderColor: '#777', color: '#cccccc' }}
            whileTap={{ scale: 0.90 }}
            onClick={rotateNext}
            style={{
              width: 42, height: 42, borderRadius: '50%',
              border: '1px solid #3a3a3a', background: 'transparent',
              color: '#666', fontSize: 18, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'monospace', transition: 'border-color 0.15s, color 0.15s',
            }}
          >→</motion.button>
        )}
      </motion.div>

      {/* Open CTA */}
      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.38 }}
        whileHover={{ scale: 1.04, background: '#ffffff' }}
        whileTap={{ scale: 0.97 }}
        onClick={onSelect}
        style={{
          marginTop: 24, padding: '12px 44px',
          background: '#f0f0f0', border: 'none', borderRadius: 6,
          color: '#1a1a1a', fontFamily: 'monospace', fontSize: 11,
          letterSpacing: 3, cursor: 'pointer',
          boxShadow: '0 4px 24px rgba(240,240,240,0.10)',
          transition: 'background 0.12s',
        }}
      >
        OPEN PACK
      </motion.button>

      {/* Close */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        onClick={onClose}
        whileHover={{ color: '#aaaaaa' }}
        style={{
          position: 'absolute', top: 22, right: 26,
          background: 'transparent', border: 'none',
          color: '#444444', fontFamily: 'monospace', fontSize: 8,
          letterSpacing: 3, cursor: 'pointer', padding: '6px 10px',
          transition: 'color 0.15s',
        }}
      >
        ESC  ×
      </motion.button>
    </motion.div>
  );
}
