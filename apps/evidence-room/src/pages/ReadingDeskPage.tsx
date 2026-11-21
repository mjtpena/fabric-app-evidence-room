/**
 * Reading desk: one request card with its evidence versions, its thread and the actions the viewer's seat allows.
 * Every action goes through src/domain/room.ts (the same checks in demo mode and in Fabric) and refetches after.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, FileText, Link2, Library, MessageSquare, Send, StickyNote } from 'lucide-react';

import { describeError, formatDate, formatDateTime, formatRelative, hasErrors, useAsync, useNow, usePolling, type AppErrorInfo } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import {
  Button,
  Dialog,
  EmptyState,
  ErrorPanel,
  Field,
  InlineError,
  Input,
  LinkButton,
  SegmentedControl,
  Select,
  Skeleton,
  SkeletonText,
  TextArea,
  Toast,
  cx,
} from '@x10/shared/ui';

import { PriorityMark, StatusMark } from '../components/marks';
import { rules } from '../config';
import {
  acceptRequest,
  addEvidence,
  assignOwner,
  loadRequest,
  postMessage,
  raiseQuery,
  submitRequest,
  validateEvidence,
  withdrawRequest,
  type EvidenceInput,
  type RequestBundle,
} from '../domain/room';
import { actorFor, daysLate, integrityIssues, isLive, isOverdue, moveBlocker, permissionBlocker, type Actor } from '../domain/rules';
import { limits, type Evidence, type EvidenceKind, type Schema, type Thread } from '../model';

export function ReadingDeskPage() {
  const { id = '' } = useParams();
  const { store } = useApp<Schema>();
  const state = useAsync(() => loadRequest(store, id), [store, id]);
  usePolling(state.reload, 5000);

  if (state.error && !state.data) {
    return (
      <div className="mx-auto max-w-[720px] py-8">
        <ErrorPanel error={state.error} onRetry={() => void state.reload()} title="This card could not be read" />
        <LinkButton to="/" className="mt-4" icon={<ArrowLeft />}>
          Back to the catalogue
        </LinkButton>
      </div>
    );
  }
  if (!state.data) return <DeskSkeleton />;
  return <Desk b={state.data} reload={state.reload} />;
}

function DeskSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div>
        <Skeleton width={180} />
        <Skeleton width="70%" height={30} className="mt-3" />
        <div className="mt-6 rounded-xl border border-line p-6">
          <SkeletonText lines={4} />
        </div>
        <div className="mt-6 space-y-3">
          <Skeleton width="90%" />
          <Skeleton width="80%" />
        </div>
      </div>
      <div className="space-y-3">
        <Skeleton height={120} />
        <Skeleton height={200} />
      </div>
    </div>
  );
}

function Desk({ b, reload }: { b: RequestBundle; reload: () => Promise<void> }) {
  const { store, me } = useApp<Schema>();
  const now = useNow(60_000);
  const actor = useMemo(() => actorFor(me, b.members), [me, b.members]);
  const r = b.request;
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<AppErrorInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
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

  const late = isOverdue(r, now) ? daysLate(r, now) : 0;
  const issues = integrityIssues(r, b.members);
  const sideOf = (sub: string) => b.members.find((m) => m.personSub === sub);

  return (
    <div className="pb-24 lg:pb-8">
      <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1.5 text-ui text-muted">
        <Link to="/" className="text-muted hover:text-fg">
          Catalogue
        </Link>
        <span aria-hidden="true">/</span>
        <Link to={`/?area=${b.area?.code ?? ''}`} className="text-muted hover:text-fg">
          {b.area?.name ?? 'Area'}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-mono text-xs text-fg">{r.ref}</span>
      </nav>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="m-0 text-2xl font-semibold leading-tight tracking-[-0.02em]">{r.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-ui text-muted">
            <span className="font-mono text-xs font-semibold text-fg">{r.ref}</span>
            <StatusMark status={r.status} />
            {late > 0 && (
              <span className="num font-medium text-bad-text" data-testid="late">
                {late} {late === 1 ? 'day' : 'days'} late
              </span>
            )}
            <PriorityMark priority={r.priority} />
            <span>Due {formatDate(r.dueAt)}</span>
          </div>
        </div>
        <LinkButton to={`/?card=${encodeURIComponent(r.ref)}&fresh=1`} icon={<Library />} size="sm" data-testid="show-in-catalogue">
          Show in the catalogue
        </LinkButton>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-8">
          <IndexCard b={b} actorSide={actor.side} />
          {issues.length > 0 && (
            <div role="note" className="rounded-lg border border-bad-line bg-bad-soft px-4 py-3 text-ui text-bad-text">
              <strong className="font-semibold">Stamps out of place.</strong> {issues.join(' ')}
            </div>
          )}
          <EvidenceSection evidence={b.evidence} threads={b.threads} name={(sub) => sideOf(sub)?.personName ?? 'Someone'} />
        </div>
        <aside className="min-w-0 space-y-6" aria-label="Actions and thread">
          <Actions b={b} actor={actor} busy={busy} run={run} />
          {error && <InlineError error={error} />}
          <ThreadSection threads={b.threads} actor={actor} requestId={r.id} busy={busy} run={run} onPost={(body) => postMessage(store, me, r.id, body)} />
        </aside>
      </div>
      <Toast message={toast} onDone={() => setToast(null)} tone="ok" />
    </div>
  );
}

/* ------------------------------------------------------------------ the card */

function IndexCard({ b, actorSide }: { b: RequestBundle; actorSide: string | null }) {
  const r = b.request;
  const created = b.members.find((m) => m.personSub === r.createdBy);
  return (
    <article className="er-paper relative overflow-hidden rounded-[6px] px-5 pb-6 pt-4 sm:px-7" style={{ ['--er-red-line' as string]: '52px', ['--er-rule-start' as string]: '52px' }} data-testid="index-card">
      <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: `var(--lens-${r.status})` }} aria-hidden="true" />
      {r.status === 'query' && (
        <svg aria-hidden="true" viewBox="0 0 20 34" className="absolute -top-2 left-8 h-12 w-7">
          <path d="M 6 30 V 6 a 4 4 0 0 1 8 0 V 26 a 2.6 2.6 0 0 1 -5.2 0 V 9" fill="none" stroke="var(--clip-2)" strokeWidth={2.4} strokeLinecap="round" />
        </svg>
      )}
      <div className="flex h-8 items-center justify-between gap-3">
        <span className="font-mono text-sm font-semibold tracking-wide">{r.ref}</span>
        <span className="er-muted text-xs">{b.area?.name}</span>
      </div>
      <p className="m-0 mt-[14px] whitespace-pre-line text-[15px] leading-6">{r.detail || r.title}</p>
      <dl className="m-0 mt-2 grid grid-cols-2 gap-x-6 text-[13px] leading-6 sm:grid-cols-4">
        <Item label="Owner">{r.ownerName ?? 'Not assigned'}</Item>
        <Item label="Due">{formatDate(r.dueAt)}</Item>
        <Item label="Asked by">{created?.personName ?? 'Auditor'}</Item>
        <Item label="Lead">{b.area?.leadAuditorName ?? '—'}</Item>
      </dl>
      {r.status === 'accepted' && (
        <div className="mt-3 flex justify-end">
        <div className="er-stamp px-3 py-1 text-center font-mono" data-testid="accepted-stamp">
          <div className="text-base font-bold tracking-[0.2em]">ACCEPTED</div>
          <div className="text-[10px] tracking-wider">{formatDate(r.acceptedAt)}</div>
        </div>
        </div>
      )}
      {actorSide === null && <p className="er-muted m-0 mt-3 text-xs">You are not a member of this engagement, so the card is read-only.</p>}
    </article>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="er-muted text-[11px] uppercase tracking-wider">{label}</dt>
      <dd className="m-0 truncate font-medium">{children}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ evidence */

const KIND_ICON: Record<EvidenceKind, ReactNode> = {
  link: <Link2 className="size-4" aria-hidden="true" />,
  file: <FileText className="size-4" aria-hidden="true" />,
  note: <StickyNote className="size-4" aria-hidden="true" />,
};

function EvidenceSection({ evidence, threads, name }: { evidence: Evidence[]; threads: Thread[]; name: (sub: string) => string }) {
  const rounds = [...new Set(evidence.map((e) => e.version))].sort((a, b) => b - a);
  const queries = threads.filter((t) => t.kind === 'query');
  return (
    <section aria-labelledby="ev-h">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="ev-h" className="m-0 text-base font-semibold">
          Evidence
        </h2>
        <span className="text-ui text-muted num">
          {evidence.length} {evidence.length === 1 ? 'item' : 'items'}
          {rounds.length > 1 ? ` · ${rounds.length} rounds` : ''}
        </span>
      </div>
      {evidence.length === 0 ? (
        <EmptyState title="No evidence yet" compact bordered icon={<FileText />}>
          The owner adds links, file names or notes here, then submits to the auditor.
        </EmptyState>
      ) : (
        <div className="space-y-5" data-testid="evidence">
          {rounds.map((v) => (
            <div key={v}>
              <div className="x-legend-label mb-2 text-muted">
                Version {v}
                {v > 1 && queries[v - 2] ? ` · after the query of ${formatDate(queries[v - 2].at)}` : v === 1 ? ' · first submission' : ''}
              </div>
              <ul className="m-0 list-none divide-y divide-[var(--line)] rounded-xl border border-line bg-surface p-0">
                {evidence
                  .filter((e) => e.version === v)
                  .map((e) => (
                    <li key={e.id} className="flex gap-3 px-4 py-3" data-testid="evidence-row">
                      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-gray-3 text-muted">{KIND_ICON[e.kind]}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="font-medium text-fg">{e.title}</span>
                          <span className="text-xs text-muted">
                            {name(e.addedBy)} · {formatDate(e.addedAt)}
                          </span>
                        </div>
                        {e.kind === 'link' && (
                          <a href={e.location} target="_blank" rel="noreferrer noopener" className="mt-0.5 inline-flex max-w-full items-center gap-1 text-ui text-brand-text">
                            <span className="truncate">{e.location}</span>
                            <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                          </a>
                        )}
                        {e.kind === 'file' && <div className="mt-0.5 truncate font-mono text-xs text-muted">{e.location}</div>}
                        {e.note && <p className="m-0 mt-1 text-ui text-fg">{e.note}</p>}
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ actions */

type Run = (key: string, fn: () => Promise<unknown>, done: string) => Promise<boolean>;

function Actions({ b, actor, busy, run }: { b: RequestBundle; actor: Actor; busy: string | null; run: Run }) {
  const { store, me } = useApp<Schema>();
  const r = b.request;
  const [query, setQuery] = useState<string | null>(null);
  const [withdraw, setWithdraw] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const ctx = { hasOwner: !!r.ownerSub, evidenceCount: b.evidence.length };

  if (!actor.side) return <Panel title="Read-only">You are not in this engagement’s room. Ask the client coordinator to add you.</Panel>;
  if (!isLive(r.status)) {
    return (
      <Panel title={r.status === 'accepted' ? 'Accepted' : 'Withdrawn'}>
        {r.status === 'accepted' ? `Accepted on ${formatDate(r.acceptedAt)} by ${b.members.find((m) => m.personSub === r.acceptedBy)?.personName ?? 'an auditor'}. The card is closed.` : 'Withdrawn by the auditor; the reason is on the thread.'}
      </Panel>
    );
  }

  if (actor.side === 'auditor') {
    const canAccept = !moveBlocker(r.status, 'accept', ctx);
    return (
      <Panel title={r.status === 'submitted' ? 'Review' : 'With the client'} testId="actions">
        {r.status !== 'submitted' && <p className="m-0 mb-3 text-ui text-muted">Nothing to review until the client submits. You can still withdraw the request.</p>}
        {r.status === 'submitted' && query === null && (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" busy={busy === 'accept'} disabled={!canAccept} onClick={() => void run('accept', () => acceptRequest(store, me, r.id), `${r.ref} accepted`)}>
              Accept
            </Button>
            <Button onClick={() => setQuery('')}>Raise a query</Button>
          </div>
        )}
        {query !== null && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run('query', () => raiseQuery(store, me, r.id, query), `Query raised on ${r.ref}`);
              if (ok) setQuery(null);
            }}
          >
            <Field label="Query for the client" htmlFor="er-query" counter={{ value: query.length, max: limits.threadBody.max }} hint={`At least ${rules.queryMin} characters.`}>
              <TextArea id="er-query" rows={4} value={query} onChange={(e) => setQuery(e.target.value)} maxLength={limits.threadBody.max} autoFocus />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" variant="primary" busy={busy === 'query'} disabled={query.trim().length < rules.queryMin}>
                Send the query
              </Button>
              <Button variant="ghost" onClick={() => setQuery(null)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
        <div className="mt-4 border-t border-line pt-3">
          <Button variant="ghost" size="sm" className="text-bad-text" onClick={() => setWithdraw(true)}>
            Withdraw the request…
          </Button>
        </div>
        <Dialog
          open={withdraw}
          onClose={() => setWithdraw(false)}
          title={`Withdraw ${r.ref}`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setWithdraw(false)}>
                Keep it
              </Button>
              <Button
                variant="danger"
                busy={busy === 'withdraw'}
                disabled={reason.trim().length < rules.withdrawReasonMin}
                onClick={async () => {
                  const ok = await run('withdraw', () => withdrawRequest(store, me, r.id, reason), `${r.ref} withdrawn`);
                  if (ok) setWithdraw(false);
                }}
              >
                Withdraw
              </Button>
            </>
          }
        >
          <Field label="Reason (posted to the thread)" htmlFor="er-reason" hint={`At least ${rules.withdrawReasonMin} characters.`}>
            <TextArea id="er-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={limits.threadBody.max} />
          </Field>
        </Dialog>
      </Panel>
    );
  }

  // Client side.
  const mayProvide = !permissionBlocker(actor, 'evidence', r);
  const submitBlock = moveBlocker(r.status, 'submit', ctx);
  return (
    <div className="space-y-6">
      {actor.coordinator && <OwnerPicker b={b} busy={busy} run={run} />}
      {r.status === 'submitted' ? (
        <Panel title="With the auditor" testId="actions">
          Submitted on {formatDate(r.submittedAt)}. More evidence can be added if the auditor raises a query.
        </Panel>
      ) : !mayProvide ? (
        <Panel title="Provided by the owner" testId="actions">
          {r.ownerName ? `${r.ownerName} provides the evidence for this request.` : 'A coordinator assigns an owner first.'}
        </Panel>
      ) : (
        <Panel title={r.status === 'query' ? 'Answer the query' : 'Provide evidence'} testId="actions">
          <EvidenceForm busy={busy} run={run} requestId={r.id} />
          <div className="mt-4 border-t border-line pt-4">
            <Field label="Note to the auditor (optional)" htmlFor="er-submit-note">
              <Input id="er-submit-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={limits.threadBody.max} />
            </Field>
          </div>
          {/* Phones: the primary action stays at the bottom of the screen, above the tab bar. */}
          <div className={submitBlock ? undefined : "sticky bottom-[calc(var(--x-bottom-inset,0px)+8px)] z-10 -mx-1 rounded-xl bg-surface px-1 pb-1 lg:static lg:mx-0 lg:p-0"}>
            <Button
              variant="primary"
              className="w-full"
              size="lg"
              busy={busy === 'submit'}
              disabled={!!submitBlock}
              title={submitBlock ?? undefined}
              onClick={async () => {
                const ok = await run('submit', () => submitRequest(store, me, r.id, note), `${r.ref} submitted to the auditor`);
                if (ok) setNote('');
              }}
            >
              Submit to the auditor
            </Button>
            {submitBlock && <p className="m-0 mt-2 text-xs text-muted">{submitBlock}</p>}
          </div>
        </Panel>
      )}
    </div>
  );
}

function OwnerPicker({ b, busy, run }: { b: RequestBundle; busy: string | null; run: Run }) {
  const { store, me } = useApp<Schema>();
  const r = b.request;
  const clients = b.members.filter((m) => m.side === 'client').sort((a, z) => a.personName.localeCompare(z.personName));
  const [sub, setSub] = useState(r.ownerSub ?? '');
  return (
    <Panel title="Owner">
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (sub) void run('assign', () => assignOwner(store, me, r.id, sub), `Owner set on ${r.ref}`);
        }}
      >
        <div className="min-w-0 flex-1">
          <label htmlFor="er-owner" className="sr-only">
            Owner
          </label>
          <Select id="er-owner" value={sub} onChange={(e) => setSub(e.target.value)}>
            <option value="">Choose an owner…</option>
            {clients.map((m) => (
              <option key={m.personSub} value={m.personSub}>
                {m.personName}
                {m.role === 'coordinator' ? ' (coordinator)' : ''}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" busy={busy === 'assign'} disabled={!sub || sub === r.ownerSub}>
          Assign
        </Button>
      </form>
    </Panel>
  );
}

function EvidenceForm({ busy, run, requestId }: { busy: string | null; run: Run; requestId: string }) {
  const { store, me } = useApp<Schema>();
  const empty: EvidenceInput = { kind: 'link', title: '', location: '', note: '' };
  const [v, setV] = useState<EvidenceInput>(empty);
  const [touched, setTouched] = useState(false);
  const errors = validateEvidence(v);
  const show = (k: keyof EvidenceInput) => (touched ? errors[k] : undefined);
  return (
    <form
      data-testid="evidence-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setTouched(true);
        if (hasErrors(errors)) return;
        const ok = await run('evidence', () => addEvidence(store, me, requestId, v), 'Evidence added to the card');
        if (ok) {
          setV({ ...empty, kind: v.kind });
          setTouched(false);
        }
      }}
    >
      <SegmentedControl<EvidenceKind>
        label="Kind of evidence"
        value={v.kind}
        onChange={(kind) => setV({ ...v, kind, location: '' })}
        fullWidth
        size="sm"
        className="mb-4"
        options={[
          { value: 'link', label: 'Link' },
          { value: 'file', label: 'File name' },
          { value: 'note', label: 'Note' },
        ]}
      />
      <Field label="Title" htmlFor="er-ev-title" error={show('title')} required>
        <Input id="er-ev-title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} maxLength={limits.evidenceTitle.max} invalid={!!show('title')} />
      </Field>
      {v.kind !== 'note' && (
        <Field
          label={v.kind === 'link' ? 'Link' : 'File name and where it lives'}
          htmlFor="er-ev-loc"
          error={show('location')}
          hint={v.kind === 'file' ? 'Direct upload is not available yet: record the name and folder.' : undefined}
          required
        >
          <Input
            id="er-ev-loc"
            value={v.location}
            onChange={(e) => setV({ ...v, location: e.target.value })}
            maxLength={limits.evidenceLocation.max}
            placeholder={v.kind === 'link' ? 'https://' : 'Year-end/Area/file-name.xlsx'}
            invalid={!!show('location')}
            inputMode={v.kind === 'link' ? 'url' : undefined}
          />
        </Field>
      )}
      <Field label={v.kind === 'note' ? 'Note' : 'Note (optional)'} htmlFor="er-ev-note" error={show('note')} counter={{ value: v.note.length, max: limits.evidenceNote.max }}>
        <TextArea id="er-ev-note" rows={v.kind === 'note' ? 4 : 2} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} maxLength={limits.evidenceNote.max} invalid={!!show('note')} />
      </Field>
      <Button type="submit" busy={busy === 'evidence'}>
        Add to the card
      </Button>
    </form>
  );
}

function Panel({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4" data-testid={testId} aria-label={title}>
      <h2 className="x-legend-label m-0 mb-3 text-muted">{title}</h2>
      <div className="text-sm text-fg">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ thread */

function ThreadSection({
  threads,
  actor,
  requestId,
  busy,
  run,
  onPost,
}: {
  threads: Thread[];
  actor: Actor;
  requestId: string;
  busy: string | null;
  run: Run;
  onPost: (body: string) => Promise<unknown>;
}) {
  const [body, setBody] = useState('');
  return (
    <section aria-labelledby={`th-${requestId}`}>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id={`th-${requestId}`} className="m-0 text-base font-semibold">
          Thread
        </h2>
        <span className="text-ui text-muted num">{threads.length}</span>
      </div>
      {threads.length === 0 ? (
        <p className="m-0 flex items-center gap-2 text-ui text-muted">
          <MessageSquare className="size-4" aria-hidden="true" /> No messages yet.
        </p>
      ) : (
        <ol className="m-0 list-none space-y-3 p-0" data-testid="thread">
          {threads.map((t) => (
            <li
              key={t.id}
              data-testid="thread-item"
              data-kind={t.kind}
              className={cx(
                'rounded-xl border px-3.5 py-2.5',
                t.kind === 'query' ? 'border-[color-mix(in_oklab,var(--lens-query)_45%,transparent)] bg-[color-mix(in_oklab,var(--lens-query)_9%,var(--surface))]' : t.kind === 'withdrawal' ? 'border-line bg-surface-sunken' : 'border-line bg-surface',
                t.side === 'client' && 'sm:ml-6',
                t.side === 'auditor' && 'sm:mr-6',
              )}
            >
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
                <span className="font-medium text-fg">
                  {t.byName} <span className="font-normal text-muted">· {t.side === 'auditor' ? 'Auditor' : 'Client'}</span>
                  {t.kind !== 'message' && <span className="ml-1.5 x-legend-label rounded-[5px] bg-gray-3 px-1.5 py-px text-[10px] text-muted">{t.kind === 'query' ? 'Query' : 'Withdrawal'}</span>}
                </span>
                <time dateTime={t.at} title={formatDateTime(t.at)} className="text-muted">
                  {formatRelative(t.at)}
                </time>
              </div>
              <p className="m-0 whitespace-pre-line text-sm leading-5 text-fg">{t.body}</p>
            </li>
          ))}
        </ol>
      )}
      {actor.side && (
        <form
          className="mt-3 flex items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run('post', () => onPost(body), 'Message posted');
            if (ok) setBody('');
          }}
        >
          <div className="min-w-0 flex-1">
            <label htmlFor="er-post" className="sr-only">
              Message
            </label>
            <TextArea id="er-post" rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write to the thread…" maxLength={limits.threadBody.max} />
          </div>
          <Button type="submit" icon={<Send />} busy={busy === 'post'} disabled={!body.trim()} aria-label="Post message" />
        </form>
      )}
    </section>
  );
}
