import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useReducer } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, payApi } from '../../api/client'
import * as hooks from '../../api/hooks'
import type { PayRunQuote, WorkOrder } from '../../api/types'
import { formatDate } from '../../lib/format'
import { makeWorkOrder, provider } from '../../test/fixtures'
import { renderAt } from '../../test/render'
import { PayRunPage } from './PayRunPage'

vi.mock('../../api/client', () => ({
  api: { listWorkOrders: vi.fn() },
  payApi: { quotes: vi.fn() },
}))

const printer = makeWorkOrder({
  id: 9631821,
  title: 'Receipt printer replacement',
  typeOfWork: 'Printer',
  buyer: 'Northwind Retail',
  status: 'Approved',
  provider: { ...provider, id: 'p-105', name: 'Keisha Abernathy' },
  schedule: { start: '2026-10-12T09:00:00-05:00', end: '2026-10-12T11:00:00-05:00' },
  pay: { type: 'Fixed', rate: 140 },
})
const phones = makeWorkOrder({
  id: 9631822,
  title: 'Desk phone moves, 12 seats',
  typeOfWork: 'Telecom/VoIP',
  buyer: 'Corvid Logistics',
  status: 'Approved',
  provider: { ...provider, id: 'p-106', name: 'Luis Carvajal' },
  schedule: { start: '2026-10-13T08:00:00-05:00', end: '2026-10-13T12:00:00-05:00' },
  pay: { type: 'PerDevice', rate: 18, devices: 12 },
})
const workDone = makeWorkOrder({ id: 9631820, title: 'Finished network work', status: 'Work Done' })
const quote: PayRunQuote = {
  items: [
    { id: printer.id, labor: 140, expenses: 0, total: 140 },
    { id: phones.id, labor: 216, expenses: 0, total: 216 },
  ],
  count: 2,
  total: 356,
}

beforeEach(() => {
  vi.mocked(api.listWorkOrders).mockReset().mockResolvedValue([phones, workDone, printer])
  vi.mocked(payApi.quotes).mockReset().mockResolvedValue(quote)
})

describe('PayRunPage', () => {
  it('quotes only approved work orders once and shows their totals and details', async () => {
    renderAt(<PayRunPage />)
    await screen.findByText('$356.00')

    expect(payApi.quotes).toHaveBeenCalledExactlyOnceWith([
      { id: 9631821, pay: { type: 'Fixed', rate: 140 }, approvedExpenseCents: 0 },
      { id: 9631822, pay: { type: 'PerDevice', rate: 18, devices: 12 }, approvedExpenseCents: 0 },
    ])
    const rows = within(screen.getByRole('table', { name: 'Approved work orders' })).getAllByRole('row')
    expect(rows).toHaveLength(3)
    expect(within(rows[1]).getAllByRole('cell').slice(-3).map((cell) => cell.textContent))
      .toEqual(['$140.00', '$0.00', '$140.00'])
    expect(within(rows[2]).getAllByRole('cell').slice(-3).map((cell) => cell.textContent))
      .toEqual(['$216.00', '$0.00', '$216.00'])
    expect(screen.queryByText(workDone.title)).not.toBeInTheDocument()
    expect(screen.getByText(printer.title)).toBeInTheDocument()
    expect(screen.getByText(phones.title)).toBeInTheDocument()
    expect(screen.getByText('Printer \u00b7 Northwind Retail')).toBeInTheDocument()
    expect(screen.getByText('Telecom/VoIP \u00b7 Corvid Logistics')).toBeInTheDocument()
    expect(screen.getByText('Keisha Abernathy')).toBeInTheDocument()
    expect(screen.getByText('Luis Carvajal')).toBeInTheDocument()
    expect(screen.getByText(formatDate(printer.schedule!.start))).toBeInTheDocument()
    expect(screen.getByText(formatDate(phones.schedule!.start))).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '9631821' })).toHaveAttribute('href', '/work-orders/9631821')
    expect(screen.getByRole('link', { name: '9631822' })).toHaveAttribute('href', '/work-orders/9631822')
    expect(screen.getByRole('link', { name: 'Back to Flightboard' })).toHaveAttribute('href', '/')
    expect(screen.getByText('2 of 2 selected')).toBeInTheDocument()
    for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).toBeChecked()
  })

  it('updates the selected total and selects or clears all rows without requoting', async () => {
    renderAt(<PayRunPage />)
    await screen.findByText('$356.00')

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select WO 9631822' }))
    expect(screen.getByText('1 of 2 selected')).toBeInTheDocument()
    expect(screen.queryByText('$356.00')).not.toBeInTheDocument()
    expect(screen.getAllByText('$140.00')).toHaveLength(3)
    expect(screen.getByRole('checkbox', { name: 'Select all' })).toHaveAttribute('data-indeterminate', 'true')

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }))
    expect(screen.getByText('2 of 2 selected')).toBeInTheDocument()
    expect(screen.getByText('$356.00')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }))
    expect(screen.getByText('0 of 2 selected')).toBeInTheDocument()
    expect(screen.getAllByText('$0.00')).toHaveLength(3)
    for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).not.toBeChecked()
    expect(payApi.quotes).toHaveBeenCalledTimes(1)
  })

  it('shows placeholders while the quote is loading', async () => {
    let resolve!: (value: PayRunQuote) => void
    vi.mocked(payApi.quotes).mockReturnValue(new Promise((done) => { resolve = done }))
    renderAt(<PayRunPage />)

    const table = await screen.findByRole('table', { name: 'Approved work orders' })
    expect(within(table).getAllByText('...')).toHaveLength(6)
    resolve(quote)
    expect(await screen.findByText('$356.00')).toBeInTheDocument()
  })

  it('selects all rows again when the payable ids change', async () => {
    const state = { data: [printer, phones], error: null, loading: false, reload: vi.fn(), setData: vi.fn() }
    const list = vi.spyOn(hooks, 'useWorkOrders').mockReturnValue(state)
    function Harness() {
      const [, refresh] = useReducer((n: number) => n + 1, 0)
      return <><button onClick={refresh}>Refresh list</button><PayRunPage /></>
    }
    renderAt(<Harness />)
    await screen.findByText('$356.00')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select WO 9631821' }))

    list.mockReturnValue({ ...state, data: [printer] })
    vi.mocked(payApi.quotes).mockResolvedValue({ items: [quote.items[0]], count: 1, total: 140 })
    await userEvent.click(screen.getByRole('button', { name: 'Refresh list' }))

    expect(await screen.findByText('1 of 1 selected')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Select WO 9631821' })).toBeChecked()
    await waitFor(() => expect(screen.getAllByText('$140.00')).toHaveLength(3))
    expect(payApi.quotes).toHaveBeenCalledTimes(2)
  })

  it('shows a warning and unavailable amounts when the pay service fails', async () => {
    vi.mocked(payApi.quotes).mockRejectedValue(new Error('pay down'))
    renderAt(<PayRunPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Pay service unavailable: pay down')
    expect(within(screen.getByRole('table')).getAllByText('--')).toHaveLength(6)
    expect(screen.queryByText('$356.00')).not.toBeInTheDocument()
  })

  it.each([{ list: [] }, { list: [workDone] }])('does not quote a list with no approved work orders: %j', async ({ list }) => {
    vi.mocked(api.listWorkOrders).mockResolvedValue(list)
    renderAt(<PayRunPage />)

    expect(await screen.findByText('No approved work orders to pay.')).toBeInTheDocument()
    expect(payApi.quotes).not.toHaveBeenCalled()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows the list error without requesting quotes', async () => {
    vi.mocked(api.listWorkOrders).mockRejectedValue(new Error('API down'))
    renderAt(<PayRunPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load work orders: API down')
    expect(payApi.quotes).not.toHaveBeenCalled()
    expect(screen.queryByText('No approved work orders to pay.')).not.toBeInTheDocument()
  })

  it('shows approved expenses and a missing schedule', async () => {
    vi.mocked(api.listWorkOrders).mockResolvedValue([
      { ...printer, schedule: undefined, expenseTotals: { pendingCents: 500, approvedCents: 1250, rejectedCents: 200 } },
    ])
    vi.mocked(payApi.quotes).mockResolvedValue({
      items: [{ id: printer.id, labor: 140, expenses: 12.5, total: 152.5 }], count: 1, total: 152.5,
    })
    renderAt(<PayRunPage />)

    expect(await screen.findByText('$12.50')).toBeInTheDocument()
    expect(screen.getByText('Not scheduled')).toBeInTheDocument()
    expect(screen.getAllByText('$152.50')).toHaveLength(2)
    expect(payApi.quotes).toHaveBeenCalledExactlyOnceWith([
      { id: printer.id, pay: printer.pay, approvedExpenseCents: 1250 },
    ])
  })

  it('waits for the work order list before showing the empty state or requesting quotes', async () => {
    let resolve!: (value: WorkOrder[]) => void
    vi.mocked(api.listWorkOrders).mockReturnValue(new Promise((done) => { resolve = done }))
    renderAt(<PayRunPage />)

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(screen.queryByText('No approved work orders to pay.')).not.toBeInTheDocument()
    expect(payApi.quotes).not.toHaveBeenCalled()
    resolve([printer, phones])
    await waitFor(() => expect(screen.getByText('$356.00')).toBeInTheDocument())
  })
})
