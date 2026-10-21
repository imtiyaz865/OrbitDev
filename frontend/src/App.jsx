import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";

const HomePage = lazy(() => import("./pages/HomePage.jsx").then((module) => ({ default: module.HomePage })));
const CommunityPage = lazy(() => import("./pages/CommunityPage.jsx").then((module) => ({ default: module.CommunityPage })));
const EventDetailPage = lazy(() => import("./pages/EventDetailPage.jsx").then((module) => ({ default: module.EventDetailPage })));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage.jsx").then((module) => ({ default: module.NotFoundPage })));
const AdminLoginPage = lazy(() => import("./pages/admin/AdminLoginPage.jsx").then((module) => ({ default: module.AdminLoginPage })));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout.jsx").then((module) => ({ default: module.AdminLayout })));
const AdminDashboardPage = lazy(() => import("./pages/admin/AdminDashboardPage.jsx").then((module) => ({ default: module.AdminDashboardPage })));
const AdminEventsPage = lazy(() => import("./pages/admin/AdminEventsPage.jsx").then((module) => ({ default: module.AdminEventsPage })));
const AdminImportPage = lazy(() => import("./pages/admin/AdminImportPage.jsx").then((module) => ({ default: module.AdminImportPage })));
const AdminEventEditorPage = lazy(() => import("./pages/admin/AdminEventEditorPage.jsx").then((module) => ({ default: module.AdminEventEditorPage })));
const AdminSettingsPage = lazy(() => import("./pages/admin/AdminSettingsPage.jsx").then((module) => ({ default: module.AdminSettingsPage })));
const AdminWeeklyUpdatePage = lazy(() => import("./pages/admin/AdminWeeklyUpdatePage.jsx").then((module) => ({ default: module.AdminWeeklyUpdatePage })));
const ResetPassword = lazy(() => import("./pages/ResetPassword.jsx"));

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/community" element={<CommunityPage />} />
      <Route path="/events/:slug" element={<EventDetailPage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboardPage />} />
        <Route path="events" element={<AdminEventsPage />} />
        <Route path="weekly-update" element={<AdminWeeklyUpdatePage />} />
        <Route path="import" element={<AdminImportPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
        <Route path="events/:id/edit" element={<AdminEventEditorPage />} />
      </Route>
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

function AppReady({ onReady }) {
  useEffect(() => onReady(), [onReady])
  return null
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [loaderVisible, setLoaderVisible] = useState(true)
  const markReady = useCallback(() => setReady(true), [])

  useEffect(() => {
    if (ready && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setLoaderVisible(false)
    }
  }, [ready])

  return (
    <>
      <Suspense fallback={<div className="orbit-route-loading" role="status">Opening ORBIT…</div>}>
        <>
          <AppRoutes />
          <AppReady onReady={markReady} />
        </>
      </Suspense>
      {loaderVisible && (
        <div
          className={`orbit-loader${ready ? ' is-exiting' : ''}`}
          role="status"
          aria-label="Loading ORBIT"
          aria-hidden={ready || undefined}
          onTransitionEnd={(event) => {
            if (event.target === event.currentTarget && event.propertyName === 'opacity') {
              setLoaderVisible(false)
            }
          }}
        >
          <span className="orbit-loader-wordmark">ORBIT</span>
          <span className="orbit-loader-orbit" aria-hidden="true" />
        </div>
      )}
    </>
  )
}
