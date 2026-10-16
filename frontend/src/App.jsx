import { Route, Routes } from 'react-router-dom'
import { ThemeProvider } from './hooks/ThemeContext.jsx'
import { HomePage } from './pages/HomePage.jsx'
import { CommunityPage } from './pages/CommunityPage.jsx'
import { EventDetailPage } from './pages/EventDetailPage.jsx'
import { NotFoundPage } from './pages/NotFoundPage.jsx'
import { AdminLoginPage } from './pages/admin/AdminLoginPage.jsx'
import { AdminLayout } from './pages/admin/AdminLayout.jsx'
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage.jsx'
import { AdminEventsPage } from './pages/admin/AdminEventsPage.jsx'
import { AdminImportPage } from './pages/admin/AdminImportPage.jsx'
import { AdminEventEditorPage } from './pages/admin/AdminEventEditorPage.jsx'
import { AdminSettingsPage } from './pages/admin/AdminSettingsPage.jsx'
import { AdminWeeklyUpdatePage } from './pages/admin/AdminWeeklyUpdatePage.jsx'

export default function App() {
  return (
    <ThemeProvider>
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
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ThemeProvider>
  )
}
