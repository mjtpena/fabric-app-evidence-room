/**
 * Rules and thresholds. The About page and the shelf list read these, so the numbers shown are the ones applied.
 */
export const rules = {
  /** Ageing buckets for outstanding requests past their due date: 1–7, 8–14 and 15+ days late. */
  ageing: { firstMax: 7, secondMax: 14 },
  /** Word-overlap (Dice) score at which an existing request is shown as similar while an auditor types a title. */
  duplicateThreshold: 0.45,
  /** At most this many similar requests are shown. */
  duplicateLimit: 3,
  /** A withdrawal needs a reason of at least this many characters, posted to the thread. */
  withdrawReasonMin: 10,
  /** A query needs a question of at least this many characters. */
  queryMin: 10,
  /** Requests due within this many days count as "due soon" for owners. */
  dueSoonDays: 3,
  /** A query raised within this many days counts as new on the coordinator's Today. */
  newQueryDays: 2,
} as const;

/** The audit standard the app supports, for the About page. */
export const standard = {
  name: 'ISA 500 (Audit Evidence) and ISA 230 (Audit Documentation)',
  body: 'International Auditing and Assurance Standards Board',
  points: [
    'The auditor must design and perform procedures to obtain sufficient appropriate audit evidence (ISA 500).',
    'The auditor must document the work done, the evidence obtained and significant matters, with who did it and when (ISA 230).',
    'The final audit file is ordinarily assembled within 60 days of the date of the auditor’s report (ISA 230, A21).',
  ],
} as const;
