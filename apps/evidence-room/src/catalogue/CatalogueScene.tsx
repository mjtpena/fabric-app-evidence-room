/**
 * The card catalogue (SVG). A wooden cabinet with one drawer per audit area. Every drawer stands a little ajar, so
 * the top of each request card shows above its front, coloured by the lens; overdue cards stick up with a red tab,
 * queried cards wear a paper clip, accepted cards carry a stamp. Each front has a brass label holder, a cup pull
 * and a brass strip filled to the area's progress. Opening a drawer slides it out of its slot into a tray that
 * shows the cards standing in it; picking a card lifts it out so its face can be read.
 * No WebGL: the same scene runs everywhere, and it honours reduced motion.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { formatDate } from '@x10/shared/lib';
import { useIsDesktop, useReducedMotion } from '@x10/shared/ui';

import {
  STATUS_LABEL,
  isDim,
  lensGroups,
  type CardView,
  type Catalogue,
  type DrawerView,
  type Lens,
  type LensGroup,
  type ViewAs,
} from '../domain/catalogue';
import { pctOf } from '../domain/rules';
import { cardFill, fit, grainPaths, initialsOf, wrap } from './paint';

/* ------------------------------------------------------------------ geometry (cabinet units) */

const DW = 260; // drawer slot width
const DH = 178; // slot height: recess with card tops + front
const RECESS = 46;
const FRONT_H = DH - RECESS;
const GAP = 16;
const PAD = 24;
const CROWN = 50;
const TOP_GAP = 18;
const BOTTOM_GAP = 18;
const PLINTH = 34;
const FEET = 16;

interface CabinetLayout {
  cols: number;
  rows: number;
  w: number;
  h: number;
  /** Placement on the stage, in pixels. */
  s: number;
  ox: number;
  oy: number;
}

function cabinetSize(cols: number, rows: number) {
  return {
    w: 2 * PAD + cols * DW + (cols - 1) * GAP,
    h: CROWN + TOP_GAP + rows * DH + (rows - 1) * GAP + BOTTOM_GAP + PLINTH + FEET,
  };
}

type Box = { x: number; y: number; w: number; h: number };

function layoutCabinet(slots: number, free: Box): CabinetLayout {
  let best: CabinetLayout | null = null;
  let bestScore = -1;
  for (let cols = 1; cols <= slots; cols++) {
    const rows = Math.ceil(slots / cols);
    if (cols * rows - slots >= cols) continue; // a whole empty row
    const { w, h } = cabinetSize(cols, rows);
    const s = Math.min(free.w / w, free.h / h, 1.3);
    // Prefer a cabinet without spare drawers: every drawer should hold an area.
    const score = s * (1 - 0.08 * (cols * rows - slots));
    if (score > bestScore + 0.001) {
      best = { cols, rows, w, h, s, ox: 0, oy: 0 };
      bestScore = score;
    }
  }
  const b = best ?? { cols: 1, rows: slots, ...cabinetSize(1, slots), s: 1, ox: 0, oy: 0 };
  b.ox = free.x + (free.w - b.w * b.s) / 2;
  b.oy = free.y + (free.h - b.h * b.s) / 2;
  return b;
}

function slotXY(i: number, cols: number) {
  const col = i % cols;
  const row = Math.floor(i / cols);
  return { x: PAD + col * (DW + GAP), y: CROWN + TOP_GAP + row * (DH + GAP) };
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 960, h: 640 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setSize({ w: Math.max(1, el.clientWidth), h: Math.max(1, el.clientHeight) });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

const MONO = 'var(--mono)';
const SANS = 'var(--font)';
const SERIF = 'var(--serif)';

/* ------------------------------------------------------------------ props */

export interface CatalogueSceneProps {
  cat: Catalogue;
  lens: Lens;
  viewAs: ViewAs;
  me: string;
  openAreaId: string | null;
  focusId: string | null;
  onOpenArea: (areaId: string, cardId?: string | null) => void;
  onCloseArea: () => void;
  onFocusCard: (cardId: string | null) => void;
  onOpenCard: (cardId: string) => void;
  /** A card that just changed (its clip or stamp is animated in). */
  freshId?: string | null;
}

export function CatalogueScene(props: CatalogueSceneProps) {
  const { cat, lens, viewAs, me, openAreaId, focusId, onOpenArea, onCloseArea, onFocusCard, onOpenCard, freshId } = props;
  const desktop = useIsDesktop();
  const reduced = useReducedMotion();
  const [wrapRef, size] = useSize<HTMLDivElement>();
  const groups = useMemo(() => lensGroups(cat, lens), [cat, lens]);

  const insets = desktop ? { t: 104, r: 28, b: 84, l: 28 } : { t: 64, r: 12, b: 14, l: 12 };
  const free: Box = { x: insets.l, y: insets.t, w: Math.max(80, size.w - insets.l - insets.r), h: Math.max(80, size.h - insets.t - insets.b) };
  const slots = cat.drawers.length + 1; // + the engagement plaque
  const L = layoutCabinet(slots, free);
  const compact = L.s < 0.78;

  /* ---------------- open / close choreography */
  const [shown, setShown] = useState<string | null>(openAreaId);
  const [phase, setPhase] = useState<'from' | 'in' | 'out'>(openAreaId ? 'in' : 'from');
  useEffect(() => {
    if (openAreaId) {
      setShown(openAreaId);
      if (reduced) {
        setPhase('in');
        return;
      }
      setPhase('from');
      let r2 = 0;
      const r1 = requestAnimationFrame(() => {
        r2 = requestAnimationFrame(() => setPhase('in'));
      });
      return () => {
        cancelAnimationFrame(r1);
        cancelAnimationFrame(r2);
      };
    }
    if (!shown) return;
    if (reduced) {
      setShown(null);
      return;
    }
    setPhase('out');
    const t = setTimeout(() => setShown(null), 420);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAreaId, reduced]);

  const shownIndex = cat.drawers.findIndex((d) => d.area.id === shown);
  const drawer = shownIndex >= 0 ? cat.drawers[shownIndex] : null;

  /* ---------------- tray geometry (pixels) */
  // On phones the tray may use the whole stage height (the legend hides while a drawer is open).
  const trayFree: Box = desktop ? free : { x: free.x, y: 56, w: free.w, h: size.h - 56 - 8 };
  const tray = drawer ? trayLayout(drawer, trayFree, desktop) : null;
  let fromTransform = 'translate(0px, 0px) scale(1)';
  if (tray && shownIndex >= 0) {
    const sxy = slotXY(shownIndex, L.cols);
    const fx = L.ox + (sxy.x + 5) * L.s;
    const fy = L.oy + (sxy.y + RECESS) * L.s;
    const fw = (DW - 10) * L.s;
    const k = fw / tray.w;
    fromTransform = `translate(${(fx - tray.x * k).toFixed(1)}px, ${(fy - tray.frontY * k).toFixed(1)}px) scale(${k.toFixed(4)})`;
  }
  const trayIn = phase === 'in';

  const floorY = L.oy + L.h * L.s - FEET * L.s * 0.2;

  return (
    <div ref={wrapRef} className="absolute inset-y-0 left-0 w-[calc(100%-var(--side-w,0px))] select-none" data-testid="catalogue">
      <svg
        width={size.w}
        height={size.h}
        viewBox={`0 0 ${size.w} ${size.h}`}
        role="group"
        aria-label={drawer ? `${drawer.area.name} drawer, open` : 'Card catalogue'}
        data-testid="catalogue-svg"
        data-lens={lens}
        data-view-as={viewAs}
        data-open-area={shown ?? ''}
        className="block"
        onClick={(e) => {
          if (e.target === e.currentTarget) openAreaId ? onCloseArea() : onFocusCard(null);
        }}
      >
        <SceneDefs />
        <Room w={size.w} h={size.h} floorY={floorY} cx={L.ox + (L.w * L.s) / 2} />

        <g transform={`translate(${L.ox.toFixed(1)} ${L.oy.toFixed(1)}) scale(${L.s.toFixed(4)})`}>
          <Cabinet L={L} />
          {cat.drawers.map((d, i) => {
            const { x, y } = slotXY(i, L.cols);
            return (
              <ClosedDrawer
                key={d.area.id}
                d={d}
                x={x}
                y={y}
                lens={lens}
                groups={groups}
                viewAs={viewAs}
                me={me}
                compact={compact}
                hidden={d.area.id === shown}
                onOpen={(cardId) => onOpenArea(d.area.id, cardId)}
              />
            );
          })}
          <Plaque cat={cat} {...slotXY(cat.drawers.length, L.cols)} compact={compact} />
          {Array.from({ length: L.cols * L.rows - slots }, (_, k) => {
            const { x, y } = slotXY(slots + k, L.cols);
            return <SpareDrawer key={k} x={x} y={y} />;
          })}
          {/* one light for the whole cabinet: brighter at the crown, falling off toward the plinth */}
          <rect x={-16} y={0} width={L.w + 32} height={L.h} fill="url(#er-cabinet-light)" pointerEvents="none" />
        </g>

        {drawer && tray && (
          <>
            <rect
              className="er-scrim"
              x={0}
              y={0}
              width={size.w}
              height={size.h}
              fill="var(--scrim)"
              opacity={trayIn ? 1 : 0}
              onClick={onCloseArea}
              data-testid="scrim"
            />
            <g
              className="er-tray"
              style={{ transform: trayIn ? 'translate(0px, 0px) scale(1)' : fromTransform, opacity: phase === 'out' ? 0 : 1 }}
              data-testid="tray"
              data-area={drawer.area.name}
            >
              <Tray
                d={drawer}
                t={tray}
                lens={lens}
                groups={groups}
                viewAs={viewAs}
                me={me}
                focusId={focusId}
                freshId={freshId ?? null}
                rise={trayIn || reduced}
                onFocusCard={onFocusCard}
                onOpenCard={onOpenCard}
                desktop={desktop}
              />
            </g>
          </>
        )}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ defs */

function SceneDefs() {
  const grain = useMemo(() => grainPaths(DW, 150, 7, 20), []);
  return (
    <defs>
      <linearGradient id="er-wood" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--wood-1)" />
        <stop offset="1" stopColor="var(--wood-2)" />
      </linearGradient>
      <linearGradient id="er-wood-h" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="var(--wood-3)" />
        <stop offset="0.08" stopColor="var(--wood-2)" />
        <stop offset="0.92" stopColor="var(--wood-2)" />
        <stop offset="1" stopColor="var(--wood-3)" />
      </linearGradient>
      <linearGradient id="er-wood-dark" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--wood-3)" />
        <stop offset="1" stopColor="var(--wood-4)" />
      </linearGradient>
      <linearGradient id="er-recess" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--recess)" />
        <stop offset="1" stopColor="var(--recess-2)" />
      </linearGradient>
      <linearGradient id="er-brass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--brass-1)" />
        <stop offset="0.45" stopColor="var(--brass-2)" />
        <stop offset="1" stopColor="var(--brass-3)" />
      </linearGradient>
      <linearGradient id="er-brass-h" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="var(--brass-3)" />
        <stop offset="0.35" stopColor="var(--brass-2)" />
        <stop offset="0.6" stopColor="var(--brass-1)" />
        <stop offset="1" stopColor="var(--brass-2)" />
      </linearGradient>
      <linearGradient id="er-paper" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--paper)" />
        <stop offset="1" stopColor="var(--paper-2)" />
      </linearGradient>
      <linearGradient id="er-steel" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="var(--clip-1)" />
        <stop offset="1" stopColor="var(--clip-2)" />
      </linearGradient>
      <linearGradient id="er-tray-floor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--recess)" />
        <stop offset="0.35" stopColor="var(--tray-floor-2)" />
        <stop offset="1" stopColor="var(--tray-floor)" />
      </linearGradient>
      <linearGradient id="er-wall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--room-wall-2)" />
        <stop offset="1" stopColor="var(--room-wall)" />
      </linearGradient>
      <linearGradient id="er-floor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--room-floor)" />
        <stop offset="1" stopColor="var(--room-floor-2)" />
      </linearGradient>
      <linearGradient id="er-cabinet-light" x1="0" y1="0" x2="0.25" y2="1">
        <stop offset="0" stopColor="#fff6e0" stopOpacity="0.14" />
        <stop offset="0.45" stopColor="#fff6e0" stopOpacity="0" />
        <stop offset="1" stopColor="#1a0f05" stopOpacity="0.16" />
      </linearGradient>
      <radialGradient id="er-lamp" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="var(--room-light)" />
        <stop offset="1" stopColor="var(--room-light)" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="er-floor-shadow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="var(--room-shadow)" />
        <stop offset="1" stopColor="var(--room-shadow)" stopOpacity="0" />
      </radialGradient>
      <pattern id="er-grain" width={DW} height={150} patternUnits="userSpaceOnUse">
        {grain.map((g, i) => (
          <path key={i} d={g.d} fill="none" stroke="var(--wood-grain)" strokeWidth={g.sw} opacity={g.o} />
        ))}
      </pattern>
      <pattern id="er-hatch" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width={6} height={6} fill="var(--lens-none)" opacity={0.35} />
        <line x1={0} y1={0} x2={0} y2={6} stroke="var(--lens-none)" strokeWidth={3} />
      </pattern>
      <filter id="er-card-shadow" x="-10%" y="-20%" width="120%" height="160%">
        <feDropShadow dx="0" dy="-2" stdDeviation="2.2" floodColor="#1a0f05" floodOpacity="0.32" />
      </filter>
      <filter id="er-lift-shadow" x="-15%" y="-25%" width="130%" height="170%">
        <feDropShadow dx="0" dy="10" stdDeviation="9" floodColor="#1a0f05" floodOpacity="0.38" />
      </filter>
    </defs>
  );
}

/* ------------------------------------------------------------------ room */

function Room({ w, h, floorY, cx }: { w: number; h: number; floorY: number; cx: number }) {
  const panels = Math.ceil(w / 132);
  return (
    <g aria-hidden="true" pointerEvents="none">
      <rect x={0} y={0} width={w} height={h} fill="url(#er-wall)" />
      {Array.from({ length: panels }, (_, i) => (
        <rect key={i} x={i * 132 + 10} y={floorY - 150} width={112} height={128} rx={3} fill="none" stroke="var(--room-panel)" strokeWidth={2} />
      ))}
      <line x1={0} x2={w} y1={floorY - 168} y2={floorY - 168} stroke="var(--room-panel)" strokeWidth={3} />
      <ellipse className="er-lamp" cx={cx} cy={floorY * 0.42} rx={Math.max(320, w * 0.42)} ry={Math.max(260, h * 0.5)} fill="url(#er-lamp)" />
      <rect x={0} y={floorY} width={w} height={Math.max(0, h - floorY)} fill="url(#er-floor)" />
      {Array.from({ length: 6 }, (_, i) => {
        const y = floorY + 8 + i * i * 7;
        return y < h ? <line key={i} x1={0} x2={w} y1={y} y2={y} stroke="var(--room-panel)" strokeWidth={1.5} /> : null;
      })}
    </g>
  );
}

/* ------------------------------------------------------------------ cabinet body */

function Cabinet({ L }: { L: CabinetLayout }) {
  const { w, h } = L;
  const bodyTop = CROWN - 8;
  const bodyBottom = h - PLINTH - FEET;
  return (
    <g aria-hidden="true" pointerEvents="none">
      {/* floor shadow */}
      <ellipse cx={w / 2} cy={h - 2} rx={w * 0.62} ry={26} fill="url(#er-floor-shadow)" />
      {/* carcass */}
      <rect x={0} y={bodyTop} width={w} height={bodyBottom - bodyTop} fill="url(#er-wood-h)" />
      <rect x={0} y={bodyTop} width={w} height={bodyBottom - bodyTop} fill="url(#er-grain)" opacity={0.7} />
      <rect x={PAD - 8} y={CROWN + TOP_GAP - 8} width={w - 2 * PAD + 16} height={bodyBottom - CROWN - TOP_GAP - BOTTOM_GAP + 16} rx={4} fill="none" stroke="var(--wood-4)" strokeOpacity={0.35} strokeWidth={2} />
      <line x1={2} x2={2} y1={bodyTop} y2={bodyBottom} stroke="var(--wood-edge)" strokeOpacity={0.5} strokeWidth={2} />
      {/* crown moulding */}
      <rect x={-16} y={4} width={w + 32} height={20} rx={3} fill="url(#er-wood)" />
      <rect x={-16} y={4} width={w + 32} height={20} rx={3} fill="url(#er-grain)" opacity={0.6} />
      <line x1={-14} x2={w + 14} y1={5.5} y2={5.5} stroke="var(--wood-edge)" strokeWidth={2} strokeOpacity={0.9} />
      <rect x={-8} y={24} width={w + 16} height={10} fill="url(#er-wood-dark)" />
      <rect x={-4} y={34} width={w + 8} height={CROWN - 34} fill="url(#er-wood)" />
      <line x1={-4} x2={w + 4} y1={34.5} y2={34.5} stroke="var(--wood-edge)" strokeOpacity={0.6} />
      {/* plinth and feet */}
      <rect x={-8} y={bodyBottom} width={w + 16} height={PLINTH} rx={2} fill="url(#er-wood)" />
      <rect x={-8} y={bodyBottom} width={w + 16} height={PLINTH} rx={2} fill="url(#er-grain)" opacity={0.6} />
      <line x1={-6} x2={w + 6} y1={bodyBottom + 1.5} y2={bodyBottom + 1.5} stroke="var(--wood-edge)" strokeOpacity={0.8} strokeWidth={2} />
      <rect x={-8} y={bodyBottom + PLINTH - 8} width={w + 16} height={8} fill="url(#er-wood-dark)" />
      {[18, w - 58].map((fx) => (
        <path key={fx} d={`M ${fx} ${bodyBottom + PLINTH} h 40 l -6 ${FEET} h -28 Z`} fill="url(#er-wood-dark)" />
      ))}
    </g>
  );
}

/* ------------------------------------------------------------------ a closed drawer */

function ClosedDrawer({
  d,
  x,
  y,
  lens,
  groups,
  viewAs,
  me,
  compact,
  hidden,
  onOpen,
}: {
  d: DrawerView;
  x: number;
  y: number;
  lens: Lens;
  groups: LensGroup[];
  viewAs: ViewAs;
  me: string;
  compact: boolean;
  hidden: boolean;
  onOpen: (cardId?: string | null) => void;
}) {
  const n = d.cards.length;
  const slotW = (DW - 24) / Math.max(n, 1);
  const tw = Math.max(10, Math.min(46, slotW - 3));
  const label = `${d.area.name} drawer: ${d.progress.accepted} of ${d.progress.total} accepted, ${d.overdue} overdue, ${d.queries} ${d.queries === 1 ? 'query' : 'queries'}. Open the drawer.`;
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(null);
    }
  };
  return (
    <g>
      <rect x={x} y={y} width={DW} height={DH} rx={3} fill="url(#er-recess)" />
      <rect x={x} y={y} width={DW} height={6} fill="#000" opacity={0.25} />
      {!hidden && (
        <g
          className="er-drawer"
          role="button"
          tabIndex={0}
          aria-label={label}
          data-testid="drawer"
          data-area={d.area.name}
          data-code={d.area.code}
          onClick={() => onOpen(null)}
          onKeyDown={key}
        >
          <g className="er-pull-out">
            {d.cards.map((c, i) => {
              const tx = x + 12 + i * slotW + (slotW - tw) / 2;
              let ty = y + 11 + (i % 3) * 1.6;
              if (c.overdue) ty -= 10;
              if (c.status === 'withdrawn') ty += 13;
              const dim = isDim(c, viewAs, me);
              return (
                <g
                  key={c.id}
                  className="er-tab"
                  opacity={dim ? 0.5 : c.status === 'withdrawn' ? 0.65 : 1}
                  data-testid="tab"
                  data-ref={c.ref}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(c.id);
                  }}
                >
                  <rect x={tx} y={ty} width={tw} height={y + RECESS + 2 - ty} rx={2} fill="url(#er-paper)" />
                  <rect className="er-band" x={tx} y={ty} width={tw} height={7.5} rx={2} fill={dim ? 'var(--gray-7)' : c.ownerSub || lens !== 'owner' ? cardFill(c, lens, groups) : 'url(#er-hatch)'} />
                  <rect x={tx} y={ty + 7.5} width={tw} height={1} fill="#000" opacity={0.12} />
                  {c.overdue && <rect x={tx + tw - 9} y={ty - 7} width={8} height={9} rx={1.5} fill="var(--tab-red)" />}
                  {c.status === 'query' && <Clip x={tx + 3} y={ty - 6} scale={0.5} />}
                  {c.status === 'accepted' && (
                    <rect x={tx + tw / 2 - Math.min(8, tw / 2 - 3)} y={ty + 13} width={Math.min(16, tw - 6)} height={7} rx={1.5} fill="none" stroke="var(--stamp-ink)" strokeWidth={1.2} opacity={0.75} transform={`rotate(-12 ${tx + tw / 2} ${ty + 16.5})`} />
                  )}
                </g>
              );
            })}
            <DrawerFront x={x + 5} y={y + RECESS} w={DW - 10} h={FRONT_H - 6} d={d} compact={compact} />
          </g>
          <rect className="er-focus" x={x - 3} y={y - 3} width={DW + 6} height={DH + 6} rx={6} fill="none" stroke="var(--accent-9)" strokeWidth={3} />
        </g>
      )}
    </g>
  );
}

function Clip({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  // A paper clip seen from the front: two nested rounded loops in steel.
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} pointerEvents="none">
      <path
        d="M 6 30 V 6 a 4 4 0 0 1 8 0 V 26 a 2.6 2.6 0 0 1 -5.2 0 V 9"
        fill="none"
        stroke="#3b3f45"
        strokeOpacity={0.35}
        strokeWidth={3.6}
        strokeLinecap="round"
        transform="translate(0.8 1.2)"
      />
      <path d="M 6 30 V 6 a 4 4 0 0 1 8 0 V 26 a 2.6 2.6 0 0 1 -5.2 0 V 9" fill="none" stroke="url(#er-steel)" strokeWidth={2.6} strokeLinecap="round" />
      <path d="M 6 30 V 6 a 4 4 0 0 1 8 0" fill="none" stroke="#fff" strokeOpacity={0.6} strokeWidth={0.8} strokeLinecap="round" />
    </g>
  );
}

/* ------------------------------------------------------------------ drawer front */

function DrawerFront({ x, y, w, h, d, compact, big }: { x: number; y: number; w: number; h: number; d: DrawerView; compact?: boolean; big?: boolean }) {
  const cx = x + w / 2;
  const lw = big ? 190 : compact ? w * 0.74 : Math.min(168, w * 0.66);
  const lh = big ? 50 : compact ? 52 : 46;
  const lx = cx - lw / 2;
  const ly = y + (big ? 11 : 13);
  const pull = big ? { w: 92, y: ly + lh + 11 } : compact ? { w: 58, y: ly + lh + 12 } : { w: 74, y: ly + lh + 13 };
  const stripY = y + h - (big ? 20 : 19);
  const stripX = x + 14;
  const stripW = w - 28;
  const pct = d.progress.ratio;
  const countSize = big ? 13.5 : compact ? 15 : 12;
  // Counts sit beside the pull on the big (open) front, above the strip on the small ones.
  const cy = big ? pull.y + 16 : stripY - 7;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={4} fill="url(#er-wood)" />
      <rect x={x} y={y} width={w} height={h} rx={4} fill="url(#er-grain)" />
      {/* bevel */}
      <path d={`M ${x + 7} ${y + h - 7} V ${y + 7} H ${x + w - 7}`} fill="none" stroke="var(--wood-edge)" strokeOpacity={0.75} strokeWidth={1.6} />
      <path d={`M ${x + w - 7} ${y + 7} V ${y + h - 7} H ${x + 7}`} fill="none" stroke="var(--wood-4)" strokeOpacity={0.45} strokeWidth={1.6} />
      <line x1={x + 3} x2={x + w - 3} y1={y + 1} y2={y + 1} stroke="var(--wood-edge)" strokeWidth={1.4} />
      <rect x={x} y={y + h - 2} width={w} height={2} fill="#000" opacity={0.25} />

      {/* label holder */}
      <rect x={lx} y={ly} width={lw} height={lh} rx={4} fill="url(#er-brass)" />
      <rect x={lx + 0.5} y={ly + 0.5} width={lw - 1} height={lh - 1} rx={3.5} fill="none" stroke="var(--brass-1)" strokeOpacity={0.8} />
      <rect x={lx + 9} y={ly + 4} width={lw - 18} height={lh - 8} rx={1.5} fill="url(#er-paper)" />
      <rect x={lx + 9} y={ly + 4} width={lw - 18} height={2} fill="#000" opacity={0.12} />
      <circle cx={lx + 4.6} cy={ly + lh / 2} r={1.8} fill="var(--brass-3)" />
      <circle cx={lx + lw - 4.6} cy={ly + lh / 2} r={1.8} fill="var(--brass-3)" />
      <text
        x={cx}
        y={ly + (compact ? 25 : 21)}
        textAnchor="middle"
        fill="var(--paper-ink)"
        style={{ fontFamily: MONO, fontSize: compact ? 21 : big ? 17 : 16, fontWeight: 650, letterSpacing: 1.6 }}
      >
        {d.area.code}
      </text>
      <text
        x={cx}
        y={ly + (compact ? 42 : 36.5)}
        textAnchor="middle"
        fill="var(--paper-ink-muted)"
        style={{ fontFamily: SANS, fontSize: compact ? 13 : big ? 12.5 : 11.5, fontWeight: 500 }}
      >
        {fit(d.area.name, lw - 24, compact ? 7.2 : 6.4)}
      </text>

      {/* cup pull */}
      <g>
        <rect x={cx - pull.w / 2 - 6} y={pull.y - 4} width={pull.w + 12} height={7} rx={3.5} fill="url(#er-brass)" />
        <path d={`M ${cx - pull.w / 2} ${pull.y} Q ${cx - pull.w / 2} ${pull.y + 21} ${cx} ${pull.y + 21} Q ${cx + pull.w / 2} ${pull.y + 21} ${cx + pull.w / 2} ${pull.y} Z`} fill="url(#er-brass)" />
        <ellipse cx={cx} cy={pull.y + 2.5} rx={pull.w / 2 - 5} ry={5} fill="var(--recess)" opacity={0.55} />
        <path d={`M ${cx - pull.w / 2 + 6} ${pull.y + 8} Q ${cx - pull.w / 2 + 8} ${pull.y + 18} ${cx} ${pull.y + 18}`} fill="none" stroke="var(--brass-1)" strokeOpacity={0.85} strokeWidth={1.4} />
        <circle cx={cx - pull.w / 2 - 2} cy={pull.y - 0.5} r={1.5} fill="var(--brass-3)" />
        <circle cx={cx + pull.w / 2 + 2} cy={pull.y - 0.5} r={1.5} fill="var(--brass-3)" />
      </g>

      {/* counts */}
      <text x={stripX} y={cy} fill="var(--wood-ink)" style={{ fontFamily: MONO, fontSize: countSize, fontWeight: 600 }}>
        {d.progress.accepted}/{d.progress.total}
        {!compact && (
          <tspan fill="var(--wood-ink-muted)" style={{ fontFamily: SANS, fontSize: countSize - 1.5, fontWeight: 500 }} dx={5}>
            accepted
          </tspan>
        )}
      </text>
      <g>
        {d.queries > 0 && (
          <>
            <Clip x={stripX + stripW - (d.overdue > 0 ? (compact ? 74 : 70) : 18)} y={cy - 15} scale={0.46} />
            <text x={stripX + stripW - (d.overdue > 0 ? (compact ? 64 : 60) : 8)} y={cy} fill="var(--wood-ink)" style={{ fontFamily: MONO, fontSize: countSize, fontWeight: 600 }}>
              {d.queries}
            </text>
          </>
        )}
        {d.overdue > 0 && (
          <>
            <rect x={stripX + stripW - (compact ? 42 : 46)} y={cy - 9} width={8} height={9} rx={1.5} fill="var(--tab-red)" />
            <text x={stripX + stripW} y={cy} textAnchor="end" fill="var(--wood-ink)" style={{ fontFamily: MONO, fontSize: countSize, fontWeight: 600 }}>
              {d.overdue}
              {!compact && (
                <tspan fill="var(--wood-ink-muted)" style={{ fontFamily: SANS, fontSize: countSize - 1.5, fontWeight: 500 }} dx={3}>
                  late
                </tspan>
              )}
            </text>
          </>
        )}
      </g>

      {/* brass progress strip */}
      <rect x={stripX} y={stripY} width={stripW} height={9} rx={4.5} fill="var(--groove)" />
      <rect x={stripX} y={stripY} width={stripW} height={3} rx={1.5} fill="#000" opacity={0.3} />
      <rect className="er-strip-fill" x={stripX + 1} y={stripY + 1} width={Math.max(0, (stripW - 2) * pct)} height={7} rx={3.5} fill="url(#er-brass-h)" data-testid="strip" data-pct={pctOf(d.progress)} />
      {pct > 0 && <rect x={stripX + 3} y={stripY + 1.6} width={Math.max(0, (stripW - 2) * pct - 4)} height={1.4} rx={0.7} fill="var(--brass-1)" opacity={0.85} />}
      {[0.25, 0.5, 0.75].map((t) => (
        <line key={t} x1={stripX + stripW * t} x2={stripX + stripW * t} y1={stripY + 1} y2={stripY + 8} stroke="var(--wood-ink)" strokeOpacity={0.25} />
      ))}
    </g>
  );
}

function SpareDrawer({ x, y }: { x: number; y: number }) {
  return (
    <g aria-hidden="true" opacity={0.75}>
      <rect x={x} y={y} width={DW} height={DH} rx={3} fill="url(#er-recess)" />
      <rect x={x + 5} y={y + RECESS - 8} width={DW - 10} height={FRONT_H + 2} rx={4} fill="url(#er-wood)" />
      <rect x={x + 5} y={y + RECESS - 8} width={DW - 10} height={FRONT_H + 2} rx={4} fill="url(#er-grain)" />
      <rect x={x + DW / 2 - 50} y={y + RECESS + 6} width={100} height={36} rx={4} fill="url(#er-brass)" opacity={0.85} />
      <rect x={x + DW / 2 - 42} y={y + RECESS + 10} width={84} height={28} rx={1.5} fill="url(#er-paper)" opacity={0.8} />
    </g>
  );
}

/* ------------------------------------------------------------------ engagement plaque */

function Plaque({ cat, x, y, compact }: { cat: Catalogue; x: number; y: number; compact: boolean }) {
  const e = cat.engagement;
  const outstanding = cat.buckets.not_due + cat.buckets.late_1_7 + cat.buckets.late_8_14 + cat.buckets.late_15;
  const late = outstanding - cat.buckets.not_due;
  const pct = cat.overall.ratio;
  const px = x + 10;
  const py = y + 12;
  const pw = DW - 20;
  const ph = DH - 24;
  return (
    <g data-testid="plaque" aria-label={`${e?.name ?? 'Engagement'}: ${cat.overall.accepted} of ${cat.overall.total} accepted, ${outstanding} outstanding, ${late} late.`} role="img">
      <rect x={x} y={y} width={DW} height={DH} rx={3} fill="url(#er-wood-dark)" />
      <rect x={px} y={py} width={pw} height={ph} rx={5} fill="url(#er-brass)" />
      <rect x={px + 4} y={py + 4} width={pw - 8} height={ph - 8} rx={3} fill="none" stroke="var(--brass-3)" strokeOpacity={0.6} />
      <rect x={px + 1} y={py + 1} width={pw - 2} height={ph - 2} rx={4.5} fill="none" stroke="var(--brass-1)" strokeOpacity={0.8} />
      {[px + 9, px + pw - 9].map((cx) => [py + 9, py + ph - 9].map((cy) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={2} fill="var(--brass-3)" />))}
      <text x={x + DW / 2} y={py + (compact ? 30 : 27)} textAnchor="middle" fill="var(--brass-ink)" style={{ fontFamily: SERIF, fontSize: compact ? 22 : 19 }}>
        {fit(e?.name ?? 'No engagement', pw - 24, compact ? 10 : 8.6)}
      </text>
      {!compact && (
        <text x={x + DW / 2} y={py + 44} textAnchor="middle" fill="var(--brass-ink)" opacity={0.78} style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 1.2 }}>
          PERIOD END {e ? formatDate(e.periodEnd).toUpperCase() : '—'}
        </text>
      )}
      <text x={x + DW / 2} y={py + (compact ? 78 : 86)} textAnchor="middle" fill="var(--brass-ink)" style={{ fontFamily: MONO, fontSize: compact ? 34 : 30, fontWeight: 650, letterSpacing: -0.5 }}>
        {Math.round(pct * 100)}%
      </text>
      <text x={x + DW / 2} y={py + (compact ? 98 : 103)} textAnchor="middle" fill="var(--brass-ink)" opacity={0.85} style={{ fontFamily: SANS, fontSize: compact ? 13 : 11.5, fontWeight: 500 }}>
        {cat.overall.accepted} of {cat.overall.total} accepted
      </text>
      <rect x={px + 18} y={py + ph - 30} width={pw - 36} height={8} rx={4} fill="var(--groove)" opacity={0.85} />
      <rect x={px + 19} y={py + ph - 29} width={Math.max(0, (pw - 38) * pct)} height={6} rx={3} fill="var(--brass-1)" />
      {!compact && (
        <text x={x + DW / 2} y={py + ph - 11} textAnchor="middle" fill="var(--brass-ink)" opacity={0.8} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 0.4 }}>
          {outstanding} OUTSTANDING · {late} LATE
        </text>
      )}
    </g>
  );
}

/* ------------------------------------------------------------------ the open drawer (pixels) */

interface TrayLayout {
  x: number;
  w: number;
  cx: number;
  top: number;
  step: number;
  lift: number;
  cardH: number;
  frontY: number;
  frontH: number;
  backW: number;
  frontW: number;
}

function trayLayout(d: DrawerView, free: Box, desktop: boolean): TrayLayout {
  const n = Math.max(1, d.cards.length);
  const w = Math.min(free.w, desktop ? 760 : 520);
  const frontH = desktop ? 120 : 116;
  const lift = desktop ? 104 : 88;
  // A picked card is read by tilting the cards in front of it forward (they sink behind the front panel); only the
  // front cards have to rise instead, so a little room is kept above the back card for them.
  const reserve = Math.max(0, lift - (n - 1) * 30);
  const margin = 16;
  const step = Math.max(desktop ? 28 : 24, Math.min(desktop ? 36 : 32, (free.h - frontH - reserve - margin - 8) / n));
  const total = reserve + margin + n * step + frontH;
  // Anchored to the bottom of the stage, as if the drawer were pulled out toward you.
  const top = free.y + Math.max(0, free.h - total) + reserve;
  const frontY = top + margin + n * step;
  return {
    x: free.x + (free.w - w) / 2,
    w,
    cx: free.x + free.w / 2,
    top,
    step,
    lift,
    cardH: step + lift + 26,
    frontY,
    frontH,
    backW: w * 0.82,
    frontW: w * 0.93,
  };
}

function Tray({
  d,
  t,
  lens,
  groups,
  viewAs,
  me,
  focusId,
  freshId,
  rise,
  onFocusCard,
  onOpenCard,
  desktop,
}: {
  d: DrawerView;
  t: TrayLayout;
  lens: Lens;
  groups: LensGroup[];
  viewAs: ViewAs;
  me: string;
  focusId: string | null;
  freshId: string | null;
  rise: boolean;
  onFocusCard: (id: string | null) => void;
  onOpenCard: (id: string) => void;
  desktop: boolean;
}) {
  const n = d.cards.length;
  const backY = t.top - 4;
  const bl = t.cx - t.backW / 2 - 10;
  const br = t.cx + t.backW / 2 + 10;
  const fl = t.x;
  const fr = t.x + t.w;
  return (
    <g>
      {/* tray walls and floor */}
      <path d={`M ${bl} ${backY} L ${br} ${backY} L ${fr} ${t.frontY + 8} L ${fl} ${t.frontY + 8} Z`} fill="url(#er-tray-floor)" />
      <path d={`M ${bl - 8} ${backY - 5} L ${bl} ${backY} L ${fl} ${t.frontY + 8} L ${fl - 12} ${t.frontY + 3} Z`} fill="url(#er-wood)" />
      <path d={`M ${bl - 8} ${backY - 5} L ${bl} ${backY} L ${fl} ${t.frontY + 8} L ${fl - 12} ${t.frontY + 3} Z`} fill="url(#er-grain)" />
      <path d={`M ${br + 8} ${backY - 5} L ${br} ${backY} L ${fr} ${t.frontY + 8} L ${fr + 12} ${t.frontY + 3} Z`} fill="url(#er-wood-dark)" />
      <rect x={bl - 12} y={backY - 12} width={br - bl + 24} height={9} rx={2} fill="url(#er-wood)" />
      <line x1={bl - 10} x2={br + 10} y1={backY - 11} y2={backY - 11} stroke="var(--wood-edge)" strokeWidth={1.5} />
      {/* the rod the cards hang on */}
      <line x1={t.cx} x2={t.cx} y1={backY + 4} y2={t.frontY} stroke="var(--brass-2)" strokeWidth={3} opacity={0.5} />

      {n === 0 && (
        <text x={t.cx} y={(backY + t.frontY) / 2} textAnchor="middle" fill="var(--wood-ink)" style={{ fontFamily: SANS, fontSize: 14 }}>
          No requests in this drawer yet.
        </text>
      )}

      <clipPath id="er-tray-clip">
        <rect x={t.x - 40} y={-4000} width={t.w + 80} height={t.frontY + t.frontH - 4 + 4000} />
      </clipPath>
      <g clipPath="url(#er-tray-clip)">
      {d.cards.map((c, k) => {
        // Reading a card: the cards in front tilt forward by up to t.lift (as far as the front panel allows), and the
        // picked card rises by whatever is left.
        const fi = d.cards.findIndex((x) => x.id === focusId);
        const yi = t.top + 14 + fi * t.step;
        const down = fi < 0 ? 0 : Math.max(0, Math.min(t.lift, t.frontY - 6 - yi - t.step));
        const shift = fi < 0 ? 0 : k === fi ? -(t.lift - down) : k > fi ? down : 0;
        const tt = n > 1 ? k / (n - 1) : 1;
        const cw = t.backW + (t.frontW - t.backW) * tt - 24;
        const x = t.cx - cw / 2;
        const y = t.top + 14 + k * t.step;
        return (
          <TrayCard
            key={c.id}
            c={c}
            x={x}
            y={y}
            w={cw}
            t={t}
            fill={c.ownerSub || lens !== 'owner' ? cardFill(c, lens, groups) : 'url(#er-hatch)'}
            dim={isDim(c, viewAs, me)}
            focused={c.id === focusId}
            shift={shift}
            fresh={c.id === freshId}
            rise={rise}
            delay={k * 22}
            shadowed={!!d.cards[k + 1]?.overdue}
            onFocus={() => onFocusCard(c.id === focusId ? null : c.id)}
            onOpen={() => onOpenCard(c.id)}
            desktop={desktop}
          />
        );
      })}
      </g>

      <DrawerFront x={t.x} y={t.frontY} w={t.w} h={t.frontH} d={d} big />
    </g>
  );
}

function TrayCard({
  c,
  shift,
  shadowed,
  x,
  y,
  w,
  t,
  fill,
  dim,
  focused,
  fresh,
  rise,
  delay,
  onFocus,
  onOpen,
  desktop,
}: {
  c: CardView;
  x: number;
  y: number;
  w: number;
  t: TrayLayout;
  fill: string;
  dim: boolean;
  focused: boolean;
  /** Vertical offset while a card is being read (negative rises, positive tilts forward). */
  shift: number;
  fresh: boolean;
  rise: boolean;
  delay: number;
  onFocus: () => void;
  onOpen: () => void;
  desktop: boolean;
  /** The card in front is overdue: its red tab covers our right end. */
  shadowed: boolean;
}) {
  const sunk = c.status === 'withdrawn' ? 12 : 0;
  const raised = c.overdue ? -10 : 0;
  const due = c.status === 'accepted' || c.status === 'withdrawn' || c.status === 'submitted' ? null : c.overdue ? `${c.daysLate}d late` : `due ${c.daysToDue}d`;
  // Phones keep the strip short: the due date, or the status once it is with the auditor or closed.
  const stamped = c.status === 'accepted';
  const right = stamped ? '' : desktop ? `${STATUS_LABEL[c.status]}${due ? ' · ' : ''}` : due ? '' : STATUS_LABEL[c.status];
  // Keep the right-hand text clear of a red tab standing up from the card in front.
  const rightX = shadowed ? w - 82 : w - 12;
  const stampX = (shadowed ? w - 82 : w - 12) - 50;
  const rightW = (stamped ? 104 : (right.length + (due?.length ?? 0)) * 6.3 + 16) + (w - rightX);
  const refW = c.ref.length * 7.2 + 10;
  const titleMax = w - 2 - refW - rightW;
  const perLine = Math.floor((w - 28) / 6.7);
  const label = `${c.ref} ${c.title}. ${STATUS_LABEL[c.status]}${c.overdue ? `, ${c.daysLate} days late` : ''}. Owner ${c.ownerName ?? 'not assigned'}.${focused ? ' Press Enter to open it at the reading desk.' : ''}`;
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (focused) onOpen();
      else onFocus();
    } else if (e.key === ' ') {
      e.preventDefault();
      onFocus();
    }
  };
  const ruleTop = 30;
  // Unlifted cards are only as tall as their visible strip, so the hit area matches what you see.
  const bodyH = focused ? t.cardH : t.step + 8;
  return (
    <g
      className="er-card"
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={focused}
      data-testid="card"
      data-ref={c.ref}
      data-status={c.status}
      data-overdue={c.overdue}
      data-clip={c.status === 'query'}
      data-stamped={c.status === 'accepted'}
      data-focused={focused}
      data-dim={dim}
      onClick={(e) => {
        e.stopPropagation();
        onFocus();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      onKeyDown={key}
      opacity={dim && !focused ? 0.34 : c.status === 'withdrawn' ? 0.62 : 1}
    >
      <g className="er-card-rise" style={{ transform: rise ? 'translateY(0px)' : 'translateY(26px)', opacity: rise ? 1 : 0, transitionDelay: `${delay}ms` }}>
        <g className="er-card-lift" style={{ transform: `translateY(${shift}px)` }}>
          <g className="er-card-hover">
            <g transform={`translate(${x} ${y + raised + sunk})`}>
              <rect width={w} height={bodyH} rx={3} fill="url(#er-paper)" stroke="var(--paper-edge)" strokeWidth={0.6} filter={focused ? 'url(#er-lift-shadow)' : 'url(#er-card-shadow)'} />
              <path className="er-band" d={`M 0 6 V 3 Q 0 0 3 0 H ${w - 3} Q ${w} 0 ${w} 3 V 6 Z`} fill={fill} />
              {/* index card rules */}
              <line x1={0} x2={w} y1={ruleTop} y2={ruleTop} stroke="var(--paper-red)" strokeWidth={1.2} />
              {Array.from({ length: Math.floor((bodyH - ruleTop - 8) / 18) }, (_, i) => (
                <line key={i} x1={0} x2={w} y1={ruleTop + 18 * (i + 1)} y2={ruleTop + 18 * (i + 1)} stroke="var(--paper-rule)" strokeWidth={1} />
              ))}
              <text x={12} y={21} fill="var(--paper-ink)" style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 650, letterSpacing: 0.3 }}>
                {c.ref}
              </text>
              <text x={12 + refW} y={21} fill="var(--paper-ink)" style={{ fontFamily: SANS, fontSize: desktop ? 13 : 12.5, fontWeight: 500 }}>
                {fit(c.title, titleMax, desktop ? 6.6 : 6.4)}
              </text>
              {c.status === 'withdrawn' && <line x1={12 + refW} x2={12 + refW + Math.min(titleMax, c.title.length * 6.6)} y1={17} y2={17} stroke="var(--paper-ink)" strokeWidth={1} />}
              <text x={rightX} y={21} textAnchor="end" fill="var(--paper-ink-muted)" style={{ fontFamily: MONO, fontSize: 10.5 }}>
                {right}
                {due && (
                  <tspan fill={c.overdue ? 'var(--tab-red)' : 'var(--paper-ink-muted)'} style={{ fontWeight: c.overdue ? 650 : 400 }}>
                    {due}
                  </tspan>
                )}
              </text>

              {focused && <CardFace c={c} top={ruleTop} perLine={perLine} />}

              {c.overdue && (
                <g>
                  <rect x={w - 70} y={-13} width={52} height={15} rx={2} fill="var(--tab-red)" />
                  <text x={w - 44} y={-2.5} textAnchor="middle" fill="#fff" style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 650 }}>
                    {c.daysLate}D LATE
                  </text>
                </g>
              )}
              {c.status === 'query' && (
                <g className={fresh ? 'er-clip-in' : undefined}>
                  <Clip x={-9} y={-14} scale={0.95} />
                </g>
              )}
              {c.status === 'accepted' && (
                <g className={fresh ? 'er-stamp-in' : undefined} transform={fresh ? undefined : `rotate(-8 ${stampX} 15)`} opacity={0.82}>
                  <rect x={stampX - 44} y={6} width={88} height={19} rx={3} fill="none" stroke="var(--stamp-ink)" strokeWidth={2} />
                  <text x={stampX} y={19.5} textAnchor="middle" fill="var(--stamp-ink)" style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: 2.2 }}>
                    ACCEPTED
                  </text>
                </g>
              )}
              <rect className="er-focus" x={-3} y={-3} width={w + 6} height={t.step + 6} rx={5} fill="none" stroke="var(--accent-9)" strokeWidth={2.5} />
            </g>
          </g>
        </g>
      </g>
    </g>
  );
}

function CardFace({ c, top, perLine }: { c: CardView; top: number; perLine: number }) {
  const lines = wrap(c.request.detail || c.title, perLine, 2);
  const owner = c.ownerName ?? 'No owner yet';
  const status =
    c.status === 'query'
      ? 'Query open: waiting for the client'
      : c.status === 'submitted'
        ? `With the auditor since ${formatDate(c.submittedAt)}`
        : c.status === 'accepted'
          ? `Accepted ${formatDate(c.acceptedAt)}`
          : c.status === 'withdrawn'
            ? 'Withdrawn'
            : c.overdue
              ? `${c.daysLate} days past due`
              : `Due in ${c.daysToDue} ${c.daysToDue === 1 ? 'day' : 'days'}`;
  const row = (i: number) => top + 13 + i * 18;
  return (
    <g data-testid="card-face">
      {lines.map((l, i) => (
        <text key={i} x={12} y={row(i)} fill="var(--paper-ink)" style={{ fontFamily: SANS, fontSize: 12.5 }}>
          {l}
        </text>
      ))}
      <g transform={`translate(12 ${row(2) + 1})`}>
        <circle cx={8} cy={-4} r={8.5} fill="var(--paper-2)" stroke="var(--paper-edge)" />
        <text x={8} y={-1} textAnchor="middle" fill="var(--paper-ink)" style={{ fontFamily: MONO, fontSize: 8, fontWeight: 650 }}>
          {initialsOf(c.ownerName)}
        </text>
        <text x={22} y={0} fill="var(--paper-ink-muted)" style={{ fontFamily: SANS, fontSize: 11.5 }}>
          {fit(`${owner} · due ${formatDate(c.dueAt)} · ${c.evidenceCount} evidence${c.round > 1 ? ` (v${c.round})` : ''}`, perLine * 6.7 - 24, 6.1)}
        </text>
      </g>
      <text x={12} y={row(3) + 2} fill={c.overdue ? 'var(--tab-red)' : 'var(--paper-ink)'} style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 600 }}>
        {status}
      </text>
    </g>
  );
}
