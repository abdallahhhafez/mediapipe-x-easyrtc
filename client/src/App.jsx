import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth, homeFor } from './store/auth';
import { attachLiveSocket } from './store/live';
import { closeSocket } from './lib/socket';
import { Spinner } from './components/ui';
import AppShell from './components/AppShell';
import PatientShell from './components/PatientShell';
import AlertToaster from './components/AlertToaster';
import Login from './pages/Login';
import Station from './pages/nurse/Station';
import Monitor from './pages/nurse/Monitor';
import Alerts from './pages/nurse/Alerts';
import PatientHome from './pages/patient/Home';
import DevPanel from './pages/patient/DevPanel';

export default function App() {
  const { user, loading, restore } = useAuth();

  useEffect(() => {
    restore();
  }, [restore]);

  // The telemetry socket is opened once a session exists and closed on sign
  // out, so a signed-out tab is never holding a ward subscription open.
  useEffect(() => {
    if (!user) return closeSocket();
    return attachLiveSocket();
  }, [user]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner className="h-6 w-6 text-muted" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return user.role === 'patient' ? <PatientRoutes /> : <NurseRoutes />;
}

function NurseRoutes() {
  return (
    <AppShell>
      <AlertToaster />
      <Routes>
        <Route path="/station" element={<Station />} />
        <Route path="/station/:patientId" element={<Monitor />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="*" element={<Navigate to="/station" replace />} />
      </Routes>
    </AppShell>
  );
}

function PatientRoutes() {
  return (
    <PatientShell>
      <Routes>
        <Route path="/home" element={<PatientHome />} />
        <Route path="/home/dev" element={<DevPanel />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </PatientShell>
  );
}

export { homeFor };
