/**
 * App configuration. No React imports here: tools/seed-fabric.mjs loads this file in Node to export seed rows.
 */
import type { Persona } from '@x10/shared/identity';
import type { AppConfig } from '@x10/shared/runtime';

import { defs, type Schema } from './model';
import { seed } from './seed';

/**
 * Demo personas, one per seat in the room. Dana (first, the admin) is the client coordinator: she assigns owners and
 * watches progress. Morgan and Riley are auditors (guests in a real tenant). Sam and Priya own requests.
 */
export const personas: Persona[] = [
  { sub: 'demo-coord-dana', name: 'Dana Brooks', email: 'dana@example.com', isAdmin: true, role: 'Client coordinator' },
  { sub: 'demo-auditor-morgan', name: 'Morgan Hale', email: 'morgan@example.com', isAdmin: false, role: 'Lead auditor' },
  { sub: 'demo-auditor-riley', name: 'Riley Chen', email: 'riley@example.com', isAdmin: false, role: 'Auditor' },
  { sub: 'demo-owner-sam', name: 'Sam Taylor', email: 'sam@example.com', isAdmin: false, role: 'Owner · Revenue and cash' },
  { sub: 'demo-owner-priya', name: 'Priya Nair', email: 'priya@example.com', isAdmin: false, role: 'Owner · Payroll' },
];

export const PERSONA = {
  dana: personas[0].sub,
  morgan: personas[1].sub,
  riley: personas[2].sub,
  sam: personas[3].sub,
  priya: personas[4].sub,
} as const;

export const config: AppConfig<Schema> = {
  appId: 'evidence-room',
  title: 'Evidence Room',
  tagline: 'The audit request list as a shared room: every request, its evidence, its queries.',
  defs,
  personas,
  seed,
  accent: 'olive',
  // A catalogue drawer with two index cards standing up (JSX-free so the seed tools can load this file in Node).
  logoPaths: ['M3 11h18v9H3z', 'M6 11V7h5v4', 'M13 11V4h5v7', 'M10 15.5h4'],
  // Phone tab-bar icons are attached in main.tsx to keep this file JSX-free.
  nav: [
    { to: '/', label: 'Catalogue', end: true },
    { to: '/trolley', label: 'Returns trolley' },
    { to: '/slip', label: 'Request slip' },
    { to: '/shelf', label: 'Shelf list' },
    { to: '/about', label: 'About' },
  ],
};
