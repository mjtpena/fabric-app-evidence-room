import { FIXED_NOW, testStore } from '@x10/shared/test';

import { personas, PERSONA } from '../app.config';
import { defs } from '../model';
import { seed } from '../seed';
import { allCards, buildCatalogue, isDim, lensGroups, lensKey, groupOf, todayFor } from './catalogue';
import { loadRoom } from './room';
import { pctOf } from './rules';

async function seeded() {
  const store = await testStore(defs, { personas, fn: seed, now: FIXED_NOW });
  const room = await loadRoom(store);
  return { store, room, cat: buildCatalogue(room, FIXED_NOW) };
}

/**
 * Acceptance criterion 4: the seed's ageing buckets and per-area progress. The same figures are asserted in the
 * UI by e2e/acceptance.spec.ts (shelf list), so the screen and the calculation cannot drift apart.
 */
describe('the seed', () => {
  it('has one engagement, 7 areas, 10 members, 48 requests, 59 evidence entries and 41 messages', async () => {
    const { room } = await seeded();
    expect(room.engagement?.name).toBe('FY2026 year-end audit');
    expect(room.engagement?.status).toBe('fieldwork');
    expect(room.areas.map((a) => a.code)).toEqual(['REV', 'PAY', 'FA', 'CASH', 'INV', 'TAX', 'ITGC']);
    expect(room.members.filter((m) => m.side === 'auditor')).toHaveLength(4);
    expect(room.members.filter((m) => m.side === 'client')).toHaveLength(6);
    expect(room.requests).toHaveLength(48);
    expect(room.evidence).toHaveLength(59);
    expect(room.threads).toHaveLength(41);
  });

  it('covers every status', async () => {
    const { room } = await seeded();
    const by = (s: string) => room.requests.filter((r) => r.status === s).length;
    expect({ accepted: by('accepted'), submitted: by('submitted'), query: by('query'), in_progress: by('in_progress'), open: by('open'), withdrawn: by('withdrawn') }).toEqual({
      accepted: 18,
      submitted: 7,
      query: 6,
      in_progress: 8,
      open: 7,
      withdrawn: 2,
    });
  });

  it('ages the 21 outstanding requests into every bucket', async () => {
    const { cat } = await seeded();
    expect(cat.buckets).toEqual({ not_due: 10, late_1_7: 5, late_8_14: 3, late_15: 3, settled: 27 });
    // Stable for hours after seeding: due dates sit 6 hours past whole days.
    const later = buildCatalogue((await seeded()).room, new Date(FIXED_NOW.getTime() + 5 * 3600_000));
    expect(later.buckets).toEqual(cat.buckets);
  });

  it('has the expected progress per area', async () => {
    const { cat } = await seeded();
    const progress = Object.fromEntries(cat.drawers.map((d) => [d.area.name, `${d.progress.accepted}/${d.progress.total} ${pctOf(d.progress)}%`]));
    expect(progress).toEqual({
      Revenue: '3/9 33%',
      Payroll: '3/5 60%',
      'Fixed assets': '3/6 50%',
      Cash: '3/6 50%',
      Inventory: '1/7 14%',
      Tax: '2/6 33%',
      'IT general controls': '3/7 43%',
    });
    expect(`${cat.overall.accepted}/${cat.overall.total}`).toBe('18/46');
  });

  it('has no integrity issues and a clip on every queried card', async () => {
    const { cat } = await seeded();
    const cards = allCards(cat);
    expect(cards.flatMap((c) => c.integrity)).toEqual([]);
    expect(cards.filter((c) => c.status === 'query').every((c) => c.queryAt)).toBe(true);
    // Evidence versions: CASH-01 went through one query and has round 2 evidence.
    expect(cards.find((c) => c.ref === 'CASH-01')).toMatchObject({ evidenceCount: 3, round: 2 });
  });
});

describe('lenses', () => {
  it('groups every card into exactly one lens group', async () => {
    const { cat } = await seeded();
    for (const lens of ['status', 'ageing', 'owner', 'priority'] as const) {
      const groups = lensGroups(cat, lens);
      for (const c of allCards(cat)) expect(groups.map((g) => g.key)).toContain(lensKey(c, lens));
    }
  });

  it('gives owners stable colours and a group for unassigned cards', async () => {
    const { cat } = await seeded();
    const groups = lensGroups(cat, 'owner');
    expect(groups.at(-1)).toMatchObject({ key: 'none', label: 'No owner yet' });
    expect(groups.map((g) => g.label).slice(0, -1)).toEqual(['Ana Petrov', 'Dana Brooks', 'Lee Adebayo', 'Priya Nair', 'Sam Taylor', 'Tom Fischer']);
    const unassigned = allCards(cat).filter((c) => !c.ownerSub);
    expect(unassigned.map((c) => c.ref)).toEqual(['REV-07', 'FA-05', 'INV-06', 'TAX-05']);
    expect(groupOf(unassigned[0], 'owner', groups).tone).toBe('none');
  });
});

describe('view as', () => {
  it('dims what a perspective is not waiting on', async () => {
    const { cat } = await seeded();
    const cards = allCards(cat);
    const lit = (v: Parameters<typeof isDim>[1], me = '') => cards.filter((c) => !isDim(c, v, me)).length;
    expect(lit('all')).toBe(48);
    expect(lit('auditor')).toBe(7);
    expect(lit('coordinator')).toBe(21);
    expect(lit('owner', PERSONA.sam)).toBe(cards.filter((c) => c.ownerSub === PERSONA.sam).length);
  });
});

describe('today', () => {
  it('ranks overdue high priority, queries, submissions and the weakest area', async () => {
    const { cat } = await seeded();
    const items = todayFor(cat, 'all', PERSONA.dana, FIXED_NOW);
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.length).toBeLessThanOrEqual(5);
    expect(items[0].title).toMatch(/^REV-09 Bad debt provision calculation is 17 days late/);
    expect(items.map((i) => i.id.split('-')[0])).toEqual(['late', 'query', 'submitted', 'late', 'area']);
    const area = items.find((i) => i.id.startsWith('area-'))!;
    expect(area.title).toBe('Inventory is the least complete drawer');
    expect(area.value).toBe('14%');
    expect(area.cardId).toBeNull();
  });

  it('puts the auditor’s returns first and the client’s queries first', async () => {
    const { cat } = await seeded();
    const auditor = todayFor(cat, 'auditor', PERSONA.morgan, FIXED_NOW);
    expect(auditor[0].title).toBe('7 submissions wait for the auditor; ITGC-03 is the oldest');
    const coord = todayFor(cat, 'coordinator', PERSONA.dana, FIXED_NOW);
    expect(coord[0].title).toMatch(/^New query on INV-07/);
    expect(coord[1].title).toMatch(/^Query on TAX-06/);
  });

  it('shows an owner only their own work', async () => {
    const { cat } = await seeded();
    const sam = todayFor(cat, 'owner', PERSONA.sam, FIXED_NOW);
    expect(sam.length).toBeGreaterThan(0);
    const mine = new Set(allCards(cat).filter((c) => c.ownerSub === PERSONA.sam).map((c) => c.id));
    expect(sam.every((i) => i.cardId && mine.has(i.cardId))).toBe(true);
    expect(sam[0].title).toMatch(/^Query on REV-03/);
  });
});
