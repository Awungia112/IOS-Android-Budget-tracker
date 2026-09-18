import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BudgetService } from './budget.service.js';
import { COMMAND_TYPES } from '../commands/types.js';

// Mock repositories
vi.mock('../repositories/account.repository', () => ({
  AccountRepository: vi.fn().mockImplementation(() => ({
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }))
}));

vi.mock('../repositories/transaction.repository', () => ({
  TransactionRepository: vi.fn().mockImplementation(() => ({
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    bulkDelete: vi.fn().mockResolvedValue(undefined),
    getByAccountIdIncludingArchived: vi.fn().mockResolvedValue([]),
  }))
}));

vi.mock('../repositories/category.repository', () => ({
  CategoryRepository: vi.fn().mockImplementation(() => ({
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    bulkCreate: vi.fn().mockResolvedValue(undefined),
    bulkUpsert: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }))
}));

vi.mock('../repositories/limit.repository', () => ({
  LimitRepository: vi.fn().mockImplementation(() => ({
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }))
}));

vi.mock('../repositories/template.repository', () => ({
  TemplateRepository: vi.fn().mockImplementation(() => ({
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }))
}));

vi.mock('../repositories/recurring.repository', () => ({
  RecurringRepository: vi.fn().mockImplementation(() => ({
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getById: vi.fn().mockResolvedValue(undefined),
  }))
}));

vi.mock('../repositories/savings.repository', () => ({
  SavingsRepository: vi.fn().mockImplementation(() => ({
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }))
}));

// Mock lifecycle ops
vi.mock('../db', () => ({
  db: {
    open: vi.fn().mockResolvedValue(undefined),
    initializeDefaultData: vi.fn().mockResolvedValue(undefined),
  }
}));

describe('BudgetService.executeCommand', () => {
  let service: BudgetService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BudgetService();
    vi.spyOn(service as any, 'reconcileRecurringTransactions').mockResolvedValue(undefined);
  });

  it('should delegate CREATE_TEMPLATE to templateRepo', async () => {
    const payload = { id: 'tpl-1', name: 'Test' };
    await service.executeCommand({ type: COMMAND_TYPES.CREATE_TEMPLATE, payload });
    expect((service as any).templateRepo.update).toHaveBeenCalledWith(payload);
  });

  it('should delegate UPDATE_TEMPLATE to templateRepo', async () => {
    const payload = { id: 'tpl-1', name: 'Updated' };
    await service.executeCommand({ type: COMMAND_TYPES.UPDATE_TEMPLATE, payload });
    expect((service as any).templateRepo.update).toHaveBeenCalledWith(payload);
  });

  it('should delegate DELETE_TEMPLATE to templateRepo', async () => {
    const payload = { id: 'tpl-1' };
    await service.executeCommand({ type: COMMAND_TYPES.DELETE_TEMPLATE, payload });
    expect((service as any).templateRepo.delete).toHaveBeenCalledWith(payload.id);
  });

  it('should delegate CREATE_RECURRING to recurringRepo', async () => {
    const payload = { id: 'rec-1', name: 'Test' };
    await service.executeCommand({ type: COMMAND_TYPES.CREATE_RECURRING, payload });
    expect((service as any).recurringRepo.update).toHaveBeenCalledWith(payload);
  });

  it('should delegate UPDATE_RECURRING to recurringRepo', async () => {
    const payload = { id: 'rec-1', name: 'Updated' };
    await service.executeCommand({ type: COMMAND_TYPES.UPDATE_RECURRING, payload });
    expect((service as any).recurringRepo.update).toHaveBeenCalledWith(payload);
  });

  it('should delegate DELETE_RECURRING to recurringRepo', async () => {
    const payload = { id: 'rec-1' };
    await service.executeCommand({ type: COMMAND_TYPES.DELETE_RECURRING, payload });
    expect((service as any).recurringRepo.delete).toHaveBeenCalledWith(payload.id);
  });

  it('should delegate CREATE_SAVINGS_GOAL to savingsRepo', async () => {
    const payload = { id: 'goal-1', name: 'Test' };
    await service.executeCommand({ type: COMMAND_TYPES.CREATE_SAVINGS_GOAL, payload });
    expect((service as any).savingsRepo.update).toHaveBeenCalledWith(payload);
  });

  it('should delegate UPDATE_SAVINGS_GOAL to savingsRepo', async () => {
    const payload = { id: 'goal-1', name: 'Updated' };
    await service.executeCommand({ type: COMMAND_TYPES.UPDATE_SAVINGS_GOAL, payload });
    expect((service as any).savingsRepo.update).toHaveBeenCalledWith(payload);
  });

  it('should delegate DELETE_SAVINGS_GOAL to savingsRepo', async () => {
    const payload = { id: 'goal-1' };
    await service.executeCommand({ type: COMMAND_TYPES.DELETE_SAVINGS_GOAL, payload });
    expect((service as any).savingsRepo.delete).toHaveBeenCalledWith(payload.id);
  });

  it('should delegate BULK_CREATE_CATEGORIES to categoryRepo', async () => {
    const payload = { categories: [{ id: 'cat-1' }] };
    await service.executeCommand({ type: COMMAND_TYPES.BULK_CREATE_CATEGORIES, payload });
    expect((service as any).categoryRepo.bulkUpsert).toHaveBeenCalledWith(payload.categories);
  });

  it('should warn on unknown command type', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await service.executeCommand({ type: 'UNKNOWN_TYPE', payload: {} });
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown command type'));
  });
});
