import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './services/auth.jsx'
import { Loading } from './components/ui.jsx'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Requests from './pages/Requests.jsx'
import NewRequest from './pages/NewRequest.jsx'
import RequestDetail from './pages/RequestDetail.jsx'
import Approvals from './pages/Approvals.jsx'
import Reports from './pages/Reports.jsx'
import Admin from './pages/Admin.jsx'
import Calendar from './pages/Calendar.jsx'
import Settings from './pages/Settings.jsx'

const HR = ['HR_ADMIN', 'SYSTEM_ADMIN']
const Guard = ({ roles, children }) => { const { user } = useAuth(); return !roles || roles.includes(user.role) ? children : <Navigate to="/" replace /> }

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <Loading />
  if (!user) return <Login />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/requests" element={<Requests />} />
        <Route path="/requests/new" element={<NewRequest />} />
        <Route path="/requests/:id" element={<RequestDetail />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/approvals" element={<Guard roles={['MANAGER', ...HR]}><Approvals /></Guard>} />
        <Route path="/reports" element={<Guard roles={HR}><Reports /></Guard>} />
        <Route path="/admin" element={<Guard roles={HR}><Admin /></Guard>} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
