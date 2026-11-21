import { AppMarker } from './AppMarker.js';
import { AuditArea } from './AuditArea.js';
import { Engagement } from './Engagement.js';
import { Evidence } from './Evidence.js';
import { EvidenceRequest } from './EvidenceRequest.js';
import { Member } from './Member.js';
import { Person } from './Person.js';
import { Thread } from './Thread.js';

export type AppSchema = {
  Person: Person;
  AppMarker: AppMarker;
  Engagement: Engagement;
  AuditArea: AuditArea;
  Member: Member;
  EvidenceRequest: EvidenceRequest;
  Evidence: Evidence;
  Thread: Thread;
};

export const schema = [Person, AppMarker, Engagement, AuditArea, Member, EvidenceRequest, Evidence, Thread];
