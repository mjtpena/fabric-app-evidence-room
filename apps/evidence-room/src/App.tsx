import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from '@x10/shared/runtime';

import { AboutPage } from './pages/AboutPage';
import { CataloguePage } from './pages/CataloguePage';
import { ReadingDeskPage } from './pages/ReadingDeskPage';
import { ShelfListPage } from './pages/ShelfListPage';
import { SlipPage } from './pages/SlipPage';
import { TrolleyPage } from './pages/TrolleyPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<AppShell immersive><CataloguePage /></AppShell>} />
      <Route path="/requests/:id" element={<AppShell wide><ReadingDeskPage /></AppShell>} />
      <Route path="/trolley" element={<AppShell wide><TrolleyPage /></AppShell>} />
      <Route path="/slip" element={<AppShell wide><SlipPage /></AppShell>} />
      <Route path="/shelf" element={<AppShell wide><ShelfListPage /></AppShell>} />
      <Route path="/about" element={<AppShell><AboutPage /></AppShell>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
