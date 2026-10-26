import { Router } from 'express';
import { handle, write } from '@/common/http/route';
import { findVisitorCard, listVisitorCards, moveVisitorCard } from './visitor-cards.service';
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
visitorsRoutes.get('/api/gate/visitor', gateVisitorLookupHandler);
visitorsRoutes.get('/api/visitors', listVisitorsHandler);
visitorsRoutes.post('/api/gate/visitor', visitorMovementHandler);
visitorsRoutes.post('/api/visitors', createVisitorHandler);
visitorsRoutes.post('/api/visitors/import', importVisitorsHandler);
visitorsRoutes.post('/api/visitors/update', updateVisitorHandler);
visitorsRoutes.post('/api/visitor-categories', createCategoryHandler);
visitorsRoutes.post('/api/visitor-categories/update', updateCategoryHandler);
