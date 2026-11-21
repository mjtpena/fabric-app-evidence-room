import type { ReactNode } from 'react';

import { AppLogo } from '@x10/shared/runtime';

import { StatusMark } from '../components/marks';
import { rules, standard } from '../config';
import { BUCKET_LABEL } from '../domain/catalogue';

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2 border-t border-line py-6 md:grid-cols-[200px_minmax(0,1fr)] md:gap-8">
      <h2 className="x-legend-label m-0 pt-1 text-muted">{title}</h2>
      <div className="min-w-0 text-sm leading-6 text-fg">{children}</div>
    </section>
  );
}

/** A miniature drawer front for the header (static SVG). */
function MiniDrawer() {
  return (
    <svg viewBox="0 0 132 92" className="h-[92px] w-[132px] shrink-0" aria-hidden="true">
      <defs>
        <linearGradient id="ab-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--wood-1)" />
          <stop offset="1" stopColor="var(--wood-2)" />
        </linearGradient>
        <linearGradient id="ab-brass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--brass-1)" />
          <stop offset="1" stopColor="var(--brass-3)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="132" height="92" rx="4" fill="var(--recess)" />
      {[
        ['--lens-accepted', 0],
        ['--lens-submitted', 0],
        ['--lens-query', 0],
        ['--lens-in_progress', -7],
        ['--lens-open', 0],
        ['--lens-accepted', 0],
      ].map(([c, up], i) => (
        <g key={i}>
          <rect x={10 + i * 19} y={8 + Number(up)} width="16" height="22" rx="1.5" fill="var(--paper)" />
          <rect x={10 + i * 19} y={8 + Number(up)} width="16" height="5" rx="1.5" fill={`var(${c})`} />
          {Number(up) < 0 && <rect x={10 + i * 19 + 10} y={2 + Number(up)} width="5" height="6" rx="1" fill="var(--tab-red)" />}
        </g>
      ))}
      <rect x="3" y="24" width="126" height="65" rx="3" fill="url(#ab-wood)" />
      <rect x="40" y="31" width="52" height="18" rx="2.5" fill="url(#ab-brass)" />
      <rect x="44" y="33.5" width="44" height="13" rx="1" fill="var(--paper)" />
      <text x="66" y="43.5" textAnchor="middle" fontSize="8" fontFamily="var(--mono)" fontWeight="700" fill="var(--paper-ink)">
        REV
      </text>
      <path d="M 52 56 Q 52 64 66 64 Q 80 64 80 56 Z" fill="url(#ab-brass)" />
      <rect x="11" y="76" width="110" height="5" rx="2.5" fill="var(--groove)" />
      <rect x="11.5" y="76.5" width="44" height="4" rx="2" fill="var(--brass-2)" />
    </svg>
  );
}

/** About: the pitch, how to use it, the rules and thresholds from config, and who can do what. */
export function AboutPage() {
  return (
    <div className="mx-auto max-w-[880px]">
      <header className="mb-8 flex flex-wrap items-center gap-6">
        <MiniDrawer />
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <AppLogo size={20} />
            <span className="x-legend-label text-muted">Evidence Room</span>
          </div>
          <h1 className="x-serif m-0 text-4xl leading-tight text-fg">The audit request list as a shared room.</h1>
        </div>
      </header>

      <Block title="Why">
        <p className="m-0">
          Every year-end audit starts with a “provided by client” list: hundreds of requests for schedules, reconciliations and samples, usually a spreadsheet
          passed between auditor and client. Deadlines slip, the same document is asked for twice, queries get lost in email, and nobody knows what is really
          outstanding. Evidence Room puts the requests, their evidence and their queries in one place that both sides can see.
        </p>
      </Block>

      <Block title="How to use it">
        <ul className="m-0 list-disc space-y-1.5 pl-4 marker:text-faint">
          <li>
            <strong className="font-medium">Card catalogue.</strong> One drawer per audit area. The tops of the cards stand above each drawer, coloured by the lens:
            status, ageing, owner or priority. Overdue cards stick up with a red tab, cards with an open query wear a paper clip, accepted cards are stamped. The
            brass strip on each front fills as requests are accepted. Open a drawer to read its cards; pick a card to lift it out.
          </li>
          <li>
            <strong className="font-medium">Request slip.</strong> Auditors write new requests. Similar open or accepted requests appear as the title is typed.
          </li>
          <li>
            <strong className="font-medium">Reading desk.</strong> One request: its evidence by version, the thread, and the actions your seat allows.
          </li>
          <li>
            <strong className="font-medium">Returns trolley.</strong> Submitted evidence waiting for an auditor, oldest first, to accept or query.
          </li>
          <li>
            <strong className="font-medium">Shelf list.</strong> The weekly status report by area, with CSV and print.
          </li>
        </ul>
      </Block>

      <Block title="Rules">
        <ul className="m-0 list-disc space-y-1.5 pl-4 marker:text-faint">
          <li>Only auditors write requests, raise queries, accept and withdraw. Only the request’s owner or a client coordinator adds evidence and submits.</li>
          <li>
            A request moves <StatusMark status="open" /> → <StatusMark status="in_progress" /> (owner assigned and first evidence) → <StatusMark status="submitted" /> →{' '}
            <StatusMark status="query" /> (the auditor asks) → <StatusMark status="submitted" /> → <StatusMark status="accepted" />. Auditors can withdraw a request with a
            reason of at least <span className="num">{rules.withdrawReasonMin}</span> characters, posted to the thread. Accepted and withdrawn are final.
          </li>
          <li>
            Overdue: not submitted or accepted after the due date. Ageing buckets: {BUCKET_LABEL.not_due.toLowerCase()}, {BUCKET_LABEL.late_1_7},{' '}
            {BUCKET_LABEL.late_8_14}, {BUCKET_LABEL.late_15}. Days late are whole days past the due time, rounded up.
          </li>
          <li>Progress per area = accepted ÷ (all requests − withdrawn).</li>
          <li>
            Duplicate hints compare the words of a title (small words and plurals ignored) and show requests at least{' '}
            <span className="num">{Math.round(rules.duplicateThreshold * 100)}%</span> alike, up to {rules.duplicateLimit}.
          </li>
          <li>Evidence is never edited or deleted. Each query starts a new version, so the auditor sees what changed after asking.</li>
          <li>
            A query needs at least <span className="num">{rules.queryMin}</span> characters.
          </li>
        </ul>
      </Block>

      <Block title="Standard">
        <p className="m-0">
          It supports the evidence and documentation work in <strong className="font-medium">{standard.name}</strong> ({standard.body}):
        </p>
        <ul className="m-0 mt-2 list-disc space-y-1.5 pl-4 marker:text-faint">
          {standard.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="m-0 mt-3 rounded-lg bg-surface-sunken px-3.5 py-3 text-ui" role="note">
          Evidence Room supports the process. It is not audit, accounting, legal or compliance advice, and it does not decide whether evidence is sufficient
          or appropriate: that stays the auditor’s judgement.
        </p>
      </Block>

      <Block title="Who can do what">
        <p className="m-0">
          Everyone signed in can read the room. Who is an auditor, a coordinator or an owner comes from the engagement’s member list, which only the deployer can
          change (with SQL or the seed tool), so nobody can make themselves an auditor from the app. Auditors join as guests in the tenant.
        </p>
        <p className="m-0 mt-3 text-ui text-muted">
          The database only lets you write a request as yourself, add evidence and messages as yourself, and never edit or delete evidence or messages. Accepted
          and withdrawn requests cannot change. Seat checks (auditor, owner, coordinator) run in the app, and the shelf list flags any stamp that does not match
          the members.
        </p>
        <p className="m-0 mt-3 text-ui text-muted">
          Files: direct upload is not part of this version. Evidence records a link, a file name with its folder, or a note.
        </p>
        <p className="mt-6 text-ui text-faint">Built by Datachain Consulting for AI @Work. Runs on Microsoft Fabric Apps.</p>
      </Block>
    </div>
  );
}
