/**
 * App data types and runtime entity definitions. Keep these in step with rayfin/data/*.ts:
 * every field listed here must exist on the entity class with the matching decorator.
 * Dates are ISO strings in the app; optional fields are `| null`.
 */
import type { EntityDefs } from '@x10/shared/data';
import { AppMarkerDef, PersonDef, type AppMarker, type Person } from '@x10/shared/identity';

/** The same numbers as the @text decorators on the entities. */
export const limits = {
  engagementName: { min: 3, max: 120 },
  areaName: { min: 3, max: 60 },
  areaCode: { min: 2, max: 6 },
  leadAuditorName: { min: 1, max: 100 },
  personName: { min: 1, max: 100 },
  ref: { min: 2, max: 12 },
  title: { min: 3, max: 150 },
  detail: { max: 1500 },
  ownerName: { max: 100 },
  evidenceTitle: { min: 1, max: 200 },
  evidenceLocation: { max: 500 },
  evidenceNote: { max: 1000 },
  threadBody: { min: 1, max: 1500 },
} as const;

export const ENGAGEMENT_STATUSES = ['planning', 'fieldwork', 'completion', 'closed'] as const;
export type EngagementStatus = (typeof ENGAGEMENT_STATUSES)[number];

export const SIDES = ['auditor', 'client'] as const;
export type Side = (typeof SIDES)[number];

export const MEMBER_ROLES = ['lead', 'member', 'coordinator'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const PRIORITIES = ['normal', 'high'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const STATUSES = ['open', 'in_progress', 'submitted', 'query', 'accepted', 'withdrawn'] as const;
export type Status = (typeof STATUSES)[number];

export const EVIDENCE_KINDS = ['link', 'file', 'note'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const THREAD_KINDS = ['message', 'query', 'withdrawal'] as const;
export type ThreadKind = (typeof THREAD_KINDS)[number];

export interface Engagement {
  id: string;
  name: string;
  periodEnd: string;
  fieldworkStart: string;
  fieldworkEnd: string;
  status: EngagementStatus;
}

export interface AuditArea {
  id: string;
  engagementId: string;
  name: string;
  code: string;
  position: number;
  leadAuditorName: string;
}

export interface Member {
  id: string;
  engagementId: string;
  personSub: string;
  personName: string;
  side: Side;
  role: MemberRole;
}

export interface EvidenceRequest {
  id: string;
  engagementId: string;
  areaId: string;
  ref: string;
  title: string;
  detail: string;
  ownerSub: string | null;
  ownerName: string | null;
  dueAt: string;
  priority: Priority;
  status: Status;
  createdBy: string;
  submittedAt: string | null;
  acceptedAt: string | null;
  acceptedBy: string | null;
}

export interface Evidence {
  id: string;
  requestId: string;
  kind: EvidenceKind;
  title: string;
  location: string;
  note: string | null;
  addedBy: string;
  addedAt: string;
  version: number;
}

export interface Thread {
  id: string;
  requestId: string;
  bySub: string;
  byName: string;
  side: Side;
  kind: ThreadKind;
  body: string;
  at: string;
}

export type Schema = {
  Person: Person;
  AppMarker: AppMarker;
  Engagement: Engagement;
  AuditArea: AuditArea;
  Member: Member;
  EvidenceRequest: EvidenceRequest;
  Evidence: Evidence;
  Thread: Thread;
};

export const defs: EntityDefs<Schema> = {
  Person: PersonDef,
  AppMarker: AppMarkerDef,
  Engagement: {
    name: 'Engagement',
    fields: { id: 'uuid', name: 'text', periodEnd: 'date', fieldworkStart: 'date', fieldworkEnd: 'date', status: 'set' },
  },
  AuditArea: {
    name: 'AuditArea',
    fields: { id: 'uuid', engagementId: 'uuid', name: 'text', code: 'text', position: 'int', leadAuditorName: 'text' },
  },
  Member: {
    name: 'Member',
    fields: { id: 'uuid', engagementId: 'uuid', personSub: 'text', personName: 'text', side: 'set', role: 'set' },
  },
  EvidenceRequest: {
    name: 'EvidenceRequest',
    fields: {
      id: 'uuid',
      engagementId: 'uuid',
      areaId: 'uuid',
      ref: 'text',
      title: 'text',
      detail: 'text',
      ownerSub: 'text',
      ownerName: 'text',
      dueAt: 'date',
      priority: 'set',
      status: 'set',
      createdBy: 'text',
      submittedAt: 'date',
      acceptedAt: 'date',
      acceptedBy: 'text',
    },
  },
  Evidence: {
    name: 'Evidence',
    fields: {
      id: 'uuid',
      requestId: 'uuid',
      kind: 'set',
      title: 'text',
      location: 'text',
      note: 'text',
      addedBy: 'text',
      addedAt: 'date',
      version: 'int',
    },
  },
  Thread: {
    name: 'Thread',
    fields: { id: 'uuid', requestId: 'uuid', bySub: 'text', byName: 'text', side: 'set', kind: 'set', body: 'text', at: 'date' },
  },
};
