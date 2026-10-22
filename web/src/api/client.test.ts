import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, payApi } from './client'
import type { Expense, PayQuote } from './types'
import { makeWorkOrder } from '../test/fixtures'

const workOrder = makeWorkOrder()
const expense: Expense = {
  id: 'e1',
  workOrderId: workOrder.id,
  category: 'Materials',
  description: 'Replacement cable',
  amountCents: 1250,
  status: 'Pending',
  createdAt: '2026-10-22T14:00:00Z',
}
const newExpense = {
  category: expense.category,
  description: expense.description,
  amountCents: expense.amountCents,
}
const quote: PayQuote = {
  type: 'Hourly',
  lines: [{ label: 'Labor - Hourly pay', amount: 260 }],
  total: 260,
}
const expensePath = `/api/work-orders/${workOrder.id}/expenses`
const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('expense API calls', () => {
  const calls = [
    {
      name: 'listExpenses',
      call: () => api.listExpenses(workOrder.id),
      path: expensePath,
      method: 'GET',
      body: undefined,
      response: [expense],
    },
    {
      name: 'addExpense',
      call: () => api.addExpense(workOrder.id, newExpense),
      path: expensePath,
      method: 'POST',
      body: newExpense,
      response: expense,
    },
    {
      name: 'approveExpense',
      call: () => api.approveExpense(workOrder.id, expense.id),
      path: `${expensePath}/${expense.id}/approve`,
      method: 'POST',
      body: {},
      response: { ...expense, status: 'Approved' },
    },
    {
      name: 'rejectExpense',
      call: () => api.rejectExpense(workOrder.id, expense.id, 'Receipt missing'),
      path: `${expensePath}/${expense.id}/reject`,
      method: 'POST',
      body: { reason: 'Receipt missing' },
      response: { ...expense, status: 'Rejected', rejectionReason: 'Receipt missing' },
    },
  ]

  it.each(calls)('$name sends the expected request and returns the response', async (test) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(test.response)))

    await expect(test.call()).resolves.toEqual(test.response)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [path, init] = fetchMock.mock.calls[0]
    expect(path).toBe(test.path)
    expect(init?.method ?? 'GET').toBe(test.method)
    expect(init?.body).toBe(test.body === undefined ? undefined : JSON.stringify(test.body))
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it.each(calls)('$name propagates API errors to the caller', async (test) => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Expense change not allowed' }), { status: 409 }),
    )

    const result = test.call()
    await expect(result).rejects.toBeInstanceOf(ApiError)
    await expect(result).rejects.toMatchObject({
      status: 409,
      message: 'Expense change not allowed',
    })
  })
})

describe('pay quotes', () => {
  it.each([undefined, [], [expense]])('sends optional expenses %j', async (expenses) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(quote)))

    await expect(payApi.quote(workOrder.pay, expenses)).resolves.toEqual(quote)

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/pay/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...workOrder.pay, expenses }),
    })
  })

  it('propagates pay API errors when expenses are included', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Invalid expense amount' }), { status: 400 }),
    )

    const result = payApi.quote(workOrder.pay, [expense])
    await expect(result).rejects.toBeInstanceOf(ApiError)
    await expect(result).rejects.toMatchObject({ status: 400, message: 'Invalid expense amount' })
  })
})

it('creates work order fixtures with zero expense totals', () => {
  expect(makeWorkOrder().expenseTotals).toEqual({
    pendingCents: 0,
    approvedCents: 0,
    rejectedCents: 0,
  })
  const expenseTotals = { pendingCents: 1250, approvedCents: 500, rejectedCents: 100 }
  expect(makeWorkOrder({ expenseTotals }).expenseTotals).toEqual(expenseTotals)
})
