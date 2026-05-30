import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { DigestPage } from '@/routes/DigestPage';
import { SignalsPage } from '@/routes/SignalsPage';
import { ReportPage } from '@/routes/ReportPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/digest?group=all" replace />} />
          <Route path="/digest" element={<DigestPage />} />
          <Route path="/signals" element={<SignalsPage />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="*" element={<Navigate to="/digest?group=all" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
