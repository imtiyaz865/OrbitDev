import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { ThemeProvider } from "./hooks/ThemeContext.jsx";

const PublicLayout = lazy(() => import("./components/PublicLayout.jsx").then((module) => ({ default: module.PublicLayout })));
const EventsPage = lazy(() => import("./pages/EventsPage.jsx").then((module) => ({ default: module.EventsPage })));
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

function RouteLoading() {
  return <main className="route-loading" role="status">Loading</main>;
}

export default function App() {
  return (
    <ThemeProvider>
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/events/:slug" element={<EventDetailPage />} />
            <Route path="/community" element={<CommunityPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
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
        </Routes>
      </Suspense>
    </ThemeProvider>
  );
}
