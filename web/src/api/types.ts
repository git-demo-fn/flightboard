// Types mirror the JSON from the Go API (api/internal/workorder) and the
// PHP pay service (pay/src/PayCalculator.php).

export const STATUSES = [
  'Draft',
  'Published',
  'Routed',
  'Assigned',
  'Work Done',
  'Approved',
  'Paid',
  'Cancelled',
] as const
export type Status = (typeof STATUSES)[number]

export const SUB_STATUSES = [
  'Start Time Set',
  'Confirmed',
  'On My Way',
  'Checked In',
  'Checked Out',
  'On Hold',
] as const
export type SubStatus = (typeof SUB_STATUSES)[number]

export type Health = 'On Track' | 'Review' | 'Alert'

export const PAY_TYPES = ['Fixed', 'Hourly', 'PerDevice', 'Blended'] as const
export type PayType = (typeof PAY_TYPES)[number]

export const TASK_GROUPS = ['Prep', 'On Site', 'Post'] as const
export type TaskGroup = (typeof TASK_GROUPS)[number]

export interface Pay {
  type: PayType
  rate: number
  hours?: number
  devices?: number
}

export interface Task {
  id: string
  group: TaskGroup
  title: string
  done: boolean
}

export interface Provider {
  id: string
  name: string
  score: number
  city: string
  state: string
}

export interface WorkOrder {
  id: number
  title: string
  typeOfWork: string
  status: Status
  subStatus?: SubStatus
  buyer: string
  providerId?: string
  provider: Provider | null
  location: { city: string; state: string }
  schedule?: { start: string; end: string }
  checkIn?: string
  checkOut?: string
  pay: Pay
  tasks: Task[]
  health: Health
}

/** Body for POST /api/work-orders. */
export type NewWorkOrder = Pick<
  WorkOrder,
  'title' | 'typeOfWork' | 'buyer' | 'location' | 'pay' | 'tasks'
> & { status: 'Draft' | 'Published'; schedule?: WorkOrder['schedule'] }

export interface PayQuote {
  type: PayType
  lines: { label: string; amount: number }[]
  total: number
}
