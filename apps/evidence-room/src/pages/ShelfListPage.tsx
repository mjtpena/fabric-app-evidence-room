/**
 * Shelf list: the weekly status report for the audit meeting. Progress and ageing per area, what is outstanding
 * with whom, and any stamps out of place. Prints as a document; downloads as CSV.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Download, Printer } from 'lucide-react';

import { downloadText, formatDate, toCsv, useAsync, useNow, usePolling } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import { Button, DataState, PageHeader, Skeleton, Stat, StatStrip, Table, TableWrap, Td, Th, Tr } from '@x10/shared/ui';

import { AgeMark, StatusMark } from '../components/marks';
import { BUCKET_LABEL, STATUS_LABEL, allCards, buildCatalogue, type Catalogue } from '../domain/catalogue';
import { loadRoom } from '../domain/room';
import { BUCKETS, compareRefs, pctOf, type Bucket } from '../domain/rules';
import type { Schema } from '../model';

export function ShelfListPage() {
  const { store } = useApp<Schema>();
  const state = useAsync(() => loadRoom(store), [store]);
  usePolling(state.reload, 30_000);
  const now = useNow(60_000);
  const cat = useMemo(() => (state.data ? buildCatalogue(state.data, now) : undefined), [state.data, now]);
  return (
    <div>
      <PageHeader
        title="Shelf list"
        subtitle={cat ? `${cat.engagement?.name ?? 'No engagement'} · as of ${formatDate(now.toISOString())}` : undefined}
        actions={
          cat && (
            <div className="x-noprint flex gap-2">
              <Button icon={<Download />} onClick={() => downloadText(`shelf-list-${now.toISOString().slice(0, 10)}.csv`, csvFor(cat))}>
                CSV
              </Button>
              <Button icon={<Printer />} onClick={() => window.print()}>
                Print
              </Button>
            </div>
          )
        }
      />
      <DataState state={{ ...state, data: cat }} skeleton={<ShelfSkeleton />}>
        {(c) => <Shelf cat={c} />}
      </DataState>
    </div>
  );
}

function ShelfSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton height={86} />
      <div className="rounded-xl border border-line">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex gap-4 border-b border-line px-4 py-3 last:border-0">
            <Skeleton width={140} />
            <Skeleton width={200} />
          </div>
        ))}
      </div>
    </div>
  );
}

const LATE: Bucket[] = ['late_1_7', 'late_8_14', 'late_15'];

function csvFor(cat: Catalogue): string {
  const area = new Map(cat.drawers.map((d) => [d.area.id, d.area.name]));
  const rows = allCards(cat)
    .sort((a, b) => compareRefs(a.ref, b.ref))
    .map((c) => [c.ref, area.get(c.areaId) ?? '', c.title, STATUS_LABEL[c.status], c.priority, c.ownerName ?? '', c.dueAt.slice(0, 10), c.daysLate, BUCKET_LABEL[c.bucket], c.evidenceCount, c.submittedAt?.slice(0, 10) ?? '', c.acceptedAt?.slice(0, 10) ?? '']);
  return toCsv(['Ref', 'Area', 'Request', 'Status', 'Priority', 'Owner', 'Due', 'Days late', 'Ageing', 'Evidence', 'Submitted', 'Accepted'], rows);
}

function Shelf({ cat }: { cat: Catalogue }) {
  const cards = allCards(cat);
  const outstanding = cards.filter((c) => c.status === 'open' || c.status === 'in_progress' || c.status === 'query');
  const issues = cards.filter((c) => c.integrity.length > 0);
  return (
    <div className="space-y-10">
      <StatStrip columns={5}>
        <Stat label="Accepted" value={<span data-testid="overall-progress">{pctOf(cat.overall)}%</span>} hint={`${cat.overall.accepted} of ${cat.overall.total}`} />
        {BUCKETS.map((b) => (
          <Stat
            key={b}
            label={BUCKET_LABEL[b]}
            value={<span data-testid={`bucket-${b}`}>{cat.buckets[b]}</span>}
            tone={b === 'late_15' && cat.buckets[b] > 0 ? 'bad' : b === 'late_8_14' && cat.buckets[b] > 0 ? 'warn' : undefined}
          />
        ))}
      </StatStrip>

      <section aria-labelledby="by-area">
        <h2 id="by-area" className="m-0 mb-3 text-base font-semibold">
          By area
        </h2>
        <TableWrap label="Progress by area">
          <Table data-testid="shelf-areas">
            <thead>
              <tr>
                <Th>Area</Th>
                <Th>Progress</Th>
                <Th numeric>Accepted</Th>
                <Th numeric>With auditor</Th>
                <Th numeric>Queries</Th>
                <Th numeric>Not due</Th>
                {LATE.map((b) => (
                  <Th key={b} numeric>
                    {BUCKET_LABEL[b].replace(' days late', ' d')}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cat.drawers.map((d) => {
                const b = (k: Bucket) => d.cards.filter((c) => c.bucket === k).length;
                return (
                  <Tr key={d.area.id} data-testid="shelf-area" data-area={d.area.name}>
                    <Td>
                      <span className="flex min-w-[170px] items-baseline gap-2">
                        <span className="w-10 font-mono text-xs font-semibold">{d.area.code}</span>
                        <span>
                          <span className="block font-medium text-fg">{d.area.name}</span>
                          <span className="block text-xs text-muted">Lead {d.area.leadAuditorName}</span>
                        </span>
                      </span>
                    </Td>
                    <Td>
                      <span className="flex min-w-[140px] items-center gap-2.5">
                        <span className="relative h-2 w-24 overflow-hidden rounded-full bg-gray-4" aria-hidden="true">
                          <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pctOf(d.progress)}%`, background: 'linear-gradient(90deg, var(--brass-3), var(--brass-2) 60%, var(--brass-1))' }} />
                        </span>
                        <span className="font-mono text-xs num" data-testid="area-pct">
                          {pctOf(d.progress)}%
                        </span>
                      </span>
                    </Td>
                    <Td numeric data-testid="area-accepted">
                      {d.progress.accepted}/{d.progress.total}
                    </Td>
                    <Td numeric>{d.submitted}</Td>
                    <Td numeric>{d.queries}</Td>
                    <Td numeric>{b('not_due')}</Td>
                    {LATE.map((k) => (
                      <Td key={k} numeric className={b(k) > 0 ? (k === 'late_15' ? 'font-semibold text-bad-text' : k === 'late_8_14' ? 'text-warn-text' : undefined) : 'text-faint'} data-testid={`area-${k}`}>
                        {b(k)}
                      </Td>
                    ))}
                  </Tr>
                );
              })}
              <Tr className="font-semibold">
                <Td>All areas</Td>
                <Td>
                  <span className="font-mono text-xs num">{pctOf(cat.overall)}%</span>
                </Td>
                <Td numeric>
                  {cat.overall.accepted}/{cat.overall.total}
                </Td>
                <Td numeric>{cards.filter((c) => c.status === 'submitted').length}</Td>
                <Td numeric>{cards.filter((c) => c.status === 'query').length}</Td>
                <Td numeric>{cat.buckets.not_due}</Td>
                {LATE.map((k) => (
                  <Td key={k} numeric>
                    {cat.buckets[k]}
                  </Td>
                ))}
              </Tr>
            </tbody>
          </Table>
        </TableWrap>
      </section>

      <section aria-labelledby="outstanding">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="outstanding" className="m-0 text-base font-semibold">
            With the client
          </h2>
          <span className="text-ui text-muted num">{outstanding.length} requests, most late first</span>
        </div>
        <TableWrap label="Outstanding requests">
          <Table density="compact" data-testid="shelf-outstanding">
            <thead>
              <tr>
                <Th>Ref</Th>
                <Th>Request</Th>
                <Th>Owner</Th>
                <Th>Status</Th>
                <Th>Ageing</Th>
                <Th numeric>Due</Th>
              </tr>
            </thead>
            <tbody>
              {[...outstanding]
                .sort((a, b) => b.daysLate - a.daysLate || a.daysToDue - b.daysToDue || compareRefs(a.ref, b.ref))
                .map((c) => (
                  <Tr key={c.id}>
                    <Td className="whitespace-nowrap font-mono text-xs font-semibold">{c.ref}</Td>
                    <Td>
                      <Link to={`/requests/${c.id}`} className="block min-w-[200px] text-fg">
                        {c.title}
                      </Link>
                    </Td>
                    <Td muted className="whitespace-nowrap">
                      {c.ownerName ?? 'No owner yet'}
                    </Td>
                    <Td>
                      <StatusMark status={c.status} />
                    </Td>
                    <Td>
                      <AgeMark bucket={c.bucket} daysLate={c.daysLate} />
                    </Td>
                    <Td numeric className="whitespace-nowrap">
                      {formatDate(c.dueAt)}
                    </Td>
                  </Tr>
                ))}
            </tbody>
          </Table>
        </TableWrap>
      </section>

      <section aria-labelledby="checks">
        <h2 id="checks" className="m-0 mb-2 text-base font-semibold">
          Checks
        </h2>
        {issues.length === 0 ? (
          <p className="m-0 text-ui text-muted" data-testid="checks-clean">
            Every request was written and accepted by an auditor on this engagement, and every stamp has its date.
          </p>
        ) : (
          <ul className="m-0 list-none space-y-1.5 p-0 text-ui">
            {issues.map((c) => (
              <li key={c.id} className="text-bad-text">
                <span className="font-mono text-xs font-semibold">{c.ref}</span> {c.integrity.join(' ')}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
