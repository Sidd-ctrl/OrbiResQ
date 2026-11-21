import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import DatasetsPage from './pages/DatasetsPage'
import HomePage from './pages/HomePage'
import IncidentsPage from './pages/IncidentsPage'
import MonitoringPage from './pages/MonitoringPage'
import SystemPage from './pages/SystemPage'

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/monitoring" element={<MonitoringPage />} />
        <Route path="/incidents" element={<IncidentsPage />} />
        <Route path="/datasets" element={<DatasetsPage />} />
        <Route path="/system" element={<SystemPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}
