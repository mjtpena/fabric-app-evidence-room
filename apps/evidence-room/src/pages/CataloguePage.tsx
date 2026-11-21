/**
 * Home: the card catalogue. Lenses re-colour the card tops (keys 1–4), view as auditor, coordinator or owner dims
 * what that seat is not waiting on (V), Today opens the drawer behind each item, L switches to the list of the
 * same requests.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarClock, Flag, Keyboard, Library, RotateCcw, Search, UserRound, X } from 'lucide-react';

import { formatDate, useAsync, useNow, usePolling } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import {
  Button,
  Dialog,
  EmptyState,
  FilterSelect,
  IconButton,
  Input,
  Kbd,
  Legend,
  LensBar,
  LinkButton,
  Spinner,
  StageMessage,
  StagePage,
  Table,
  TableWrap,
  Td,
  Th,
  TodayPanel,
  Toolbar,
  Tr,
  ViewAsSwitch,
  ViewToggle,
  useHotkeys,
  useIsDesktop,
  type LegendItem,
  type LensOption,
  type StageView,
  type TodayItem,
} from '@x10/shared/ui';

import { CatalogueScene } from '../catalogue/CatalogueScene';
import { AgeMark, PriorityMark, StatusMark, lensSwatch } from '../components/marks';
import {
  BUCKET_LABEL,
  BUCKET_ORDER,
  STATUS_LABEL,
  STATUS_ORDER,
  allCards,
  buildCatalogue,
  groupOf,
  lensGroups,
  todayFor,
  type CardView,
  type Catalogue,
  type Lens,
  type ViewAs,
} from '../domain/catalogue';
import { loadRoom } from '../domain/room';
import { actorFor, compareRefs, partyOf, pctOf, type Bucket } from '../domain/rules';
import type { Schema, Status } from '../model';

const LENS_LABEL: Record<Lens, string> = { status: 'Status', ageing: 'Ageing', owner: 'Owner', priority: 'Priority' };

const LENSES: LensOption<Lens>[] = [
  { value: 'status', label: 'Status', swatch: lensSwatch(['open', 'in_progress', 'query', 'submitted', 'accepted']), description: 'Open, in progress, query, submitted, accepted' },
  { value: 'ageing', label: 'Ageing', swatch: lensSwatch(['not_due', 'late_1_7', 'late_8_14', 'late_15']), description: 'Not due, then 1–7, 8–14 and 15+ days late' },
  { value: 'owner', label: 'Owner', icon: <UserRound />, description: 'Who provides the evidence' },
  { value: 'priority', label: 'Priority', icon: <Flag />, description: 'High or normal' },
];

const PREFS_KEY = 'x10:evidence-room:catalogue';

function readPrefs(): { lens?: Lens; view?: StageView } {
  try {
    return JSON.parse(sessionStorage.getItem(PREFS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function legendFor(cat: Catalogue, lens: Lens): LegendItem[] {
  const cards = allCards(cat);
  const groups = lensGroups(cat, lens);
  const items: LegendItem[] = groups
    .map((g) => ({
      label: g.label,
      color: g.tone === 'none' ? 'var(--lens-none)' : `var(--lens-${g.tone})`,
      shape: 'square' as const,
      value: cards.filter((c) => groupOf(c, lens, groups).key === g.key).length,
    }))
    .filter((i) => i.value > 0);
  items.push({ label: 'Red tab: overdue', color: 'var(--tab-red)', shape: 'square' }, { label: 'Clip: open query', color: 'var(--clip-2)', shape: 'ring' });
  return items;
}

export function CataloguePage() {
  const { store, me } = useApp<Schema>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const state = useAsync(() => loadRoom(store), [store]);
  usePolling(state.reload, 5000);
  const now = useNow(60_000);
  const desktop = useIsDesktop();

  const prefs = useMemo(readPrefs, []);
  const [lens, setLens] = useState<Lens>(prefs.lens ?? 'status');
  const [view, setView] = useState<StageView>(prefs.view ?? 'stage');
  const [viewAs, setViewAs] = useState<ViewAs>('all');
  const [area, setArea] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [q, setQ] = useState('');
  const findRef = useRef<HTMLInputElement>(null);
  const viewAsSet = useRef(false);

  const room = state.data;
  const cat = useMemo(() => (room ? buildCatalogue(room, now) : null), [room, now]);
  const actor = useMemo(() => (room ? actorFor(me, room.members) : null), [room, me]);

  useEffect(() => {
    try {
      sessionStorage.setItem(PREFS_KEY, JSON.stringify({ lens, view }));
    } catch {
      /* storage blocked: preferences are a convenience */
    }
  }, [lens, view]);

  // Start in the viewer's own seat once we know it.
  useEffect(() => {
    if (!actor || viewAsSet.current) return;
    viewAsSet.current = true;
    const p = partyOf(actor);
    // Coordinators watch everything; auditors and owners start in their own seat.
    setViewAs(p === 'viewer' || p === 'coordinator' ? 'all' : p);
  }, [actor]);

  // Deep link: /?card=REV-03 (and &fresh=1 after a change) opens the drawer and lifts the card.
  useEffect(() => {
    if (!cat) return;
    const ref = params.get('card');
    const code = params.get('area');
    if (!ref && !code) return;
    const card = ref ? allCards(cat).find((c) => c.ref.toUpperCase() === ref.toUpperCase()) : null;
    const drawer = card ? cat.drawers.find((d) => d.area.id === card.areaId) : cat.drawers.find((d) => d.area.code.toUpperCase() === code?.toUpperCase());
    if (drawer) {
      setView('stage');
      setArea(drawer.area.id);
      setFocus(card?.id ?? null);
      if (card && params.get('fresh')) setFresh(card.id);
    }
    setParams({}, { replace: true });
  }, [cat, params, setParams]);

  useEffect(() => {
    if (!fresh) return;
    const t = setTimeout(() => setFresh(null), 2400);
    return () => clearTimeout(t);
  }, [fresh]);

  const drawer = cat?.drawers.find((d) => d.area.id === area) ?? null;
  const focused = drawer?.cards.find((c) => c.id === focus) ?? null;

  const todayEntries = useMemo(() => (cat ? todayFor(cat, viewAs, me.sub, now) : []), [cat, viewAs, me.sub, now]);
  const today: TodayItem[] = todayEntries.map((t) => ({ id: t.id, title: t.title, severity: t.severity, value: t.value, unit: t.unit, lens: LENS_LABEL[t.lens], meta: t.meta }));

  const openArea = (id: string, cardId: string | null = null) => {
    setArea(id);
    setFocus(cardId);
  };
  const close = () => {
    setFocus(null);
    setArea(null);
  };
  const stepDrawer = (dir: 1 | -1) => {
    if (!cat?.drawers.length) return;
    const i = area ? cat.drawers.findIndex((d) => d.area.id === area) : dir === 1 ? -1 : 0;
    const next = cat.drawers[(i + dir + cat.drawers.length) % cat.drawers.length];
    openArea(next.area.id);
  };
  const stepCard = (dir: 1 | -1) => {
    if (!drawer?.cards.length) return;
    const i = focus ? drawer.cards.findIndex((c) => c.id === focus) : dir === 1 ? -1 : 0;
    setFocus(drawer.cards[(i + dir + drawer.cards.length) % drawer.cards.length].id);
  };
  const find = () => {
    const words = q.trim().toLowerCase();
    if (!words || !cat) return;
    const hit = allCards(cat).find((c) => c.ref.toLowerCase() === words) ?? allCards(cat).find((c) => `${c.ref} ${c.title}`.toLowerCase().includes(words));
    if (hit) {
      setView('stage');
      openArea(hit.areaId, hit.id);
    }
  };

  useHotkeys({
    'shift+?': () => setHelp(true),
    escape: () => (focus ? setFocus(null) : close()),
    arrowright: () => stepDrawer(1),
    arrowleft: () => stepDrawer(-1),
    arrowdown: () => stepCard(1),
    arrowup: () => stepCard(-1),
    o: () => focus && navigate(`/requests/${focus}`),
    '/': () => findRef.current?.focus(),
  });

  const viewAsSwitch = (
    <ViewAsSwitch<ViewAs>
      value={viewAs}
      onChange={setViewAs}
      options={[
        { value: 'all', label: 'All' },
        { value: 'auditor', label: 'Auditor' },
        { value: 'coordinator', label: 'Coordinator' },
        { value: 'owner', label: 'Owner' },
      ]}
    />
  );

  const title = focused ? focused.title : drawer ? drawer.area.name : 'The card catalogue';
  const breadcrumb = drawer
    ? [
        { label: 'Catalogue', onClick: close },
        ...(focused ? [{ label: drawer.area.name, onClick: () => setFocus(null) }, { label: focused.ref }] : [{ label: `${drawer.area.code} drawer` }]),
      ]
    : undefined;
  const meta = !cat ? (
    <span>Opening the drawers…</span>
  ) : focused ? (
    <FocusMeta card={focused} />
  ) : drawer ? (
    <>
      <span>Lead {drawer.area.leadAuditorName}</span>
      <span className="num">
        {drawer.progress.accepted} of {drawer.progress.total} accepted
      </span>
      {drawer.overdue > 0 && <span className="num text-bad-text">{drawer.overdue} late</span>}
      {drawer.queries > 0 && <span className="num">{drawer.queries} open {drawer.queries === 1 ? 'query' : 'queries'}</span>}
    </>
  ) : (
    <>
      <span>{cat.engagement?.name ?? 'No engagement'}</span>
      <span className="num">
        {cat.total} requests · {cat.overall.accepted} of {cat.overall.total} accepted
      </span>
    </>
  );

  const stage =
    state.error && !room ? (
      <StageMessage icon={<RotateCcw />} title="The catalogue did not open" action={<Button onClick={() => void state.reload()}>Retry</Button>}>
        {state.error.message}
      </StageMessage>
    ) : !cat ? (
      <StageMessage icon={<Spinner small />} title="Opening the drawers">
        Reading every request card.
      </StageMessage>
    ) : !cat.engagement || cat.drawers.length === 0 ? (
      <StageMessage icon={<Library />} title="No engagement yet">
        An admin adds the engagement, its audit areas and the people in the room; then auditors write request slips.
      </StageMessage>
    ) : (
      <CatalogueScene
        cat={cat}
        lens={lens}
        viewAs={viewAs}
        me={me.sub}
        openAreaId={area}
        focusId={focus}
        freshId={fresh}
        onOpenArea={openArea}
        onCloseArea={close}
        onFocusCard={setFocus}
        onOpenCard={(id) => navigate(`/requests/${id}`)}
      />
    );

  return (
    <>
      <StagePage
        label="Card catalogue"
        view={view}
        breadcrumb={breadcrumb}
        title={title}
        meta={meta}
        background="var(--room-wall)"
        topRight={
          <>
            <form
              className="relative"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                find();
              }}
            >
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 z-[1] size-4 -translate-y-1/2 text-faint" />
              <label htmlFor="er-find" className="sr-only">
                Find a card
              </label>
              <Input
                ref={findRef}
                id="er-find"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Find a card…"
                list="er-find-list"
                className={view === 'stage' ? 'x-glass w-40 rounded-full! pl-8' : 'w-40 pl-8'}
              />
              <datalist id="er-find-list">
                {cat && allCards(cat).map((c) => <option key={c.id} value={c.ref}>{c.title}</option>)}
              </datalist>
            </form>
            {drawer && view === 'stage' && (
              <Button className="x-glass rounded-full! ring-0" icon={<X />} onClick={close} data-testid="close-drawer">
                Close drawer
              </Button>
            )}
            <IconButton label="Keyboard shortcuts" icon={<Keyboard />} onClick={() => setHelp(true)} variant="ghost" className={view === 'stage' ? 'x-glass rounded-full!' : undefined} />
            <ViewToggle value={view} onChange={setView} glass={view === 'stage'} stageLabel="Catalogue" listLabel="List" stageIcon={<Library />} />
          </>
        }
        lenses={<LensBar lenses={LENSES} value={lens} onChange={setLens} showLabel={false} />}
        legend={cat && desktop && <Legend title={LENS_LABEL[lens]} items={legendFor(cat, lens)} collapsible defaultOpen={false} />}
        bottomRight={desktop ? undefined : viewAsSwitch}
        side={
          <div>
            {desktop && (
              <div className="mb-4 [&_[role=radiogroup]>.x-legend-label]:hidden">
                <div className="x-legend-label mb-1.5 px-1 text-muted">View as</div>
                {viewAsSwitch}
              </div>
            )}
            <TodayPanel
              bare
              items={today}
              date={formatDate(now.toISOString())}
              activeId={todayEntries.find((t) => t.cardId === focus && focus)?.id ?? todayEntries.find((t) => !t.cardId && t.areaId === area && !focus)?.id ?? null}
              empty={viewAs === 'owner' ? 'Nothing of yours needs attention.' : 'Nothing needs attention today.'}
              onSelect={(it) => {
                const t = todayEntries.find((x) => x.id === it.id);
                if (!t) return;
                setLens(t.lens);
                setView('stage');
                openArea(t.areaId, t.cardId);
              }}
            />
          </div>
        }
        sideCount={today.length}
        stage={stage}
        list={cat ? <CatalogueList cat={cat} focus={focus} /> : state.error ? null : <Spinner />}
      />
      <ShortcutSheet open={help} onClose={() => setHelp(false)} />
    </>
  );
}

function FocusMeta({ card }: { card: CardView }) {
  return (
    <>
      <span className="font-mono text-xs font-semibold text-fg">{card.ref}</span>
      <StatusMark status={card.status} />
      {card.overdue ? <span className="num font-medium text-bad-text">{card.daysLate} days late</span> : <span>Due {formatDate(card.dueAt)}</span>}
      <span>{card.ownerName ?? 'No owner yet'}</span>
      <span className="flex w-full flex-wrap gap-2 pt-1.5">
        <LinkButton to={`/requests/${card.id}`} size="sm" variant="primary" data-testid="focus-open">
          Open at the reading desk
        </LinkButton>
      </span>
    </>
  );
}

/* ------------------------------------------------------------------ list view (same data) */

type StatusFilter = Status | 'all' | 'outstanding';
type AgeFilter = Bucket | 'all' | 'late';

function CatalogueList({ cat, focus }: { cat: Catalogue; focus: string | null }) {
  const [areaF, setAreaF] = useState('all');
  const [statusF, setStatusF] = useState<StatusFilter>('all');
  const [ageF, setAgeF] = useState<AgeFilter>('all');
  const [ownerF, setOwnerF] = useState('all');
  const areaName = new Map(cat.drawers.map((d) => [d.area.id, d.area.name]));
  const owners = [...new Map(allCards(cat).filter((c) => c.ownerSub).map((c) => [c.ownerSub!, c.ownerName ?? ''])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const rows = allCards(cat)
    .filter((c) => areaF === 'all' || c.areaId === areaF)
    .filter((c) => statusF === 'all' || (statusF === 'outstanding' ? c.status === 'open' || c.status === 'in_progress' || c.status === 'query' : c.status === statusF))
    .filter((c) => ageF === 'all' || (ageF === 'late' ? c.overdue : c.bucket === ageF))
    .filter((c) => ownerF === 'all' || (ownerF === 'none' ? !c.ownerSub : c.ownerSub === ownerF))
    .sort((a, b) => cat.drawers.findIndex((d) => d.area.id === a.areaId) - cat.drawers.findIndex((d) => d.area.id === b.areaId) || compareRefs(a.ref, b.ref));
  return (
    <>
      <Toolbar>
        <FilterSelect label="Area" value={areaF} onChange={setAreaF} options={[{ value: 'all', label: 'All' }, ...cat.drawers.map((d) => ({ value: d.area.id, label: d.area.name }))]} />
        <FilterSelect<StatusFilter>
          label="Status"
          value={statusF}
          onChange={setStatusF}
          options={[{ value: 'all', label: 'All' }, { value: 'outstanding', label: 'With the client' }, ...STATUS_ORDER.map((s) => ({ value: s as StatusFilter, label: STATUS_LABEL[s] }))]}
        />
        <FilterSelect<AgeFilter>
          label="Ageing"
          value={ageF}
          onChange={setAgeF}
          options={[{ value: 'all', label: 'All' }, { value: 'late', label: 'Overdue' }, ...BUCKET_ORDER.filter((b) => b !== 'settled').map((b) => ({ value: b as AgeFilter, label: BUCKET_LABEL[b] }))]}
        />
        <FilterSelect label="Owner" value={ownerF} onChange={setOwnerF} options={[{ value: 'all', label: 'All' }, ...owners.map(([sub, name]) => ({ value: sub, label: name })), { value: 'none', label: 'No owner yet' }]} />
        <span className="ml-auto text-ui text-muted num" data-testid="list-count">
          {rows.length} of {cat.total}
        </span>
      </Toolbar>
      {rows.length === 0 ? (
        <EmptyState title="No requests match" compact bordered>
          Clear a filter to see more of the catalogue.
        </EmptyState>
      ) : (
        <TableWrap label="Requests">
          <Table data-testid="catalogue-list" density="compact">
            <thead>
              <tr>
                <Th>Ref</Th>
                <Th>Request</Th>
                <Th>Status</Th>
                <Th>Ageing</Th>
                <Th>Owner</Th>
                <Th>Priority</Th>
                <Th numeric>Due</Th>
                <Th numeric>Evidence</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <Tr key={c.id} selected={c.id === focus} data-testid="list-row" data-ref={c.ref} data-status={c.status}>
                  <Td className="font-mono text-xs font-semibold whitespace-nowrap">{c.ref}</Td>
                  <Td>
                    <span className="block min-w-[220px]">
                      <Link to={`/requests/${c.id}`} className="font-medium text-fg">
                        {c.title}
                      </Link>
                      <span className="block text-xs text-muted">{areaName.get(c.areaId)}</span>
                    </span>
                  </Td>
                  <Td>
                    <span className="inline-flex items-center gap-2">
                      <StatusMark status={c.status} />
                      {c.status === 'query' && <span className="text-xs text-muted">clip</span>}
                    </span>
                  </Td>
                  <Td>
                    <AgeMark bucket={c.bucket} daysLate={c.daysLate} />
                  </Td>
                  <Td muted className="whitespace-nowrap">
                    {c.ownerName ?? '—'}
                  </Td>
                  <Td>
                    <PriorityMark priority={c.priority} />
                  </Td>
                  <Td numeric className="whitespace-nowrap">
                    {formatDate(c.dueAt)}
                  </Td>
                  <Td numeric>
                    {c.evidenceCount}
                    {c.round > 1 ? <span className="text-muted"> v{c.round}</span> : null}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-ui text-muted">
        {cat.drawers.map((d) => (
          <span key={d.area.id} className="num">
            <span className="font-mono text-xs font-semibold text-fg">{d.area.code}</span> {pctOf(d.progress)}%
          </span>
        ))}
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ keyboard */

const KEYS: [string[], string][] = [
  [['1', '–', '4'], 'Lens: status, ageing, owner, priority'],
  [['V'], 'View as auditor, coordinator or owner'],
  [['L'], 'Catalogue or list'],
  [['←', '→'], 'Open the previous or next drawer'],
  [['↑', '↓'], 'Lift the previous or next card'],
  [['O'], 'Open the lifted card at the reading desk'],
  [['/'], 'Find a card by ref or title'],
  [['Esc'], 'Put the card back, then close the drawer'],
  [['?'], 'This list'],
];

function ShortcutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts">
      <dl className="m-0 grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-2.5 text-sm">
        {KEYS.map(([keys, what]) => (
          <div key={what} className="contents">
            <dt className="flex items-center gap-1">
              {keys.map((k) => (k === '–' ? <span key={k} className="text-faint">–</span> : <Kbd key={k}>{k}</Kbd>))}
            </dt>
            <dd className="m-0 text-muted">{what}</dd>
          </div>
        ))}
      </dl>
      <p className="mb-0 mt-4 flex items-center gap-2 text-ui text-muted">
        <CalendarClock className="size-4" aria-hidden="true" /> Ageing counts whole days past the due date.
      </p>
    </Dialog>
  );
}
