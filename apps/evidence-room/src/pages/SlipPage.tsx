/**
 * Request slip: an auditor writes a new request. While the title is typed, similar open or accepted requests in the
 * engagement are shown beside it, so the same document is not asked for twice. Only auditors see the form; the
 * domain refuses everyone else too.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Copy, FilePlus2 } from 'lucide-react';

import { addDays, describeError, formatDate, fromDateInput, hasErrors, toDateInput, useAsync, type AppErrorInfo } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import { Button, DataState, EmptyState, Field, InlineError, Input, LinkButton, PageHeader, SegmentedControl, Select, Skeleton, TextArea } from '@x10/shared/ui';

import { StatusMark } from '../components/marks';
import { rules } from '../config';
import { createRequest, loadRoom, validateSlip, type Room, type SlipInput } from '../domain/room';
import { actorFor, nextRef, partyOf, similarRequests } from '../domain/rules';
import { limits, type Priority, type Schema } from '../model';

export function SlipPage() {
  const { store } = useApp<Schema>();
  const state = useAsync(() => loadRoom(store), [store]);
  return (
    <div>
      <PageHeader title="Request slip" />
      <DataState
        state={state}
        skeleton={
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Skeleton height={420} />
            <Skeleton height={180} />
          </div>
        }
      >
        {(room) => <Slip room={room} />}
      </DataState>
    </div>
  );
}

/** End of the chosen day, local time, so a request due "20 Nov" is not late until that day is over. */
const endOfDay = (value: string) => {
  const iso = fromDateInput(value);
  return iso ? new Date(new Date(iso).getTime() + (24 * 60 - 1) * 60_000).toISOString() : null;
};

function Slip({ room }: { room: Room }) {
  const { store, me } = useApp<Schema>();
  const navigate = useNavigate();
  const actor = actorFor(me, room.members);
  const party = partyOf(actor);
  const [areaId, setAreaId] = useState(room.areas[0]?.id ?? '');
  const area = room.areas.find((a) => a.id === areaId) ?? null;
  const refsInArea = room.requests.filter((r) => r.areaId === areaId).map((r) => r.ref);
  const suggested = area ? nextRef(area.code, refsInArea) : '';
  const [ref, setRef] = useState(suggested);
  const [refTouched, setRefTouched] = useState(false);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [due, setDue] = useState(toDateInput(addDays(new Date(), 14)));
  const [priority, setPriority] = useState<Priority>('normal');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppErrorInfo | null>(null);

  useEffect(() => {
    if (!refTouched) setRef(suggested);
  }, [suggested, refTouched]);

  const input: SlipInput = { areaId, ref, title, detail, dueAt: due ? endOfDay(due) : null, priority };
  const errors = validateSlip(input);
  const taken = room.requests.some((r) => r.ref.toUpperCase() === ref.trim().toUpperCase());
  const show = (k: keyof SlipInput) => (touched ? errors[k] : undefined);
  const hints = useMemo(() => similarRequests(title, room.requests), [title, room.requests]);
  const areaName = new Map(room.areas.map((a) => [a.id, a]));

  if (party !== 'auditor') {
    return (
      <EmptyState
        title="Request slips are written by auditors"
        icon={<FilePlus2 />}
        action={
          <LinkButton to="/" variant="primary">
            Back to the catalogue
          </LinkButton>
        }
      >
        {party === 'viewer'
          ? 'You are not a member of this engagement.'
          : `You are on the client side${party === 'coordinator' ? ' as the coordinator' : ''}: you answer requests rather than raise them.`}
      </EmptyState>
    );
  }

  const submit = async () => {
    setTouched(true);
    if (hasErrors(errors) || taken) return;
    setBusy(true);
    setError(null);
    try {
      const made = await createRequest(store, me, room.engagement!.id, input);
      navigate(`/?card=${encodeURIComponent(made.ref)}&fresh=1`);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const hintList = (
    <section aria-label="Already in the catalogue" data-testid="similar" aria-live="polite">
      <h2 className="x-legend-label m-0 mb-2 text-muted">Already in the catalogue</h2>
      {hints.length === 0 ? (
        <p className="m-0 text-ui text-muted">{title.trim().split(/\s+/).length < 2 ? 'Similar requests show here as you type a title.' : 'Nothing similar. This looks new.'}</p>
      ) : (
        <ul className="m-0 list-none space-y-2 p-0">
          {hints.map((h) => (
            <li key={h.request.id} className="rounded-xl border border-warn-line bg-warn-soft px-3.5 py-2.5" data-testid="similar-item" data-ref={h.request.ref}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-xs font-semibold text-fg">{h.request.ref}</span>
                <span className="text-xs text-muted num">{Math.round(h.score * 100)}% alike</span>
              </div>
              <Link to={`/requests/${h.request.id}`} className="mt-0.5 block text-sm font-medium text-fg">
                {h.request.title}
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted">
                <StatusMark status={h.request.status} />
                <span>{areaName.get(h.request.areaId)?.name}</span>
                <span>due {formatDate(h.request.dueAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="grid gap-8 pb-24 lg:grid-cols-[minmax(0,1fr)_340px] lg:pb-0">
      <form
        className="er-paper rounded-[6px] px-5 pb-5 pt-4 sm:px-7"
        style={{ ['--er-red-line' as string]: '48px', ['--er-rule-start' as string]: '9999px' }}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        noValidate
        data-testid="slip-form"
      >
        <div className="mb-6 flex h-8 items-center justify-between">
          <span className="font-mono text-sm font-semibold tracking-wide">{ref || '—'}</span>
          <span className="er-muted text-xs">{room.engagement?.name}</span>
        </div>
        <div className="grid gap-x-4 sm:grid-cols-[minmax(0,1fr)_160px]">
          <Field label="Audit area" htmlFor="er-area" error={show('areaId')} required>
            <Select id="er-area" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
              {room.areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ref" htmlFor="er-ref" error={show('ref') ?? (taken ? `${ref.trim().toUpperCase()} is already used.` : undefined)} required>
            <Input
              id="er-ref"
              value={ref}
              onChange={(e) => {
                setRef(e.target.value.toUpperCase());
                setRefTouched(true);
              }}
              maxLength={limits.ref.max}
              className="font-mono"
              invalid={!!show('ref') || taken}
            />
          </Field>
        </div>
        <Field label="Title" htmlFor="er-title" error={show('title')} required counter={{ value: title.length, max: limits.title.max }}>
          <Input id="er-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={limits.title.max} invalid={!!show('title')} autoComplete="off" />
        </Field>
        <div className="mb-4 lg:hidden">{hintList}</div>
        <Field label="What exactly is needed" htmlFor="er-detail" error={show('detail')} counter={{ value: detail.length, max: limits.detail.max }}>
          <TextArea id="er-detail" rows={4} value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={limits.detail.max} />
        </Field>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Due" htmlFor="er-due" error={show('dueAt')} required>
            <Input id="er-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} invalid={!!show('dueAt')} />
          </Field>
          <div className="mb-4">
            <div className="mb-1.5 text-ui font-medium text-fg">Priority</div>
            <SegmentedControl<Priority>
              label="Priority"
              value={priority}
              onChange={setPriority}
              fullWidth
              options={[
                { value: 'normal', label: 'Normal' },
                { value: 'high', label: 'High' },
              ]}
            />
          </div>
        </div>
        {error && <InlineError error={error} className="mb-3" />}
        <div className="fixed inset-x-0 bottom-[var(--x-bottom-inset,0px)] z-20 border-t border-line bg-surface px-4 py-3 lg:static lg:border-0 lg:bg-transparent lg:p-0">
          <Button type="submit" variant="primary" size="lg" busy={busy} className="w-full lg:w-auto" icon={<FilePlus2 />}>
            File the slip
          </Button>
        </div>
        {hints.length > 0 && (
          <p className="m-0 mt-3 flex items-center gap-1.5 text-xs er-muted">
            <Copy className="size-3.5" aria-hidden="true" /> {hints.length === 1 ? 'A similar request exists' : `${hints.length} similar requests exist`}; check it before filing a second.
          </p>
        )}
      </form>
      <aside className="hidden lg:block">
        {hintList}
        <p className="mt-6 text-ui text-muted">
          Matching compares the words of the title (plurals and small words ignored) and shows requests at least {Math.round(rules.duplicateThreshold * 100)}% alike.
        </p>
      </aside>
    </div>
  );
}
