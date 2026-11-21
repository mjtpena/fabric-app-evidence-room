import { ClipboardList, FilePlus2, Inbox, Info, Library } from 'lucide-react';
import type { ReactNode } from 'react';

import { mountApp } from '@x10/shared/runtime';

import { App } from './App';
import { config } from './app.config';
import './index.css';

/** Phone tab-bar icons, by route (kept out of app.config.ts, which the seed tools load in Node). */
const navIcons: Record<string, ReactNode> = {
  '/': <Library />,
  '/trolley': <Inbox />,
  '/slip': <FilePlus2 />,
  '/shelf': <ClipboardList />,
  '/about': <Info />,
};

mountApp({ ...config, nav: config.nav.map((n) => ({ ...n, icon: navIcons[n.to] })) }, <App />);
