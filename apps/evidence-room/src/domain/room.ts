/**
 * Store access for the room: loaders and the actions behind every tool. Each action loads what it needs, works out
 * who the caller is from the Member rows, checks the rules (rules.ts) and only then writes. The same checks run in
 * demo mode and in Fabric. Callers refetch after every write.
 */
import { NotFoundError, PermissionError, RuleError, type DataStore } from '@x10/shared/data';
import type { Person } from '@x10/shared/identity';
import { checkText, isHttpUrl, toMs, type Errors } from '@x10/shared/lib';

import { rules } from '../config';
import {
  limits,
  type AuditArea,
  type Engagement,
  type Evidence,
  type EvidenceKind,
  type EvidenceRequest,
  type Member,
  type Priority,
  type Schema,
  type Thread,
} from '../model';
import { canUpdateRequestRow, patchAllowed } from './policies';
import { actorFor, compareRefs, evidenceRound, permissionBlocker, transition, type Action, type Actor } from './rules';

type Store = DataStore<Schema>;

/* ------------------------------------------------------------------ loading */

export interface Room {
  engagement: Engagement | null;
  areas: AuditArea[];
  members: Member[];
  requests: EvidenceRequest[];
  evidence: Evidence[];
  threads: Thread[];
}

/** The current engagement: the one in fieldwork, else the newest by period end. */
export function pickEngagement(list: Engagement[]): Engagement | null {
  if (!list.length) return null;
  const active = list.filter((e) => e.status === 'fieldwork' || e.status === 'completion');
  const pool = active.length ? active : list;
  return [...pool].sort((a, b) => toMs(b.periodEnd) - toMs(a.periodEnd))[0];
}

export async function loadRoom(store: Store): Promise<Room> {
  const engagement = pickEngagement(await store.repo('Engagement').list());
  if (!engagement) return { engagement: null, areas: [], members: [], requests: [], evidence: [], threads: [] };
  const where = { engagementId: engagement.id };
  const [areas, members, requests, evidence, threads] = await Promise.all([
    store.repo('AuditArea').list({ where }),
    store.repo('Member').list({ where }),
    store.repo('EvidenceRequest').list({ where }),
    store.repo('Evidence').list(),
    store.repo('Thread').list({ orderBy: { field: 'at', dir: 'asc' } }),
  ]);
  const ids = new Set(requests.map((r) => r.id));
  return {
    engagement,
    areas: [...areas].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    members,
    requests: [...requests].sort((a, b) => compareRefs(a.ref, b.ref)),
    evidence: evidence.filter((e) => ids.has(e.requestId)),
    threads: threads.filter((t) => ids.has(t.requestId)),
  };
}

export interface RequestBundle {
  request: EvidenceRequest;
  area: AuditArea | null;
  engagement: Engagement | null;
  members: Member[];
  evidence: Evidence[];
  threads: Thread[];
  /** Other requests in the engagement (for prev/next and duplicate context). */
  siblings: EvidenceRequest[];
}

export async function loadRequest(store: Store, id: string): Promise<RequestBundle> {
  const request = await store.repo('EvidenceRequest').get(id);
  if (!request) throw new NotFoundError('Request', id);
  const where = { engagementId: request.engagementId };
  const [area, engagement, members, evidence, threads, siblings] = await Promise.all([
    store.repo('AuditArea').get(request.areaId),
    store.repo('Engagement').get(request.engagementId),
    store.repo('Member').list({ where }),
    store.repo('Evidence').list({ where: { requestId: id }, orderBy: { field: 'addedAt', dir: 'asc' } }),
    store.repo('Thread').list({ where: { requestId: id }, orderBy: { field: 'at', dir: 'asc' } }),
    store.repo('EvidenceRequest').list({ where }),
  ]);
  return { request, area, engagement, members, evidence, threads, siblings: siblings.sort((a, b) => compareRefs(a.ref, b.ref)) };
}

/* ------------------------------------------------------------------ helpers */

async function actorIn(store: Store, me: Person, engagementId: string): Promise<{ actor: Actor; members: Member[] }> {
  const members = await store.repo('Member').list({ where: { engagementId } });
  return { actor: actorFor(me, members), members };
}

function allow(actor: Actor, action: Action, req?: EvidenceRequest | null) {
  const why = permissionBlocker(actor, action, req);
  if (why) throw new PermissionError(why);
}

async function getReq(store: Store, id: string): Promise<EvidenceRequest> {
  const r = await store.repo('EvidenceRequest').get(id);
  if (!r) throw new NotFoundError('Request', id);
  return r;
}

async function patchRequest(store: Store, req: EvidenceRequest, patch: Partial<EvidenceRequest>): Promise<EvidenceRequest> {
  // Mirror the row policy so demo mode refuses exactly what Fabric would.
  if (!canUpdateRequestRow(req) || !patchAllowed(patch)) throw new PermissionError('This request is closed and can no longer change.');
  return store.repo('EvidenceRequest').update(req.id, patch);
}

async function post(store: Store, actor: Actor, requestId: string, kind: Thread['kind'], body: string, now: Date): Promise<Thread> {
  return store.repo('Thread').create({
    requestId,
    bySub: actor.sub,
    byName: actor.name.slice(0, limits.personName.max),
    side: actor.side ?? 'client',
    kind,
    body: body.trim(),
    at: now.toISOString(),
  });
}

/* ------------------------------------------------------------------ request slip (auditors) */

export interface SlipInput {
  areaId: string;
  ref: string;
  title: string;
  detail: string;
  /** ISO date-time the request is due. */
  dueAt: string | null;
  priority: Priority;
}

export function validateSlip(v: SlipInput): Errors<SlipInput> {
  const out: Errors<SlipInput> = {};
  if (!v.areaId) out.areaId = 'Choose an audit area.';
  const ref = checkText(v.ref, { ...limits.ref, label: 'Ref' });
  if (ref) out.ref = ref;
  else if (!/^[A-Za-z0-9]+-[A-Za-z0-9]+$/.test(v.ref.trim())) out.ref = 'Use the area code, a dash and a number, such as REV-10.';
  const title = checkText(v.title, { ...limits.title, label: 'Title' });
  if (title) out.title = title;
  const detail = checkText(v.detail, { ...limits.detail, optional: true, label: 'Detail' });
  if (detail) out.detail = detail;
  if (!v.dueAt) out.dueAt = 'Choose a due date.';
  return out;
}

export async function createRequest(store: Store, me: Person, engagementId: string, input: SlipInput): Promise<EvidenceRequest> {
  const { actor } = await actorIn(store, me, engagementId);
  allow(actor, 'create');
  const errors = validateSlip(input);
  const first = Object.values(errors)[0];
  if (first) throw new RuleError(first);
  const area = await store.repo('AuditArea').get(input.areaId);
  if (!area || area.engagementId !== engagementId) throw new RuleError('That audit area is not part of this engagement.');
  const ref = input.ref.trim().toUpperCase();
  const existing = await store.repo('EvidenceRequest').list({ where: { engagementId } });
  if (existing.some((r) => r.ref.toUpperCase() === ref)) throw new RuleError(`${ref} is already used in this engagement.`);
  return store.repo('EvidenceRequest').create({
    engagementId,
    areaId: area.id,
    ref,
    title: input.title.trim(),
    detail: input.detail.trim(),
    ownerSub: null,
    ownerName: null,
    dueAt: input.dueAt!,
    priority: input.priority,
    status: 'open',
    createdBy: actor.sub,
    submittedAt: null,
    acceptedAt: null,
    acceptedBy: null,
  });
}

/* ------------------------------------------------------------------ owners (coordinators) */

export async function assignOwner(store: Store, me: Person, requestId: string, ownerSub: string): Promise<EvidenceRequest> {
  const req = await getReq(store, requestId);
  const { actor, members } = await actorIn(store, me, req.engagementId);
  allow(actor, 'assign', req);
  const owner = members.find((m) => m.personSub === ownerSub && m.side === 'client');
  if (!owner) throw new RuleError('The owner must be someone on the client side of this engagement.');
  const evidence = await store.repo('Evidence').list({ where: { requestId } });
  const status = transition(req.status, 'assign', { hasOwner: true, evidenceCount: evidence.length });
  return patchRequest(store, req, { ownerSub: owner.personSub, ownerName: owner.personName, status });
}

/* ------------------------------------------------------------------ evidence (owner or coordinator) */

export interface EvidenceInput {
  kind: EvidenceKind;
  title: string;
  location: string;
  note: string;
}

export function validateEvidence(v: EvidenceInput): Errors<EvidenceInput> {
  const out: Errors<EvidenceInput> = {};
  const title = checkText(v.title, { ...limits.evidenceTitle, label: 'Title' });
  if (title) out.title = title;
  const loc = v.location.trim();
  if (v.kind === 'link') {
    if (!loc) out.location = 'Paste the link to the evidence.';
    else if (loc.length > limits.evidenceLocation.max) out.location = `Link must be ${limits.evidenceLocation.max} characters or fewer.`;
    else if (!isHttpUrl(loc)) out.location = 'Enter a full link starting with https://';
  } else if (v.kind === 'file') {
    const e = checkText(loc, { max: limits.evidenceLocation.max, label: 'File name' });
    if (e) out.location = e;
  } else if (loc.length > limits.evidenceLocation.max) out.location = `Must be ${limits.evidenceLocation.max} characters or fewer.`;
  const note = checkText(v.note, { ...limits.evidenceNote, optional: v.kind !== 'note', label: 'Note' });
  if (note) out.note = note;
  return out;
}

export async function addEvidence(store: Store, me: Person, requestId: string, input: EvidenceInput, now = new Date()): Promise<Evidence> {
  const req = await getReq(store, requestId);
  const { actor } = await actorIn(store, me, req.engagementId);
  allow(actor, 'evidence', req);
  const errors = validateEvidence(input);
  const first = Object.values(errors)[0];
  if (first) throw new RuleError(first);
  const [evidence, threads] = await Promise.all([
    store.repo('Evidence').list({ where: { requestId } }),
    store.repo('Thread').list({ where: { requestId } }),
  ]);
  const status = transition(req.status, 'evidence', { hasOwner: !!req.ownerSub, evidenceCount: evidence.length + 1 });
  const row = await store.repo('Evidence').create({
    requestId,
    kind: input.kind,
    title: input.title.trim(),
    location: input.location.trim(),
    note: input.note.trim() || null,
    addedBy: actor.sub,
    addedAt: now.toISOString(),
    version: evidenceRound(threads),
  });
  if (status !== req.status) await patchRequest(store, req, { status });
  return row;
}

export async function submitRequest(store: Store, me: Person, requestId: string, note = '', now = new Date()): Promise<EvidenceRequest> {
  const req = await getReq(store, requestId);
  const { actor } = await actorIn(store, me, req.engagementId);
  allow(actor, 'submit', req);
  const evidence = await store.repo('Evidence').list({ where: { requestId } });
  const status = transition(req.status, 'submit', { hasOwner: !!req.ownerSub, evidenceCount: evidence.length });
  const n = checkText(note, { ...limits.threadBody, optional: true, label: 'Note' });
  if (n) throw new RuleError(n);
  if (note.trim()) await post(store, actor, requestId, 'message', note, now);
  return patchRequest(store, req, { status, submittedAt: now.toISOString() });
}

/* ------------------------------------------------------------------ review (auditors) */

export async function raiseQuery(store: Store, me: Person, requestId: string, question: string, now = new Date()): Promise<EvidenceRequest> {
  const req = await getReq(store, requestId);
  const { actor } = await actorIn(store, me, req.engagementId);
  allow(actor, 'query', req);
  const status = transition(req.status, 'query', { hasOwner: !!req.ownerSub, evidenceCount: 0 });
  const e = checkText(question, { min: rules.queryMin, max: limits.threadBody.max, label: 'The query' });
  if (e) throw new RuleError(e);
  await post(store, actor, requestId, 'query', question, now);
  return patchRequest(store, req, { status });
}

export async function acceptRequest(store: Store, me: Person, requestId: string, now = new Date()): Promise<EvidenceRequest> {
  const req = await getReq(store, requestId);
  const { actor } = await actorIn(store, me, req.engagementId);
  allow(actor, 'accept', req);
  const status = transition(req.status, 'accept', { hasOwner: !!req.ownerSub, evidenceCount: 0 });
  return patchRequest(store, req, { status, acceptedAt: now.toISOString(), acceptedBy: actor.sub });
}

export async function withdrawRequest(store: Store, me: Person, requestId: string, reason: string, now = new Date()): Promise<EvidenceRequest> {
  const req = await getReq(store, requestId);
  const { actor } = await actorIn(store, me, req.engagementId);
  allow(actor, 'withdraw', req);
  const status = transition(req.status, 'withdraw', { hasOwner: !!req.ownerSub, evidenceCount: 0 });
  const e = checkText(reason, { min: rules.withdrawReasonMin, max: limits.threadBody.max, label: 'The reason' });
  if (e) throw new RuleError(e);
  await post(store, actor, requestId, 'withdrawal', reason, now);
  return patchRequest(store, req, { status });
}

/* ------------------------------------------------------------------ thread (any member) */

export async function postMessage(store: Store, me: Person, requestId: string, body: string, now = new Date()): Promise<Thread> {
  const req = await getReq(store, requestId);
  const { actor } = await actorIn(store, me, req.engagementId);
  allow(actor, 'message', req);
  const e = checkText(body, { ...limits.threadBody, label: 'The message' });
  if (e) throw new RuleError(e);
  return post(store, actor, requestId, 'message', body, now);
}
