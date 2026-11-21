/**
 * Returns trolley: submitted evidence waiting for an auditor, oldest first. Auditors accept or query from here;
 * everyone else sees what is with the auditor (read-only).
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox } from 'lucide-react';

import { DAY, describeError, formatDate, toMs, useAsync, useNow, usePolling, type AppErrorInfo } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import {
  Button,
  DataState,
  Dialog,
  EmptyState,
  Field,
  InlineError,
  PageHeader,
  Skeleton,
  Stat,
  StatStrip,
  Table,
  TableWrap,
  Td,
  TextArea,
  Th,
  Toast,
  Tr,
  useIsDesktop,
} from '@x10/shared/ui';

import { rules } from '../config';
import { allCards, buildCatalogue, type CardView } from '../domain/catalogue';
import { acceptRequest, loadRoom, raiseQuery, type Room } from '../domain/room';
import { actorFor } from '../domain/rules';
import { limits, type Schema } from '../model';

const daysSince = (iso: string | null, now: Date) => (iso ? Math.max(0, Math.floor((now.getTime() - toMs(iso)) / DAY)) : 0);

export function TrolleyPage() {
  const { store } = useApp<Schema>();
  const state = useAsync(() => loadRoom(store), [store]);
  usePolling(state.reload, 5000);
  return (
    <div>
      <PageHeader title="Returns trolley" subtitle="Submitted evidence waiting for an auditor, oldest first." />
      <DataState state={state} skeleton={<TrolleySkeleton />}>
        {(room) => <Trolley room={room} reload={state.reload} />}
      </DataState>
    </div>
  );
}

function TrolleySkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 rounded-xl border border-line bg-surface p-5 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>
            <Skeleton width={90} />
            <Skeleton width={48} height={24} className="mt-2" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-line bg-surface">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
            <Skeleton width={56} />
            <Skeleton width={260} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Trolley({ room, reload }: { room: Room; reload: () => Promise<void> }) {
  const { store, me } = useApp<Schema>();
  const now = useNow(60_000);
  const desktop = useIsDesktop();
  const cat = useMemo(() => buildCatalogue(room, now), [room, now]);
  const actor = actorFor(me, room.members);
  const auditor = actor.side === 'auditor';
  const areaName = new Map(cat.drawers.map((d) => [d.area.id, d.area.name]));
  const cards = allCards(cat);
  const waiting = cards.filter((c) => c.status === 'submitted').sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''));
  const queries = cards.filter((c) => c.status === 'query').length;
  const fortnight = now.getTime() - 14 * DAY;
  const acceptedRecent = cards.filter((c) => c.status === 'accepted' && c.acceptedAt && toMs(c.acceptedAt) >= fortnight).length;
  const oldest = waiting[0] ? daysSince(waiting[0].submittedAt, now) : 0;

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<AppErrorInfo | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [querying, setQuerying] = useState<CardView | null>(null);
  const [question, setQuestion] = useState('');

  const act = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await reload();
      setToast(done);
      return true;
    } catch (e) {
      setError(describeError(e));
      return false;
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <StatStrip>
        <Stat label="Waiting" value={<span data-testid="waiting-count">{waiting.length}</span>} />
        <Stat label="Oldest waiting" value={`${oldest} d`} tone={oldest >= rules.ageing.firstMax ? 'warn' : undefined} />
        <Stat label="Open queries" value={queries} />
        <Stat label="Accepted, 14 days" value={acceptedRecent} />
      </StatStrip>
      {error && <InlineError error={error} />}
      {waiting.length === 0 ? (
        <EmptyState title="The trolley is empty" icon={<Inbox />}>
          Nothing is waiting for an auditor. Submitted evidence lands here.
        </EmptyState>
      ) : !desktop ? (
        <ul className="m-0 list-none divide-y divide-[var(--line)] rounded-xl border border-line bg-surface p-0" data-testid="trolley">
          {waiting.map((c) => {
            const d = daysSince(c.submittedAt, now);
            return (
              <li key={c.id} className="px-4 py-3" data-testid="trolley-row" data-ref={c.ref}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-xs font-semibold">{c.ref}</span>
                  <span className={d >= rules.ageing.firstMax ? 'text-xs text-warn-text num' : 'text-xs text-muted num'}>waiting {d} d</span>
                </div>
                <Link to={`/requests/${c.id}`} className="mt-0.5 block font-medium text-fg">
                  {c.title}
                </Link>
                <div className="mt-0.5 text-xs text-muted">
                  {areaName.get(c.areaId)} · {c.ownerName ?? 'No owner'} · {c.evidenceCount} evidence{c.round > 1 ? ` (v${c.round})` : ''}
                </div>
                {auditor && (
                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    <Button onClick={() => (setQuerying(c), setQuestion(''))}>Query</Button>
                    <Button variant="primary" busy={busy === c.id} onClick={() => void act(c.id, () => acceptRequest(store, me, c.id), `${c.ref} accepted`)}>
                      Accept
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <TableWrap label="Waiting for an auditor">
          <Table data-testid="trolley">
            <thead>
              <tr>
                <Th>Ref</Th>
                <Th>Request</Th>
                <Th>Owner</Th>
                <Th numeric>Submitted</Th>
                <Th numeric>Waiting</Th>
                <Th numeric>Evidence</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {waiting.map((c) => {
                const d = daysSince(c.submittedAt, now);
                return (
                  <Tr key={c.id} data-testid="trolley-row" data-ref={c.ref}>
                    <Td className="whitespace-nowrap font-mono text-xs font-semibold">{c.ref}</Td>
                    <Td>
                      <span className="block min-w-[220px]">
                        <Link to={`/requests/${c.id}`} className="font-medium text-fg">
                          {c.title}
                        </Link>
                        <span className="block text-xs text-muted">
                          {areaName.get(c.areaId)}
                          {c.round > 1 ? ` · resubmitted after a query` : ''}
                        </span>
                      </span>
                    </Td>
                    <Td muted className="whitespace-nowrap">
                      {c.ownerName ?? '—'}
                    </Td>
                    <Td numeric className="whitespace-nowrap">
                      {formatDate(c.submittedAt)}
                    </Td>
                    <Td numeric className={d >= rules.ageing.firstMax ? 'text-warn-text' : undefined}>
                      {d} d
                    </Td>
                    <Td numeric>
                      {c.evidenceCount}
                      {c.round > 1 ? <span className="text-muted"> v{c.round}</span> : null}
                    </Td>
                    <Td>
                      {auditor ? (
                        <span className="flex justify-end gap-2">
                          <Button size="sm" onClick={() => (setQuerying(c), setQuestion(''))}>
                            Query
                          </Button>
                          <Button size="sm" variant="primary" busy={busy === c.id} onClick={() => void act(c.id, () => acceptRequest(store, me, c.id), `${c.ref} accepted`)}>
                            Accept
                          </Button>
                        </span>
                      ) : (
                        <span className="block text-right text-xs text-muted">With the auditor</span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}
      <Dialog
        open={!!querying}
        onClose={() => setQuerying(null)}
        title={querying ? `Query on ${querying.ref}` : 'Query'}
        description={querying?.title}
        footer={
          <>
            <Button variant="ghost" onClick={() => setQuerying(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={busy === 'query'}
              disabled={question.trim().length < rules.queryMin}
              onClick={async () => {
                if (!querying) return;
                const ok = await act('query', () => raiseQuery(store, me, querying.id, question), `Query raised on ${querying.ref}`);
                if (ok) setQuerying(null);
              }}
            >
              Send the query
            </Button>
          </>
        }
      >
        <Field label="Query for the client" htmlFor="er-trolley-q" hint={`At least ${rules.queryMin} characters.`} counter={{ value: question.length, max: limits.threadBody.max }}>
          <TextArea id="er-trolley-q" rows={4} value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={limits.threadBody.max} autoFocus />
        </Field>
      </Dialog>
      <Toast message={toast} onDone={() => setToast(null)} tone="ok" />
    </div>
  );
}
