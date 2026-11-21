/** Status, ageing and priority marks: a coloured dot plus a label, in the same colours as the catalogue. */
import type { ReactNode } from 'react';

import { cx } from '@x10/shared/ui';

import { BUCKET_LABEL, STATUS_LABEL } from '../domain/catalogue';
import type { Bucket } from '../domain/rules';
import type { Priority, Status } from '../model';

function Mark({ color, children, className, testId, data }: { color: string; children: ReactNode; className?: string; testId?: string; data?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap text-ui font-medium text-fg', className)} data-testid={testId} data-value={data}>
      <span aria-hidden="true" className="inline-block size-2 shrink-0 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

export function StatusMark({ status, className }: { status: Status; className?: string }) {
  return (
    <Mark color={`var(--lens-${status})`} className={className} testId="status-mark" data={status}>
      {STATUS_LABEL[status]}
    </Mark>
  );
}

export function AgeMark({ bucket, daysLate, className }: { bucket: Bucket; daysLate: number; className?: string }) {
  if (bucket === 'settled') return <span className={cx('text-ui text-muted', className)}>—</span>;
  return (
    <Mark color={`var(--lens-${bucket})`} className={className}>
      {bucket === 'not_due' ? BUCKET_LABEL.not_due : `${daysLate} ${daysLate === 1 ? 'day' : 'days'} late`}
    </Mark>
  );
}

export function PriorityMark({ priority, className }: { priority: Priority; className?: string }) {
  if (priority === 'normal') return <span className={cx('text-ui text-muted', className)}>Normal</span>;
  return (
    <Mark color="var(--lens-high)" className={className}>
      High
    </Mark>
  );
}

/** A small swatch for legends and lens buttons. */
export const lensSwatch = (tones: string[]) =>
  `conic-gradient(${tones.map((t, i) => `var(--lens-${t}) ${(i / tones.length) * 100}% ${((i + 1) / tones.length) * 100}%`).join(', ')})`;
