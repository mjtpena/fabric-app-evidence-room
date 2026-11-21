import { RuleError } from '@x10/shared/data';
import { DAY, HOUR } from '@x10/shared/lib';
import { FIXED_NOW } from '@x10/shared/test';

import type { EvidenceRequest, Member, Status } from '../model';
import {
  actorFor,
  ageingBucket,
  bucketCounts,
  compareRefs,
  daysLate,
  evidenceRound,
  integrityIssues,
  isOverdue,
  moveBlocker,
  nextRef,
  partyOf,
  permissionBlocker,
  progressOf,
  similarRequests,
  similarity,
  titleWords,
  transition,
  type Actor,
} from './rules';

const now = FIXED_NOW;
const iso = (ms: number) => new Date(ms).toISOString();
const dueIn = (days: number) => iso(now.getTime() + days * DAY);

const member = (sub: string, side: Member['side'], role: Member['role'] = 'member'): Member => ({
  id: sub,
  engagementId: 'e',
  personSub: sub,
  personName: sub,
  side,
  role,
});
const MEMBERS = [member('aud', 'auditor', 'lead'), member('coord', 'client', 'coordinator'), member('own', 'client'), member('other', 'client')];
const person = (sub: string, isAdmin = false) => ({ sub, displayName: sub, isAdmin });
const actor = (sub: string, isAdmin = false): Actor => actorFor(person(sub, isAdmin), MEMBERS);

const req = (over: Partial<EvidenceRequest> = {}): EvidenceRequest => ({
  id: 'r',
  engagementId: 'e',
  areaId: 'a',
  ref: 'REV-01',
  title: 'Revenue by stream',
  detail: '',
  ownerSub: 'own',
  ownerName: 'Owner',
  dueAt: dueIn(3),
  priority: 'normal',
  status: 'open',
  createdBy: 'aud',
  submittedAt: null,
  acceptedAt: null,
  acceptedBy: null,
  ...over,
});

describe('actors and permissions', () => {
  it('derives the side and the coordinator flag from Member rows', () => {
    expect(actor('aud')).toMatchObject({ side: 'auditor', coordinator: false });
    expect(actor('coord')).toMatchObject({ side: 'client', coordinator: true });
    expect(actor('own')).toMatchObject({ side: 'client', coordinator: false });
    expect(actor('stranger').side).toBeNull();
    // An admin without a Member row acts as a client coordinator.
    expect(actor('admin', true)).toMatchObject({ side: 'client', coordinator: true });
    // An auditor who is also an admin stays an auditor (no coordinator rights).
    expect(actorFor(person('aud', true), MEMBERS)).toMatchObject({ side: 'auditor', coordinator: false });
    expect(partyOf(actor('aud'))).toBe('auditor');
    expect(partyOf(actor('coord'))).toBe('coordinator');
    expect(partyOf(actor('own'))).toBe('owner');
    expect(partyOf(actor('stranger'))).toBe('viewer');
  });

  it('only auditors create, query, accept and withdraw', () => {
    for (const a of ['create', 'query', 'accept', 'withdraw'] as const) {
      expect(permissionBlocker(actor('aud'), a, req())).toBeNull();
      expect(permissionBlocker(actor('coord'), a, req())).toMatch(/Only auditors/);
      expect(permissionBlocker(actor('own'), a, req())).toMatch(/Only auditors/);
    }
  });

  it('only the owner or a coordinator adds evidence and submits', () => {
    for (const a of ['evidence', 'submit'] as const) {
      expect(permissionBlocker(actor('own'), a, req())).toBeNull();
      expect(permissionBlocker(actor('coord'), a, req())).toBeNull();
      expect(permissionBlocker(actor('other'), a, req())).toMatch(/owner or a coordinator/);
      expect(permissionBlocker(actor('aud'), a, req())).toMatch(/Auditors review/);
      // No owner yet: only a coordinator.
      expect(permissionBlocker(actor('own'), a, req({ ownerSub: null }))).toMatch(/owner or a coordinator/);
    }
  });

  it('only coordinators assign owners; strangers are read-only', () => {
    expect(permissionBlocker(actor('coord'), 'assign')).toBeNull();
    expect(permissionBlocker(actor('own'), 'assign')).toMatch(/coordinator/);
    expect(permissionBlocker(actor('aud'), 'assign')).toMatch(/coordinator/);
    expect(permissionBlocker(actor('stranger'), 'message')).toMatch(/read-only/);
    expect(permissionBlocker(actor('own'), 'message')).toBeNull();
  });
});

describe('status machine', () => {
  const ctx = (hasOwner: boolean, evidenceCount: number) => ({ hasOwner, evidenceCount });

  it('open → in progress needs an owner and the first evidence', () => {
    expect(transition('open', 'evidence', ctx(true, 1))).toBe('in_progress');
    expect(transition('open', 'evidence', ctx(false, 1))).toBe('open');
    expect(transition('open', 'assign', ctx(true, 2))).toBe('in_progress');
    expect(transition('open', 'assign', ctx(true, 0))).toBe('open');
    expect(transition('in_progress', 'evidence', ctx(true, 3))).toBe('in_progress');
  });

  it('runs open → in progress → submitted → query → submitted → accepted', () => {
    let s: Status = 'open';
    s = transition(s, 'evidence', ctx(true, 1));
    s = transition(s, 'submit', ctx(true, 1));
    expect(s).toBe('submitted');
    s = transition(s, 'query', ctx(true, 1));
    expect(s).toBe('query');
    expect(transition(s, 'evidence', ctx(true, 2))).toBe('query');
    s = transition(s, 'submit', ctx(true, 2));
    expect(s).toBe('submitted');
    s = transition(s, 'accept', ctx(true, 2));
    expect(s).toBe('accepted');
  });

  it('refuses moves that skip a step', () => {
    expect(() => transition('open', 'submit', ctx(true, 0))).toThrow(RuleError);
    expect(moveBlocker('open', 'submit', ctx(false, 0))).toMatch(/Assign an owner/);
    expect(moveBlocker('in_progress', 'submit', ctx(true, 0))).toMatch(/Add evidence/);
    expect(moveBlocker('in_progress', 'accept', ctx(true, 1))).toMatch(/Only submitted/);
    expect(moveBlocker('query', 'accept', ctx(true, 1))).toMatch(/Only submitted/);
    expect(moveBlocker('open', 'query', ctx(true, 1))).toMatch(/submitted evidence/);
    expect(moveBlocker('submitted', 'submit', ctx(true, 1))).toMatch(/Already submitted/);
    expect(moveBlocker('submitted', 'evidence', ctx(true, 2))).toMatch(/with the auditor/);
  });

  it('accepted and withdrawn are final; withdraw works from any live status', () => {
    for (const s of ['open', 'in_progress', 'submitted', 'query'] as const) expect(transition(s, 'withdraw', ctx(true, 0))).toBe('withdrawn');
    for (const m of ['evidence', 'assign', 'submit', 'query', 'accept', 'withdraw'] as const) {
      expect(moveBlocker('accepted', m, ctx(true, 1))).toMatch(/accepted and closed/);
      expect(moveBlocker('withdrawn', m, ctx(true, 1))).toMatch(/withdrawn/);
    }
  });
});

describe('overdue and ageing', () => {
  it('is overdue only while with the client and past the due time', () => {
    expect(isOverdue(req({ dueAt: dueIn(-1) }), now)).toBe(true);
    expect(isOverdue(req({ dueAt: dueIn(-1), status: 'query' }), now)).toBe(true);
    expect(isOverdue(req({ dueAt: dueIn(-1), status: 'submitted' }), now)).toBe(false);
    expect(isOverdue(req({ dueAt: dueIn(-1), status: 'accepted' }), now)).toBe(false);
    expect(isOverdue(req({ dueAt: dueIn(-1), status: 'withdrawn' }), now)).toBe(false);
    expect(isOverdue(req({ dueAt: now.toISOString() }), now)).toBe(false);
  });

  it('counts days late rounded up, at least one', () => {
    expect(daysLate(req({ dueAt: iso(now.getTime() - HOUR) }), now)).toBe(1);
    expect(daysLate(req({ dueAt: dueIn(-7) }), now)).toBe(7);
    expect(daysLate(req({ dueAt: iso(now.getTime() - 7 * DAY - HOUR) }), now)).toBe(8);
    expect(daysLate(req({ dueAt: dueIn(2) }), now)).toBe(0);
  });

  it('puts each outstanding request in one bucket, with the edges at 7/8 and 14/15', () => {
    const b = (days: number, status: Status = 'open') => ageingBucket(req({ dueAt: dueIn(days), status }), now);
    expect(b(3)).toBe('not_due');
    expect(b(-1)).toBe('late_1_7');
    expect(b(-7)).toBe('late_1_7');
    expect(b(-7.1)).toBe('late_8_14');
    expect(b(-14)).toBe('late_8_14');
    expect(b(-14.1)).toBe('late_15');
    expect(b(-40)).toBe('late_15');
    expect(b(-40, 'submitted')).toBe('settled');
    expect(b(-40, 'accepted')).toBe('settled');
    const counts = bucketCounts([req({ dueAt: dueIn(-2) }), req({ dueAt: dueIn(-9) }), req({ dueAt: dueIn(4) }), req({ status: 'accepted' })], now);
    expect(counts).toEqual({ not_due: 1, late_1_7: 1, late_8_14: 1, late_15: 0, settled: 1 });
  });
});

describe('progress', () => {
  it('is accepted / (all − withdrawn)', () => {
    const p = progressOf([{ status: 'accepted' }, { status: 'accepted' }, { status: 'open' }, { status: 'withdrawn' }, { status: 'query' }]);
    expect(p).toEqual({ accepted: 2, total: 4, withdrawn: 1, ratio: 0.5 });
  });
  it('is zero for an empty or all-withdrawn drawer', () => {
    expect(progressOf([]).ratio).toBe(0);
    expect(progressOf([{ status: 'withdrawn' }]).ratio).toBe(0);
    expect(progressOf([{ status: 'accepted' }, { status: 'withdrawn' }]).ratio).toBe(1);
  });
});

describe('evidence rounds', () => {
  it('starts at 1 and adds one per query', () => {
    expect(evidenceRound([])).toBe(1);
    expect(evidenceRound([{ kind: 'message' }, { kind: 'query' }])).toBe(2);
    expect(evidenceRound([{ kind: 'query' }, { kind: 'message' }, { kind: 'query' }, { kind: 'withdrawal' }])).toBe(3);
  });
});

describe('duplicate hints', () => {
  const existing = [
    { ref: 'CASH-01', title: 'Bank reconciliations for all operating accounts at period end', status: 'accepted' as Status },
    { ref: 'CASH-02', title: 'Bank confirmation letters', status: 'accepted' as Status },
    { ref: 'CASH-07', title: 'Bank reconciliation for the savings account', status: 'withdrawn' as Status },
    { ref: 'REV-01', title: 'Revenue by stream reconciled to the general ledger', status: 'open' as Status },
  ];

  it('normalises words: case, stop words and plurals', () => {
    expect(titleWords('The Bank Reconciliations, for ALL accounts')).toEqual(['bank', 'reconciliation', 'account']);
    expect(titleWords('Policies and processes')).toEqual(['policy', 'process']);
    expect(similarity('bank reconciliation', 'Bank reconciliations')).toBe(1);
    expect(similarity('', 'anything')).toBe(0);
  });

  it('shows the existing bank reconciliation request for "bank reconciliation"', () => {
    const hits = similarRequests('bank reconciliation', existing);
    expect(hits.map((h) => h.request.ref)).toEqual(['CASH-01']);
    // {bank, reconciliation} against {bank, reconciliation, operating, account, period, end}: 2·2 / (2 + 6).
    expect(hits[0].score).toBeCloseTo(0.5, 2);
  });

  it('ignores withdrawn requests, single words and weak overlaps', () => {
    expect(similarRequests('bank', existing)).toEqual([]);
    expect(similarRequests('bank reconciliation savings account', existing).map((h) => h.request.ref)).not.toContain('CASH-07');
    expect(similarRequests('payroll tax filings', existing)).toEqual([]);
  });

  it('ranks by score and caps the list', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ ref: `X-${i}`, title: `Fixed asset register ${i === 0 ? '' : `part ${i}`}`, status: 'open' as Status }));
    const hits = similarRequests('fixed asset register', many, { limit: 3 });
    expect(hits).toHaveLength(3);
    expect(hits[0].request.ref).toBe('X-0');
  });
});

describe('refs', () => {
  it('suggests the next ref in an area', () => {
    expect(nextRef('REV', ['REV-01', 'REV-09', 'REV-3', 'PAY-12'])).toBe('REV-10');
    expect(nextRef('itgc', [])).toBe('ITGC-01');
    expect(['REV-10', 'REV-2', 'REV-01'].sort(compareRefs)).toEqual(['REV-01', 'REV-2', 'REV-10']);
  });
});

describe('integrity', () => {
  it('flags stamps that do not match the members', () => {
    expect(integrityIssues(req(), MEMBERS)).toEqual([]);
    expect(integrityIssues(req({ createdBy: 'own' }), MEMBERS)[0]).toMatch(/not an auditor/);
    expect(integrityIssues(req({ status: 'accepted', submittedAt: dueIn(-2), acceptedAt: dueIn(-1), acceptedBy: 'coord' }), MEMBERS)).toEqual([
      'Accepted by someone who is not an auditor on this engagement.',
    ]);
    expect(integrityIssues(req({ status: 'submitted' }), MEMBERS)).toEqual(['Marked as submitted without a submission date.']);
    expect(integrityIssues(req({ status: 'in_progress', ownerSub: null }), MEMBERS)).toEqual(['In progress without an owner.']);
  });
});
