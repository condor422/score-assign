import { Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from './auth/SessionContext';
import { AppLayout } from './components/AppLayout';
import { SignInPage } from './pages/SignInPage';
import { SignUpPage } from './pages/SignUpPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProgramPage } from './pages/ProgramPage';
import { MusiciansPage } from './pages/MusiciansPage';
import { AssignmentBoardPage } from './pages/AssignmentBoardPage';
import { FormBuilderPage } from './pages/FormBuilderPage';
import { BillingPage } from './pages/BillingPage';
import { PublicIntakePage } from './pages/PublicIntakePage';
import { MusicianPortalPage } from './pages/MusicianPortalPage';

export function App(): JSX.Element {
  const { session, loading } = useSession();

  if (loading) {
    return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Loading…</div>;
  }

  return (
    <Routes>
      {/* Public: the musician-facing intake form and portal. */}
      <Route path="/register/:formSlug" element={<PublicIntakePage />} />
      <Route path="/musician/*" element={<MusicianPortalPage />} />

      {session ? (
        <Route element={<AppLayout />} path="/">
          <Route index element={<DashboardPage />} />
          <Route path="program" element={<ProgramPage />} />
          <Route path="musicians" element={<MusiciansPage />} />
          <Route path="assignments" element={<AssignmentBoardPage />} />
          <Route path="form" element={<FormBuilderPage />} />
          <Route path="billing" element={<BillingPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      ) : (
        <>
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/sign-up" element={<SignUpPage />} />
          <Route path="*" element={<Navigate to="/sign-in" replace />} />
        </>
      )}
    </Routes>
  );
}
