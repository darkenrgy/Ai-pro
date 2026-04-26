import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useBootstrapAuth, useAuthGuards } from '@/hooks/useAuth';
import { LandingPage } from '@/pages/LandingPage';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ToastViewport } from '@/components/feedback/ToastViewport';

// Lazy-loaded pages for bundle splitting
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const JoinSessionPage = lazy(() => import('@/pages/JoinSessionPage').then((m) => ({ default: m.JoinSessionPage })));
const SessionPage = lazy(() => import('@/pages/SessionPage').then((m) => ({ default: m.SessionPage })));
const AdminDashboard = lazy(() => import('@/pages/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));

function LoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-700 border-t-cyan-400 mx-auto mb-4"></div>
        <p className="text-sm text-slate-400">Loading workspace...</p>
      </div>
    </div>
  );
}

export const App: React.FC = () => {
  useBootstrapAuth();
  useAuthGuards();

  return (
    <Router future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <ToastViewport />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Suspense fallback={<LoadingFallback />}>
                <DashboardPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/join-session"
          element={
            <ProtectedRoute>
              <Suspense fallback={<LoadingFallback />}>
                <JoinSessionPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Suspense fallback={<LoadingFallback />}>
                <SettingsPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/session/:sessionId"
          element={
            <ProtectedRoute>
              <Suspense fallback={<LoadingFallback />}>
                <SessionPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute requiredRole="ADMIN">
              <Suspense fallback={<LoadingFallback />}>
                <AdminDashboard />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route path="/app" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Router>
  );
};

export default App;
