import Box from '@mui/material/Box'
import { Outlet, Route, Routes } from 'react-router-dom'
import { TopBar } from './components/TopBar'
import { FlightboardPage } from './pages/Flightboard/FlightboardPage'
import { NewWorkOrderPage } from './pages/NewWorkOrder/NewWorkOrderPage'
import { WorkOrderDetailPage } from './pages/WorkOrderDetail/WorkOrderDetailPage'

function Layout() {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <TopBar />
      <Outlet />
    </Box>
  )
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<FlightboardPage />} />
        <Route path="work-orders/new" element={<NewWorkOrderPage />} />
        <Route path="work-orders/:id" element={<WorkOrderDetailPage />} />
      </Route>
    </Routes>
  )
}
