# Integration Testing Guide

## What are integration tests?

| Level | Tool | Speed | Scope |
|---|---|---|---|
| Unit | Vitest | ~ms | Single function or component in isolation |
| **Integration** | **Vitest + RTL** | **~seconds** | **Real providers + real Dexie + real effects** |
| E2E | Playwright | ~minutes | Full browser, real app |

Integration tests sit between unit and E2E. They verify that components, hooks,
contexts, and services work correctly together — without spinning up a browser.

While the app maintains a local-first architecture using IndexedDB (via Dexie), it now
integrates with a Fastify backend for secure registration and magic-link authentication.
In integration tests, Dexie is still patched with `fake-indexeddb` for fast execution.

---

## Running locally
```bash
# Run once
pnpm test:integration

# Watch mode — re-runs on file change
pnpm test:integration:watch
```

---

## File naming convention

Integration tests live in `packages/app/src/__integration__tests__/` directory
```
MyComponent.integration.test.tsx       ← integration test
```

---

## Adding a new integration test

1. Create `MyComponent.integration.test.tsx` in the `packages/app/src/__integration__tests__/` directory
2. Add `import 'fake-indexeddb/auto'` as the first line
3. Call `localStorage.clear()` in `beforeEach`
4. Import `renderWithProviders` from `test-utils/render`
5. Wrap all async assertions in `waitFor` — the provider initializes
   asynchronously on mount
6. Run `pnpm test:integration:watch` while developing

---

## Rules

- Never `vi.mock()` any context, hook, or service module in integration tests
- Always use `userEvent` for interactions — never `fireEvent`
- Seed state via real context actions (`addTransaction`, `addLimit`, etc.)
  inside `act()` — do not inject fixture data directly into context
- Check actual component labels, button text, and `data-testid` values before
  writing assertions — do not assume copy

---

## Common patterns

### Rendering with real providers
```tsx
import 'fake-indexeddb/auto'
import { renderWithProviders } from '../test-utils/render'

beforeEach(() => localStorage.clear())

it('renders correctly', async () => {
  renderWithProviders(<MyComponent />)

  await waitFor(() =>
    expect(screen.getByText(/expected text/i)).toBeInTheDocument()
  )
})
```

### Seeding state via context actions
```tsx
const Seeder = () => {
  const { addTransaction } = useBudget()
  return (
    <button
      onClick={() =>
        addTransaction({
          type: 'expense',
          amount: 50,
          category: 'expense-general',
          date: '2026-03-01',
          title: 'Coffee',
        })
      }
    >
      seed
    </button>
  )
}

renderWithProviders(
  <>
    <Seeder />
    <MyComponent />
  </>
)

await userEvent.click(screen.getByRole('button', { name: /seed/i }))
await waitFor(() => expect(screen.getByText('Coffee')).toBeInTheDocument())
```

### Testing a hook
```tsx
import { renderHook, waitFor } from '@testing-library/react'
import { AllProviders } from '../test-utils/render'

const { result } = renderHook(() => useMyHook(), { wrapper: AllProviders })
await waitFor(() => expect(result.current.isLoading).toBe(false))
```

### Simulating a Dexie write failure
```tsx
const spy = vi.spyOn(TransactionRepository.prototype, 'create')
  .mockRejectedValueOnce(new Error('Write failed'))

// ... interact with form ...

await waitFor(() =>
  expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
)

spy.mockRestore()
```

---

## Adding fixtures

Fixtures live in `packages/app/src/__fixtures__/` and must match real types
from `@budget/core`. Export a single object and an array per entity:
```ts
import type { Transaction } from '@budget/core'

export const mockTransaction: Transaction = {
  id: 'txn-001',
  amount: 49.99,
  category: 'expense-food',
  date: '2026-03-01',
  title: 'Grocery run',
  type: 'expense',
  accountId: 'main-account',
}

export const mockTransactions: Transaction[] = [
  mockTransaction,
  { ...mockTransaction, id: 'txn-002', amount: 12.00, title: 'Coffee' },
]
```
