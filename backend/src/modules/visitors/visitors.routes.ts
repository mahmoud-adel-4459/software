import { Router } from 'express';
import { handle, write } from '@/common/http/route';
import type { Ctx, Input } from '@/common/http/types';
import type { Tx } from '@/config/prisma';
import { findVisitorCard, listVisitorCards, moveVisitorCard } from './visitor-cards.service';
import {
  cancelVisitorPass,
  decideVisitorPass,
  getVisitorPass,
  listVisitorPasses,
  moveVisitorPass,
  requestVisitorPass,
} from './visitor-passes.service';
import {
  createCategoryHandler,
  createVisitorHandler,
  gateVisitorLookupHandler,
  importVisitorsHandler,
  listVisitorsHandler,
  updateCategoryHandler,
  updateVisitorHandler,
  visitorMovementHandler,
} from './visitors.controller';

export const visitorsRoutes = Router({ caseSensitive: true, strict: true });
visitorsRoutes.get('/api/visitor-cards', handle('gate', listVisitorCards));
visitorsRoutes.get('/api/gate/visitor-card', handle('gate', findVisitorCard));
visitorsRoutes.post('/api/gate/visitor-card', write({
  path: '/api/gate/visitor-card', access: 'gate', audit: false,
  execute: (tx, _input, ctx) => moveVisitorCard(tx, ctx, ctx.data),
}));
// Visitor passes: gate requests, unit (admin) approves and prints, gate scans the printed pass.
const passWrite = (path: string, access: 'gate' | 'admin', run: (tx: Tx, ctx: Ctx, data: Input) => Promise<{ id: string }>) =>
  write({ path, access, audit: false, execute: (tx, _input, ctx) => run(tx, ctx, ctx.data) });
visitorsRoutes.get('/api/visitor-passes', handle('gate', listVisitorPasses));
visitorsRoutes.get('/api/visitor-pass', handle('gate', getVisitorPass));
visitorsRoutes.post('/api/gate/visitor-passes', passWrite('/api/gate/visitor-passes', 'gate', requestVisitorPass));
visitorsRoutes.post('/api/gate/visitor-passes/cancel', passWrite('/api/gate/visitor-passes/cancel', 'gate', cancelVisitorPass));
visitorsRoutes.post('/api/gate/visitor-pass', passWrite('/api/gate/visitor-pass', 'gate', moveVisitorPass));
visitorsRoutes.post('/api/visitor-passes/decide', passWrite('/api/visitor-passes/decide', 'admin', decideVisitorPass));
visitorsRoutes.get('/api/gate/visitor', gateVisitorLookupHandler);
visitorsRoutes.get('/api/visitors', listVisitorsHandler);
visitorsRoutes.post('/api/gate/visitor', visitorMovementHandler);
visitorsRoutes.post('/api/visitors', createVisitorHandler);
visitorsRoutes.post('/api/visitors/import', importVisitorsHandler);
visitorsRoutes.post('/api/visitors/update', updateVisitorHandler);
visitorsRoutes.post('/api/visitor-categories', createCategoryHandler);
visitorsRoutes.post('/api/visitor-categories/update', updateCategoryHandler);
