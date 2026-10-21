import { handle, write } from '@/common/http/route';
import type { Ctx, Input } from '@/common/http/types';
import type { Tx } from '@/config/prisma';
import { importVisitors } from './visitors.import';
import {
  createCategory,
  createVisitor,
  findVisitorForGate,
  listVisitors,
  prepareVisitorMovement,
  recordVisit,
  updateCategory,
  updateVisitor,
} from './visitors.service';

export const gateVisitorLookupHandler = handle('gate', findVisitorForGate);
export const listVisitorsHandler = handle('admin', listVisitors);

export const visitorMovementHandler = write({
  path: '/api/gate/visitor',
  access: 'gate',
  prepare: (ctx) => prepareVisitorMovement(ctx.data),
  audit: false, // recordVisit writes its own 'visitor.in' / 'visitor.out' audit row.
  execute: (tx, movement, ctx) => recordVisit(tx, ctx, movement),
});

const adminWrite = (path: string, run: (tx: Tx, data: Input, ctx: Ctx) => Promise<unknown>) =>
  write({ path, access: 'admin', execute: (tx, _input, ctx) => run(tx, ctx.data, ctx) as Promise<{ id: string }> });

export const createVisitorHandler = adminWrite('/api/visitors', createVisitor);
export const updateVisitorHandler = adminWrite('/api/visitors/update', updateVisitor);
export const createCategoryHandler = adminWrite('/api/visitor-categories', createCategory);
export const updateCategoryHandler = adminWrite('/api/visitor-categories/update', updateCategory);

export const importVisitorsHandler = write({
  path: '/api/visitors/import',
  access: 'admin',
  audit: false,
  execute: (tx, _input, ctx) => importVisitors(tx, ctx),
});
