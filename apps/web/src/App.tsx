import { Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from './auth/SessionContext';
import { MusicianSessionProvider } from './auth/MusicianSession';
import { AppLayout } from './components/AppLayout';
import { MusicianLayout } from './components/MusicianLayout';
import { SignInPage } from './pages/SignInPage';
import { SignUpPage } from './pages/SignUpPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProgramPage } from './pages/ProgramPage';
import { MusiciansPage } from './pages/MusiciansPage';
import { RosterPage } from './pages/RosterPage';
import { TeamPage } from './pages/TeamPage';
import { AssignmentBoardPage } from './pages/AssignmentBoardPage';
import { FormBuilderPage } from './pages/FormBuilderPage';
import { BillingPage } from './pages/BillingPage';
import { PlatformConsolePage } from './pages/PlatformConsolePage';
import { PublicIntakePage } from './pages/PublicIntakePage';
import { MusicianSignInPage } from './pages/musician/MusicianSignInPage';
import { MusicianVerifyPage } from './pages/musician/MusicianVerifyPage';
import { MusicianPartsPage } from './pages/musician/MusicianPartsPage';
import { MusicianProfilePage } from './pages/musician/MusicianProfilePage';

export function App(): JSX.Element {
  const { session, loading } = useSession();

  if (loading) {
    return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Loading…</div>;
  }

  return (
    <Routes>
      {/* Public: the musician-facing intake form and portal. */}
      <Route path="/register/:formSlug" element={<PublicIntakePage />} />
      <Route
        path="/musician"
        element={
          <MusicianSessionProvider>
            <MusicianLayout />
          </MusicianSessionProvider>
        }
      >
        <Route index element={<Navigate to="/musician/parts" replace />} />
        <Route path="sign-in" element={<MusicianSignInPage />} />
        <Route path="verify" element={<MusicianVerifyPage />} />
        <Route path="parts" element={<MusicianPartsPage />} />
        <Route path="profile" element={<MusicianProfilePage />} />
        <Route path="*" element={<Navigate to="/musician/parts" replace />} />
      </Route>

      {session ? (
        <>
          <Route element={<AppLayout />} path="/">
            <Route index element={<DashboardPage />} />
            <Route path="roster" element={<RosterPage />} />
            <Route path="program" element={<ProgramPage />} />
            <Route path="musicians" element={<MusiciansPage />} />
            <Route path="assignments" element={<AssignmentBoardPage />} />
            <Route path="form" element={<FormBuilderPage />} />
            <Route path="team" element={<TeamPage />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
          {/* Platform staff console lives outside the tenant chrome. */}
          <Route
            path="/platform"
            element={
              session.user.isPlatformAdmin ? <PlatformConsolePage /> : <Navigate to="/" replace />
            }
          />
        </>
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
