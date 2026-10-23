import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import Link from '@mui/material/Link'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { payApi } from '../../api/client'
import { useAsync, useWorkOrders } from '../../api/hooks'
import type { WorkOrder } from '../../api/types'
import { PageHeader } from '../../components/PageHeader'
import { formatDate, formatMoney } from '../../lib/format'
import { payableWorkOrders, selectedTotal, toQuoteItems } from '../../lib/payRun'
import { colors } from '../../theme'

function PayRunTable({ payable }: { payable: WorkOrder[] }) {
  const ids = payable.map((wo) => wo.id)
  const [selected, setSelected] = useState(() => new Set(ids))
  const { data: quote, error, loading } = useAsync(
    () => payApi.quotes(toQuoteItems(payable)),
    `pay-run-${ids.join(',')}`,
  )
  const allSelected = selected.size === payable.length
  const moneyText = (amount?: number) =>
    loading ? '...' : error || amount === undefined ? '--' : formatMoney(amount)

  return (
    <>
      {error && <Alert severity="warning">Pay service unavailable: {error.message}</Alert>}
      <Card>
        <TableContainer>
          <Table size="small" aria-label="Approved work orders">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    inputProps={{ 'aria-label': 'Select all' }}
                    checked={allSelected}
                    indeterminate={selected.size > 0 && !allSelected}
                    onChange={() => setSelected(new Set(allSelected ? [] : ids))}
                  />
                </TableCell>
                {['ID', 'Title', 'Provider', 'Schedule'].map((label) => (
                  <TableCell key={label}>{label}</TableCell>
                ))}
                {['Labor', 'Expenses', 'Total'].map((label) => (
                  <TableCell key={label} align="right">{label}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {payable.map((wo) => {
                const line = quote?.items.find((item) => item.id === wo.id)
                return (
                  <TableRow key={wo.id}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        inputProps={{ 'aria-label': `Select WO ${wo.id}` }}
                        checked={selected.has(wo.id)}
                        onChange={() => setSelected((current) => {
                          const next = new Set(current)
                          if (next.has(wo.id)) next.delete(wo.id)
                          else next.add(wo.id)
                          return next
                        })}
                      />
                    </TableCell>
                    <TableCell>
                      <Link component={RouterLink} to={`/work-orders/${wo.id}`} underline="hover" sx={{ fontWeight: 600 }}>
                        {wo.id}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ color: colors.primary, fontSize: 13, fontWeight: 600 }}>{wo.title}</Typography>
                      <Typography variant="caption" sx={{ color: colors.iconGray, display: 'block' }}>
                        {wo.typeOfWork} {'\u00b7'} {wo.buyer}
                      </Typography>
                    </TableCell>
                    <TableCell>{wo.provider?.name ?? 'Unassigned'}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {wo.schedule ? formatDate(wo.schedule.start) : 'Not scheduled'}
                    </TableCell>
                    <TableCell align="right">{moneyText(line?.labor)}</TableCell>
                    <TableCell align="right">{moneyText(line?.expenses)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>{moneyText(line?.total)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <Box sx={{ bgcolor: '#FFFFFF', borderTop: `1px solid ${colors.border}`, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Typography sx={{ fontSize: 13 }}>{selected.size} of {payable.length} selected</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography sx={{ fontSize: 18 }}>Total</Typography>
            <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
              {moneyText(quote ? selectedTotal(quote, selected) : undefined)}
            </Typography>
          </Box>
        </Box>
      </Card>
    </>
  )
}

export function PayRunPage() {
  const { data, error, loading } = useWorkOrders()
  const payable = payableWorkOrders(data ?? [])

  return (
    <>
      <PageHeader
        title="Pay run"
        actions={
          <Button variant="outlined" component={RouterLink} to="/">Back to Flightboard</Button>
        }
      />
      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography sx={{ fontSize: 13, color: colors.titleGray }}>
          Approved work orders, with totals from the pay service.
        </Typography>
        {error ? (
          <Alert severity="error">Could not load work orders: {error.message}</Alert>
        ) : loading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={28} /></Box>
        ) : payable.length ? (
          <PayRunTable key={payable.map((wo) => wo.id).join(',')} payable={payable} />
        ) : (
          <Card sx={{ p: 4, textAlign: 'center', color: colors.iconGray }}>
            No approved work orders to pay.
          </Card>
        )}
      </Box>
    </>
  )
}
