import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import { IntelProvider } from './intel'
import DatasetsPage from './pages/DatasetsPage'
import IncidentsPage from './pages/IncidentsPage'
import SystemPage from './pages/SystemPage'
import WorkspacePage from './pages/WorkspacePage'

export default function App() {
  return (
    <IntelProvider>
      <Routes>
        <Route path="/" element={<WorkspacePage />} />
        <Route
          path="/incidents"
          element={
            <AppShell>
              <IncidentsPage />
            </AppShell>
          }
        />
        <Route
          path="/datasets"
          element={
            <AppShell>
              <DatasetsPage />
            </AppShell>
          }
        />
        <Route
          path="/system"
          element={
            <AppShell>
              <SystemPage />
            </AppShell>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </IntelProvider>
  )
}
