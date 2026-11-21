import { PermissionError, RuleError, type DataStore } from '@x10/shared/data';
import type { Person } from '@x10/shared/identity';
import { addDays } from '@x10/shared/lib';
import { FIXED_NOW, testStore } from '@x10/shared/test';

import { personas, PERSONA } from '../app.config';
import { defs, type EvidenceRequest, type Schema } from '../model';
import { seed } from '../seed';
import { buildCatalogue, todayFor } from './catalogue';
import { canCreateRequestRow, canUpdateRequestRow, patchAllowed, REQUEST_CREATE_EXCLUDED } from './policies';
import {
  acceptRequest,
  addEvidence,
  assignOwner,
  createRequest,
  loadRequest,
  loadRoom,
  pickEngagement,
  postMessage,
  raiseQuery,
  submitRequest,
  validateEvidence,
  validateSlip,
  withdrawRequest,
  type SlipInput,
} from './room';

const later = (min: number) => new Date(FIXED_NOW.getTime() + min * 60_000);

async function setup() {
  const store = await testStore(defs, { personas, fn: seed, now: FIXED_NOW });
  const people = await store.repo('Person').list();
  const p = (sub: string) => people.find((x) => x.sub === sub)!;
  const room = await loadRoom(store);
  const byRef = (ref: string) => room.requests.find((r) => r.ref === ref)!;
  return { store, p, room, byRef };
}

const reqOf = async (store: DataStore<Schema>, id: string) => (await store.repo('EvidenceRequest').get(id))!;

describe('owner provides evidence and submits (acceptance 1)', () => {
  it('moves an open card to in progress, then submitted, and into the auditor’s queue', async () => {
    const { store, p, byRef } = await setup();
    const rev9 = byRef('REV-09');
    expect(rev9.status).toBe('open');
    await addEvidence(store, p(PERSONA.sam), rev9.id, { kind: 'link', title: 'Provision workings', location: 'https://files.example.com/x', note: '' }, later(1));
    expect((await reqOf(store, rev9.id)).status).toBe('in_progress');
    const submitted = await submitRequest(store, p(PERSONA.sam), rev9.id, 'Workings and the policy are both in the folder.', later(2));
    expect(submitted.status).toBe('submitted');
    expect(submitted.submittedAt).toBe(later(2).toISOString());
    const cat = buildCatalogue(await loadRoom(store), later(3));
    const today = todayFor(cat, 'auditor', PERSONA.morgan, later(3));
    expect(today[0].title).toMatch(/^8 submissions wait for the auditor/);
    const ev = await store.repo('Evidence').list({ where: { requestId: rev9.id } });
    expect(ev).toMatchObject([{ version: 1, addedBy: PERSONA.sam }]);
  });

  it('refuses evidence from someone who does not own the request', async () => {
    const { store, p, byRef } = await setup();
    const input = { kind: 'note' as const, title: 'A note', location: '', note: 'Something.' };
    await expect(addEvidence(store, p(PERSONA.priya), byRef('REV-04').id, input)).rejects.toThrow(PermissionError);
    await expect(addEvidence(store, p(PERSONA.morgan), byRef('REV-04').id, input)).rejects.toThrow(/Auditors review/);
    // The coordinator can provide evidence on anyone's request.
    await expect(addEvidence(store, p(PERSONA.dana), byRef('REV-04').id, input)).resolves.toMatchObject({ addedBy: PERSONA.dana });
  });

  it('refuses a submit with no evidence and evidence on a submitted card', async () => {
    const { store, p, byRef } = await setup();
    await expect(submitRequest(store, p(PERSONA.sam), byRef('REV-09').id)).rejects.toThrow(/Add evidence before submitting/);
    await expect(
      addEvidence(store, p(PERSONA.sam), byRef('REV-05').id, { kind: 'note', title: 'More', location: '', note: 'More detail.' }),
    ).rejects.toThrow(/with the auditor/);
  });
});

describe('auditor raises a query (acceptance 2)', () => {
  it('puts the card in query with the question on the thread, and the coordinator sees it', async () => {
    const { store, p, byRef } = await setup();
    const fa3 = byRef('FA-03');
    await raiseQuery(store, p(PERSONA.morgan), fa3.id, 'Please add the sale agreements for the two vehicles.', later(5));
    const bundle = await loadRequest(store, fa3.id);
    expect(bundle.request.status).toBe('query');
    expect(bundle.threads.at(-1)).toMatchObject({ kind: 'query', side: 'auditor', bySub: PERSONA.morgan });
    const cat = buildCatalogue(await loadRoom(store), later(6));
    expect(cat.drawers.find((d) => d.area.code === 'FA')!.cards.find((c) => c.ref === 'FA-03')).toMatchObject({ status: 'query', queryAt: later(5).toISOString() });
    const today = todayFor(cat, 'coordinator', PERSONA.dana, later(6));
    expect(today[0].title).toBe('New query on FA-03 Disposals and proceeds waits for the client');
  });

  it('bumps the evidence version after a query, then accepts on resubmission', async () => {
    const { store, p, byRef } = await setup();
    const fa3 = byRef('FA-03');
    await raiseQuery(store, p(PERSONA.morgan), fa3.id, 'Please add the sale agreements for the two vehicles.', later(5));
    const ev = await addEvidence(store, p(PERSONA.dana), fa3.id, { kind: 'file', title: 'Sale agreements', location: 'Year-end/FA/sales.pdf', note: '' }, later(6));
    expect(ev.version).toBe(2);
    await submitRequest(store, p(PERSONA.dana), fa3.id, '', later(7));
    const accepted = await acceptRequest(store, p(PERSONA.riley), fa3.id, later(8));
    expect(accepted).toMatchObject({ status: 'accepted', acceptedBy: PERSONA.riley, acceptedAt: later(8).toISOString() });
    // Accepted is final.
    await expect(withdrawRequest(store, p(PERSONA.morgan), fa3.id, 'No longer needed for the file.')).rejects.toThrow(RuleError);
  });

  it('needs a real question', async () => {
    const { store, p, byRef } = await setup();
    await expect(raiseQuery(store, p(PERSONA.morgan), byRef('FA-03').id, 'Why?')).rejects.toThrow(/at least 10/);
    await expect(raiseQuery(store, p(PERSONA.morgan), byRef('REV-04').id, 'This one is not submitted yet.')).rejects.toThrow(/submitted evidence/);
  });
});

describe('client cannot create or accept (acceptance 3)', () => {
  const slip = (areaId: string): SlipInput => ({ areaId, ref: 'CASH-08', title: 'Bank reconciliation for the savings account', detail: '', dueAt: addDays(FIXED_NOW, 7), priority: 'normal' });

  it('rejects a request slip from the coordinator or an owner', async () => {
    const { store, p, room } = await setup();
    const cash = room.areas.find((a) => a.code === 'CASH')!;
    for (const sub of [PERSONA.dana, PERSONA.sam]) {
      await expect(createRequest(store, p(sub), room.engagement!.id, slip(cash.id))).rejects.toThrow('Only auditors write request slips.');
    }
    const made = await createRequest(store, p(PERSONA.riley), room.engagement!.id, slip(cash.id));
    expect(made).toMatchObject({ status: 'open', createdBy: PERSONA.riley, ownerSub: null, ref: 'CASH-08' });
    expect(canCreateRequestRow(PERSONA.riley, made)).toBe(true);
    for (const f of REQUEST_CREATE_EXCLUDED) expect(made[f as keyof EvidenceRequest]).toBeNull();
  });

  it('rejects accept, query and withdraw from client personas', async () => {
    const { store, p, byRef } = await setup();
    const id = byRef('REV-05').id;
    await expect(acceptRequest(store, p(PERSONA.dana), id)).rejects.toThrow('Only auditors accept evidence.');
    await expect(acceptRequest(store, p(PERSONA.sam), id)).rejects.toThrow(PermissionError);
    await expect(raiseQuery(store, p(PERSONA.sam), id, 'Is this the final version?')).rejects.toThrow('Only auditors raise queries.');
    await expect(withdrawRequest(store, p(PERSONA.dana), id, 'Not needed any more.')).rejects.toThrow('Only auditors withdraw requests.');
    expect((await reqOf(store, id)).status).toBe('submitted');
  });

  it('rejects a duplicate ref and an area from elsewhere', async () => {
    const { store, p, room } = await setup();
    const cash = room.areas.find((a) => a.code === 'CASH')!;
    await expect(createRequest(store, p(PERSONA.morgan), room.engagement!.id, { ...slip(cash.id), ref: 'cash-01' })).rejects.toThrow(/already used/);
    await expect(createRequest(store, p(PERSONA.morgan), room.engagement!.id, { ...slip('nope'), ref: 'CASH-09' })).rejects.toThrow(/not part of this engagement/);
  });
});

describe('owners, withdrawal and messages', () => {
  it('lets a coordinator assign a client owner, moving a card with evidence to in progress', async () => {
    const { store, p, byRef } = await setup();
    const rev7 = byRef('REV-07');
    await expect(assignOwner(store, p(PERSONA.sam), rev7.id, PERSONA.sam)).rejects.toThrow(/coordinator/);
    await expect(assignOwner(store, p(PERSONA.dana), rev7.id, PERSONA.morgan)).rejects.toThrow(/client side/);
    const r = await assignOwner(store, p(PERSONA.dana), rev7.id, PERSONA.sam);
    expect(r).toMatchObject({ ownerSub: PERSONA.sam, ownerName: 'Sam Taylor', status: 'open' });
  });

  it('withdraws with a reason on the thread', async () => {
    const { store, p, byRef } = await setup();
    const id = byRef('INV-06').id;
    await expect(withdrawRequest(store, p(PERSONA.morgan), id, 'short')).rejects.toThrow(/at least 10/);
    await withdrawRequest(store, p(PERSONA.morgan), id, 'Covered by the INV-01 count work.', later(1));
    const b = await loadRequest(store, id);
    expect(b.request.status).toBe('withdrawn');
    expect(b.threads.at(-1)).toMatchObject({ kind: 'withdrawal', body: 'Covered by the INV-01 count work.' });
  });

  it('lets members post and keeps strangers read-only', async () => {
    const { store, p, byRef } = await setup();
    const stranger: Person = { id: 'x', sub: 'stranger', displayName: 'Stranger', email: null, isAdmin: false, createdAt: FIXED_NOW.toISOString() };
    await expect(postMessage(store, stranger, byRef('REV-04').id, 'Hello')).rejects.toThrow(/read-only/);
    await expect(postMessage(store, p(PERSONA.priya), byRef('REV-04').id, 'I can help with this one.')).resolves.toMatchObject({ side: 'client' });
  });
});

describe('validation and policies', () => {
  it('validates the slip and evidence with the entity limits', () => {
    expect(validateSlip({ areaId: '', ref: 'x', title: 'ab', detail: '', dueAt: null, priority: 'normal' })).toEqual({
      areaId: 'Choose an audit area.',
      ref: 'Ref needs at least 2 characters.',
      title: 'Title needs at least 3 characters.',
      dueAt: 'Choose a due date.',
    });
    expect(validateSlip({ areaId: 'a', ref: 'REV 10', title: 'Fine title', detail: '', dueAt: 'x', priority: 'normal' }).ref).toMatch(/dash/);
    expect(validateEvidence({ kind: 'link', title: 'T', location: 'not a link', note: '' }).location).toMatch(/https/);
    expect(validateEvidence({ kind: 'file', title: 'T', location: '', note: '' }).location).toMatch(/File name is required/);
    expect(validateEvidence({ kind: 'note', title: 'T', location: '', note: '' }).note).toMatch(/Note is required/);
    expect(validateEvidence({ kind: 'note', title: 'T', location: '', note: 'Fine.' })).toEqual({});
  });

  it('mirrors the update policy: live rows only, request content frozen', () => {
    expect(canUpdateRequestRow({ status: 'query' })).toBe(true);
    expect(canUpdateRequestRow({ status: 'accepted' })).toBe(false);
    expect(canUpdateRequestRow({ status: 'withdrawn' })).toBe(false);
    expect(patchAllowed({ status: 'submitted', submittedAt: 'x' })).toBe(true);
    expect(patchAllowed({ title: 'changed' })).toBe(false);
    expect(patchAllowed({ dueAt: 'x' })).toBe(false);
  });

  it('picks the engagement in fieldwork', () => {
    const e = (id: string, status: 'planning' | 'fieldwork' | 'closed', periodEnd: string) => ({ id, name: id, status, periodEnd, fieldworkStart: periodEnd, fieldworkEnd: periodEnd });
    expect(pickEngagement([])).toBeNull();
    expect(pickEngagement([e('old', 'closed', '2025-06-30'), e('now', 'fieldwork', '2026-06-30'), e('next', 'planning', '2027-06-30')])?.id).toBe('now');
    expect(pickEngagement([e('a', 'closed', '2025-06-30'), e('b', 'planning', '2026-06-30')])?.id).toBe('b');
  });
});
