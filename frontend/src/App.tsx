import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { DigestPage } from '@/routes/DigestPage';
import { SignalsPage } from '@/routes/SignalsPage';
import { ReportPage } from '@/routes/ReportPage';
import { ChatPage } from '@/routes/ChatPage';

/**
 * Land on the digest without throwing away the query string.
 *
 * Both redirects pointed at a fixed "/digest?group=all", so any state on the
 * incoming URL was silently dropped — "/?source=sample" arrived showing live
 * data, and a shared link lost whatever it was shared for. `group` is only
 * defaulted when the URL did not already carry one.
 */
function LandOnDigest() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  if (!params.has('group')) params.set('group', 'all');
  return <Navigate to={`/digest?${params.toString()}`} replace />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<LandOnDigest />} />
          <Route path="/digest" element={<DigestPage />} />
          <Route path="/signals" element={<SignalsPage />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="*" element={<LandOnDigest />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
