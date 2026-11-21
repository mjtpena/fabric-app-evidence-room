/**
 * The card catalogue as data: one drawer per audit area, one card per request, with everything the picture needs
 * (status, overdue, ageing, query clip, acceptance stamp) worked out once. Lenses, view-as dimming and the Today
 * list are pure functions of it. Unit-tested in catalogue.test.ts.
 */
import { DAY, toMs } from '@x10/shared/lib';

import { rules } from '../config';
import type { AuditArea, Engagement, EvidenceRequest, Member, Priority, Status } from '../model';
import type { Room } from './room';
import {
  ageingBucket,
  bucketCounts,
  daysLate,
  daysToDue,
  integrityIssues,
  isOverdue,
  pctOf,
  progressOf,
  type Bucket,
  type Progress,
} from './rules';

export interface CardView {
  id: string;
  ref: string;
  title: string;
  status: Status;
  priority: Priority;
  ownerSub: string | null;
  ownerName: string | null;
  dueAt: string;
  overdue: boolean;
  daysLate: number;
  daysToDue: number;
  bucket: Bucket;
  evidenceCount: number;
  /** Highest evidence version so far (0 with no evidence). */
  round: number;
  /** When the open query was raised (status "query" only). */
  queryAt: string | null;
  submittedAt: string | null;
  acceptedAt: string | null;
  integrity: string[];
  areaId: string;
  request: EvidenceRequest;
}

export interface DrawerView {
  area: AuditArea;
  cards: CardView[];
  progress: Progress;
  overdue: number;
  queries: number;
  submitted: number;
  outstanding: number;
}

export interface Catalogue {
  engagement: Engagement | null;
  drawers: DrawerView[];
  members: Member[];
  overall: Progress;
  buckets: Record<Bucket, number>;
  total: number;
}

export function buildCatalogue(room: Room, now: Date): Catalogue {
  const evByReq = new Map<string, { n: number; round: number }>();
  for (const e of room.evidence) {
    const x = evByReq.get(e.requestId) ?? { n: 0, round: 0 };
    evByReq.set(e.requestId, { n: x.n + 1, round: Math.max(x.round, e.version) });
  }
  const lastQuery = new Map<string, string>();
  for (const t of room.threads) if (t.kind === 'query' && (lastQuery.get(t.requestId) ?? '') < t.at) lastQuery.set(t.requestId, t.at);

  const card = (r: EvidenceRequest): CardView => {
    const ev = evByReq.get(r.id) ?? { n: 0, round: 0 };
    return {
      id: r.id,
      ref: r.ref,
      title: r.title,
      status: r.status,
      priority: r.priority,
      ownerSub: r.ownerSub,
      ownerName: r.ownerName,
      dueAt: r.dueAt,
      overdue: isOverdue(r, now),
      daysLate: daysLate(r, now),
      daysToDue: daysToDue(r, now),
      bucket: ageingBucket(r, now),
      evidenceCount: ev.n,
      round: ev.round,
      queryAt: r.status === 'query' ? (lastQuery.get(r.id) ?? null) : null,
      submittedAt: r.submittedAt,
      acceptedAt: r.acceptedAt,
      integrity: integrityIssues(r, room.members),
      areaId: r.areaId,
      request: r,
    };
  };

  const drawers: DrawerView[] = room.areas.map((area) => {
    const reqs = room.requests.filter((r) => r.areaId === area.id);
    const cards = reqs.map(card);
    return {
      area,
      cards,
      progress: progressOf(reqs),
      overdue: cards.filter((c) => c.overdue).length,
      queries: cards.filter((c) => c.status === 'query').length,
      submitted: cards.filter((c) => c.status === 'submitted').length,
      outstanding: cards.filter((c) => c.status === 'open' || c.status === 'in_progress' || c.status === 'query').length,
    };
  });
  return {
    engagement: room.engagement,
    drawers,
    members: room.members,
    overall: progressOf(room.requests),
    buckets: bucketCounts(room.requests, now),
    total: room.requests.length,
  };
}

export const allCards = (c: Catalogue) => c.drawers.flatMap((d) => d.cards);

/* ------------------------------------------------------------------ lenses */

export type Lens = 'status' | 'ageing' | 'owner' | 'priority';
export const LENSES: Lens[] = ['status', 'ageing', 'owner', 'priority'];

export interface LensGroup {
  key: string;
  label: string;
  /** Colour token: a status key, an ageing key, `c0..c7` for owners, or `none`. */
  tone: string;
}

export const STATUS_ORDER: Status[] = ['open', 'in_progress', 'query', 'submitted', 'accepted', 'withdrawn'];
export const STATUS_LABEL: Record<Status, string> = {
  open: 'Open',
  in_progress: 'In progress',
  submitted: 'Submitted',
  query: 'Query',
  accepted: 'Accepted',
  withdrawn: 'Withdrawn',
};
export const BUCKET_ORDER: Bucket[] = ['late_15', 'late_8_14', 'late_1_7', 'not_due', 'settled'];
export const BUCKET_LABEL: Record<Bucket, string> = {
  not_due: 'Not due',
  late_1_7: `1–${rules.ageing.firstMax} days late`,
  late_8_14: `${rules.ageing.firstMax + 1}–${rules.ageing.secondMax} days late`,
  late_15: `${rules.ageing.secondMax + 1}+ days late`,
  settled: 'With the auditor or closed',
};

/** Owners in name order, so each owner keeps a colour across drawers and lenses. */
export function ownerOrder(cat: Catalogue): { sub: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const c of allCards(cat)) if (c.ownerSub && !seen.has(c.ownerSub)) seen.set(c.ownerSub, c.ownerName ?? 'Owner');
  return [...seen.entries()].map(([sub, name]) => ({ sub, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export function lensGroups(cat: Catalogue, lens: Lens): LensGroup[] {
  switch (lens) {
    case 'status':
      return STATUS_ORDER.map((s) => ({ key: s, label: STATUS_LABEL[s], tone: s }));
    case 'ageing':
      return BUCKET_ORDER.map((b) => ({ key: b, label: BUCKET_LABEL[b], tone: b }));
    case 'priority':
      return [
        { key: 'high', label: 'High', tone: 'high' },
        { key: 'normal', label: 'Normal', tone: 'normal' },
      ];
    case 'owner':
      return [
        ...ownerOrder(cat).map((o, i) => ({ key: o.sub, label: o.name, tone: `c${i % 8}` })),
        { key: 'none', label: 'No owner yet', tone: 'none' },
      ];
  }
}

export function lensKey(card: CardView, lens: Lens): string {
  switch (lens) {
    case 'status':
      return card.status;
    case 'ageing':
      return card.bucket;
    case 'priority':
      return card.priority;
    case 'owner':
      return card.ownerSub ?? 'none';
  }
}

export function groupOf(card: CardView, lens: Lens, groups: LensGroup[]): LensGroup {
  const k = lensKey(card, lens);
  return groups.find((g) => g.key === k) ?? { key: k, label: k, tone: 'none' };
}

/* ------------------------------------------------------------------ view as */

export type ViewAs = 'all' | 'auditor' | 'coordinator' | 'owner';

/** What a perspective is waiting on. Everything else steps back. */
export function isDim(card: CardView, viewAs: ViewAs, me: string): boolean {
  switch (viewAs) {
    case 'all':
      return false;
    case 'auditor':
      return card.status !== 'submitted';
    case 'coordinator':
      return !(card.status === 'open' || card.status === 'in_progress' || card.status === 'query');
    case 'owner':
      return card.ownerSub !== me;
  }
}

/* ------------------------------------------------------------------ today */

export interface TodayEntry {
  id: string;
  title: string;
  severity: 'bad' | 'warn' | 'info' | 'ok' | 'neutral' | 'brand';
  value: string;
  unit: string;
  lens: Lens;
  meta: string;
  areaId: string;
  /** The card to focus, or null to open the drawer only. */
  cardId: string | null;
}

const daysSince = (iso: string | null, now: Date) => (iso ? Math.max(0, Math.floor((now.getTime() - toMs(iso)) / DAY)) : 0);

/**
 * The three to five things that need attention now, ranked for the perspective:
 * overdue high-priority requests, open queries waiting for the client, submissions waiting for the auditor,
 * and the area with the lowest progress.
 */
export function todayFor(cat: Catalogue, viewAs: ViewAs, me: string, now: Date): TodayEntry[] {
  const cards = allCards(cat);
  const areaName = new Map(cat.drawers.map((d) => [d.area.id, d.area.name]));
  const pool = viewAs === 'owner' ? cards.filter((c) => c.ownerSub === me) : cards;

  const overdueHigh = pool
    .filter((c) => c.overdue && (c.priority === 'high' || viewAs === 'owner'))
    .sort((a, b) => b.daysLate - a.daysLate || a.ref.localeCompare(b.ref))
    .map<TodayEntry>((c) => ({
      id: `late-${c.id}`,
      title: `${c.ref} ${c.title} is ${c.daysLate} ${c.daysLate === 1 ? 'day' : 'days'} late`,
      severity: c.daysLate > rules.ageing.firstMax ? 'bad' : 'warn',
      value: String(c.daysLate),
      unit: c.daysLate === 1 ? 'day late' : 'days late',
      lens: 'ageing',
      meta: `${areaName.get(c.areaId) ?? ''}${c.ownerName ? ` · ${c.ownerName}` : ' · no owner'}`,
      areaId: c.areaId,
      cardId: c.id,
    }));

  const queriesAll = pool.filter((c) => c.status === 'query').sort((a, b) => (a.queryAt ?? '').localeCompare(b.queryAt ?? ''));
  const queryEntry = (c: CardView, label: string): TodayEntry => {
    const d = daysSince(c.queryAt, now);
    return {
      id: `query-${c.id}`,
      title: `${label} on ${c.ref} ${c.title} waits for the client`,
      severity: d >= rules.ageing.firstMax ? 'bad' : 'warn',
      value: String(d),
      unit: d === 1 ? 'day open' : 'days open',
      lens: 'status',
      meta: `${areaName.get(c.areaId) ?? ''}${queriesAll.length > 1 ? ` · ${queriesAll.length} open queries` : ''}`,
      areaId: c.areaId,
      cardId: c.id,
    };
  };
  const oldestQuery = queriesAll[0] ? queryEntry(queriesAll[0], 'Query') : null;
  const newest = queriesAll[queriesAll.length - 1];
  const newQuery =
    newest && newest !== queriesAll[0] && daysSince(newest.queryAt, now) < rules.newQueryDays ? queryEntry(newest, 'New query') : null;

  const submitted = pool.filter((c) => c.status === 'submitted').sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''));
  const waiting: TodayEntry | null = submitted[0]
    ? (() => {
        const c = submitted[0];
        const d = daysSince(c.submittedAt, now);
        return {
          id: `submitted-${c.id}`,
          title: `${submitted.length} ${submitted.length === 1 ? 'submission waits' : 'submissions wait'} for the auditor; ${c.ref} is the oldest`,
          severity: d >= rules.ageing.firstMax ? 'warn' : 'info',
          value: String(submitted.length),
          unit: 'waiting',
          lens: 'status',
          meta: `${areaName.get(c.areaId) ?? ''} · oldest ${d} ${d === 1 ? 'day' : 'days'}`,
          areaId: c.areaId,
          cardId: c.id,
        };
      })()
    : null;

  const ranked = cat.drawers.filter((d) => d.progress.total > 0).sort((a, b) => a.progress.ratio - b.progress.ratio || a.area.position - b.area.position);
  const low = ranked[0];
  const lowest: TodayEntry | null =
    low && low.progress.ratio < 1
      ? {
          id: `area-${low.area.id}`,
          title: `${low.area.name} is the least complete drawer`,
          severity: low.progress.ratio < 0.25 ? 'warn' : 'neutral',
          value: `${pctOf(low.progress)}%`,
          unit: `${low.progress.accepted} of ${low.progress.total} accepted`,
          lens: 'status',
          meta: `Lead ${low.area.leadAuditorName}`,
          areaId: low.area.id,
          cardId: null,
        }
      : null;

  const pick = (...xs: (TodayEntry | null | undefined)[]) => xs.filter((x): x is TodayEntry => !!x).slice(0, 5);
  switch (viewAs) {
    case 'auditor':
      return pick(waiting, overdueHigh[0], overdueHigh[1], oldestQuery, lowest);
    case 'coordinator':
      return pick(newQuery, oldestQuery, overdueHigh[0], overdueHigh[1], lowest);
    case 'owner': {
      const mineQueries = queriesAll.map((c) => queryEntry(c, 'Query'));
      const lateIds = new Set(overdueHigh.map((e) => e.cardId));
      const soon = pool
        .filter((c) => (c.status === 'open' || c.status === 'in_progress') && !c.overdue && c.daysToDue <= rules.dueSoonDays)
        .filter((c) => !lateIds.has(c.id))
        .map<TodayEntry>((c) => ({
          id: `soon-${c.id}`,
          title: `${c.ref} ${c.title} is due ${c.daysToDue === 0 ? 'today' : `in ${c.daysToDue} ${c.daysToDue === 1 ? 'day' : 'days'}`}`,
          severity: 'info',
          value: String(c.daysToDue),
          unit: c.daysToDue === 1 ? 'day left' : 'days left',
          lens: 'ageing',
          meta: areaName.get(c.areaId) ?? '',
          areaId: c.areaId,
          cardId: c.id,
        }));
      return pick(...mineQueries.slice(0, 2), ...overdueHigh.slice(0, 2), ...soon).slice(0, 5);
    }
    default:
      return pick(overdueHigh[0], newQuery ?? oldestQuery, waiting, overdueHigh[1], lowest);
  }
}
