/**
 * The room's rules, as pure functions (no store, no clock): who may do what, the status machine, overdue and
 * ageing, per-area progress, evidence rounds, duplicate hints and integrity checks. Unit-tested in rules.test.ts.
 */
import { RuleError } from '@x10/shared/data';
import { DAY, toMs, tokens } from '@x10/shared/lib';

import { rules } from '../config';
import type { EvidenceRequest, Member, MemberRole, Side, Status, Thread } from '../model';

/* ------------------------------------------------------------------ statuses */

/** Waiting on the client: these can be overdue. */
export const OUTSTANDING: readonly Status[] = ['open', 'in_progress', 'query'];
/** Not yet final (the database lets these rows change). */
export const LIVE: readonly Status[] = ['open', 'in_progress', 'submitted', 'query'];

export const isOutstanding = (s: Status) => OUTSTANDING.includes(s);
export const isLive = (s: Status) => LIVE.includes(s);

/* ------------------------------------------------------------------ actors */

export interface Actor {
  sub: string;
  name: string;
  /** Null when the viewer is not a member of the engagement (read-only). */
  side: Side | null;
  role: MemberRole | null;
  /** Client coordinator: assigns owners and can provide evidence on any request. Admins count as coordinators. */
  coordinator: boolean;
}

/** The viewer's place in the room, from their Member row (admins without one act as client coordinators). */
export function actorFor(person: { sub: string; displayName: string; isAdmin: boolean | null }, members: Member[]): Actor {
  const m = members.find((x) => x.personSub === person.sub) ?? null;
  const side: Side | null = m?.side ?? (person.isAdmin ? 'client' : null);
  const coordinator = side === 'client' && (m?.role === 'coordinator' || person.isAdmin === true);
  return { sub: person.sub, name: m?.personName ?? person.displayName, side, role: m?.role ?? (coordinator ? 'coordinator' : null), coordinator };
}

export type Party = 'auditor' | 'coordinator' | 'owner' | 'viewer';

/** The view-as perspective that fits the viewer. */
export function partyOf(a: Actor): Party {
  if (a.side === 'auditor') return 'auditor';
  if (a.coordinator) return 'coordinator';
  if (a.side === 'client') return 'owner';
  return 'viewer';
}

/* ------------------------------------------------------------------ permissions */

export type Action = 'create' | 'assign' | 'evidence' | 'submit' | 'query' | 'accept' | 'withdraw' | 'message';

const AUDITOR_ONLY: Partial<Record<Action, string>> = {
  create: 'Only auditors write request slips.',
  query: 'Only auditors raise queries.',
  accept: 'Only auditors accept evidence.',
  withdraw: 'Only auditors withdraw requests.',
};

/** Why `actor` may not do `action` on `req`, or null when they may. */
export function permissionBlocker(actor: Actor, action: Action, req?: Pick<EvidenceRequest, 'ownerSub'> | null): string | null {
  if (!actor.side) return 'You are not a member of this engagement, so the room is read-only for you.';
  const auditorOnly = AUDITOR_ONLY[action];
  if (auditorOnly) return actor.side === 'auditor' ? null : auditorOnly;
  if (action === 'assign') return actor.coordinator ? null : 'Only a client coordinator assigns owners.';
  if (action === 'evidence' || action === 'submit') {
    if (actor.side === 'auditor') return 'Auditors review evidence; the client provides it.';
    const mine = !!req?.ownerSub && req.ownerSub === actor.sub;
    if (mine || actor.coordinator) return null;
    return action === 'evidence'
      ? 'Only the request’s owner or a coordinator adds evidence.'
      : 'Only the request’s owner or a coordinator submits.';
  }
  return null; // message: any member
}

export const can = (actor: Actor, action: Action, req?: Pick<EvidenceRequest, 'ownerSub'> | null) => permissionBlocker(actor, action, req) === null;

/* ------------------------------------------------------------------ status machine */

export type Move = 'evidence' | 'assign' | 'submit' | 'query' | 'accept' | 'withdraw';

export interface MoveContext {
  /** The request has an owner (after the move, for "assign"). */
  hasOwner: boolean;
  /** Evidence rows on the request (after the move, for "evidence"). */
  evidenceCount: number;
}

type Result = { ok: true; status: Status } | { ok: false; reason: string };

function step(status: Status, move: Move, ctx: MoveContext): Result {
  const ok = (s: Status): Result => ({ ok: true, status: s });
  const no = (reason: string): Result => ({ ok: false, reason });
  if (status === 'accepted') return no('This request is accepted and closed.');
  if (status === 'withdrawn') return no('This request was withdrawn.');
  switch (move) {
    case 'evidence':
      if (status === 'submitted') return no('The evidence is with the auditor. Add more after a query.');
      // open → in progress once an owner is assigned and the first evidence is in.
      if (status === 'open') return ok(ctx.hasOwner && ctx.evidenceCount > 0 ? 'in_progress' : 'open');
      return ok(status);
    case 'assign':
      if (status === 'open') return ok(ctx.hasOwner && ctx.evidenceCount > 0 ? 'in_progress' : 'open');
      return ok(status);
    case 'submit':
      if (status === 'open') return no(ctx.hasOwner ? 'Add evidence before submitting.' : 'Assign an owner and add evidence first.');
      if (status === 'submitted') return no('Already submitted; it is waiting for the auditor.');
      if (ctx.evidenceCount < 1) return no('Add evidence before submitting.');
      return ok('submitted');
    case 'query':
      if (status !== 'submitted') return no('A query can only be raised on submitted evidence.');
      return ok('query');
    case 'accept':
      if (status !== 'submitted') return no('Only submitted evidence can be accepted.');
      return ok('accepted');
    case 'withdraw':
      return ok('withdrawn');
  }
}

/** The status after `move`; throws RuleError when the move is not allowed from `status`. */
export function transition(status: Status, move: Move, ctx: MoveContext): Status {
  const r = step(status, move, ctx);
  if (!r.ok) throw new RuleError(r.reason);
  return r.status;
}

/** Why `move` is not allowed from `status`, or null. */
export function moveBlocker(status: Status, move: Move, ctx: MoveContext): string | null {
  const r = step(status, move, ctx);
  return r.ok ? null : r.reason;
}

/* ------------------------------------------------------------------ overdue and ageing */

export const BUCKETS = ['not_due', 'late_1_7', 'late_8_14', 'late_15'] as const;
export type Bucket = (typeof BUCKETS)[number] | 'settled';

/** Overdue: not submitted or accepted (still with the client) after the due date. */
export function isOverdue(req: Pick<EvidenceRequest, 'status' | 'dueAt'>, now: Date): boolean {
  return isOutstanding(req.status) && now.getTime() > toMs(req.dueAt);
}

/** Whole days late, rounded up (0 when not overdue). Anything past the due time is at least 1 day late. */
export function daysLate(req: Pick<EvidenceRequest, 'status' | 'dueAt'>, now: Date): number {
  if (!isOverdue(req, now)) return 0;
  return Math.max(1, Math.ceil((now.getTime() - toMs(req.dueAt)) / DAY));
}

/** Days until due (negative when late), rounded down. */
export function daysToDue(req: Pick<EvidenceRequest, 'dueAt'>, now: Date): number {
  return Math.floor((toMs(req.dueAt) - now.getTime()) / DAY);
}

/** Ageing bucket of a request: not due, 1–7, 8–14 or 15+ days late; "settled" once it is with the auditor or closed. */
export function ageingBucket(req: Pick<EvidenceRequest, 'status' | 'dueAt'>, now: Date): Bucket {
  if (!isOutstanding(req.status)) return 'settled';
  const d = daysLate(req, now);
  if (d === 0) return 'not_due';
  if (d <= rules.ageing.firstMax) return 'late_1_7';
  if (d <= rules.ageing.secondMax) return 'late_8_14';
  return 'late_15';
}

export function bucketCounts(reqs: Pick<EvidenceRequest, 'status' | 'dueAt'>[], now: Date): Record<Bucket, number> {
  const out: Record<Bucket, number> = { not_due: 0, late_1_7: 0, late_8_14: 0, late_15: 0, settled: 0 };
  for (const r of reqs) out[ageingBucket(r, now)]++;
  return out;
}

/* ------------------------------------------------------------------ progress */

export interface Progress {
  accepted: number;
  /** All requests minus withdrawn. */
  total: number;
  withdrawn: number;
  /** accepted / total, 0..1 (0 when nothing counts). */
  ratio: number;
}

/** Progress = accepted / (all − withdrawn). */
export function progressOf(reqs: Pick<EvidenceRequest, 'status'>[]): Progress {
  const withdrawn = reqs.filter((r) => r.status === 'withdrawn').length;
  const accepted = reqs.filter((r) => r.status === 'accepted').length;
  const total = reqs.length - withdrawn;
  return { accepted, total, withdrawn, ratio: total > 0 ? accepted / total : 0 };
}

export const pctOf = (p: Progress) => Math.round(p.ratio * 100);

/* ------------------------------------------------------------------ evidence rounds */

/** Evidence version for the next addition: round 1 before any query, then one more per query raised. */
export function evidenceRound(threads: Pick<Thread, 'kind'>[]): number {
  return 1 + threads.filter((t) => t.kind === 'query').length;
}

/* ------------------------------------------------------------------ duplicate hints */

const STOP = new Set(
  'a an and are as at be by for from in into is it of on or per the this that to with all any our your their its be please provide copy copies'.split(' '),
);

/** Comparable words of a title: lowercase, no stop words, a light plural stem ("reconciliations" → "reconciliation"). */
export function titleWords(s: string): string[] {
  const out = new Set<string>();
  for (const w of tokens(s)) {
    if (STOP.has(w)) continue;
    let x = w;
    if (x.length > 4 && x.endsWith('ies')) x = `${x.slice(0, -3)}y`;
    else if (x.length > 5 && x.endsWith('sses')) x = x.slice(0, -2);
    else if (x.length > 3 && x.endsWith('s') && !x.endsWith('ss') && !x.endsWith('us')) x = x.slice(0, -1);
    out.add(x);
  }
  return [...out];
}

/** Word-overlap score of two titles: Dice coefficient on their words, 0..1. */
export function similarity(a: string, b: string): number {
  const A = titleWords(a);
  const B = new Set(titleWords(b));
  if (!A.length || !B.size) return 0;
  const shared = A.filter((w) => B.has(w)).length;
  return (2 * shared) / (A.length + B.size);
}

export interface SimilarHit<R> {
  request: R;
  score: number;
}

/**
 * Similar open or accepted requests for a title being typed (withdrawn ones are ignored), best first.
 * Needs at least two words typed so a single common word does not flood the list.
 */
export function similarRequests<R extends Pick<EvidenceRequest, 'title' | 'status' | 'ref'>>(
  title: string,
  requests: R[],
  opts: { threshold?: number; limit?: number } = {},
): SimilarHit<R>[] {
  const threshold = opts.threshold ?? rules.duplicateThreshold;
  const limit = opts.limit ?? rules.duplicateLimit;
  if (titleWords(title).length < 2) return [];
  return requests
    .filter((r) => r.status !== 'withdrawn')
    .map((r) => ({ request: r, score: similarity(title, r.title) }))
    .filter((h) => h.score >= threshold)
    .sort((a, b) => b.score - a.score || a.request.ref.localeCompare(b.request.ref))
    .slice(0, limit);
}

/* ------------------------------------------------------------------ refs */

/** Next free ref in an area: CODE-NN, one more than the highest number used. */
export function nextRef(code: string, refs: string[]): string {
  const prefix = `${code.toUpperCase()}-`;
  let max = 0;
  for (const r of refs) {
    if (!r.toUpperCase().startsWith(prefix)) continue;
    const n = Number.parseInt(r.slice(prefix.length), 10);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return `${prefix}${String(max + 1).padStart(2, '0')}`;
}

/** Sort refs naturally: REV-2 before REV-10. */
export function compareRefs(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/* ------------------------------------------------------------------ integrity */

/**
 * Stamps that do not match the members. The API cannot check sides, so the app flags rows that were written
 * outside its rules (for example straight through the GraphQL API).
 */
export function integrityIssues(req: EvidenceRequest, members: Member[]): string[] {
  const side = (sub: string | null) => members.find((m) => m.personSub === sub)?.side ?? null;
  const out: string[] = [];
  if (side(req.createdBy) !== 'auditor') out.push('Written by someone who is not an auditor on this engagement.');
  if (req.status === 'accepted') {
    if (side(req.acceptedBy) !== 'auditor') out.push('Accepted by someone who is not an auditor on this engagement.');
    if (!req.acceptedAt) out.push('Accepted without an acceptance date.');
  }
  if ((req.status === 'submitted' || req.status === 'accepted' || req.status === 'query') && !req.submittedAt) out.push('Marked as submitted without a submission date.');
  if (req.status === 'in_progress' && !req.ownerSub) out.push('In progress without an owner.');
  return out;
}
