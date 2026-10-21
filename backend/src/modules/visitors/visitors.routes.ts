import { Router } from 'express';
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
visitorsRoutes.get('/api/gate/visitor', gateVisitorLookupHandler);
visitorsRoutes.get('/api/visitors', listVisitorsHandler);
visitorsRoutes.post('/api/gate/visitor', visitorMovementHandler);
visitorsRoutes.post('/api/visitors', createVisitorHandler);
visitorsRoutes.post('/api/visitors/import', importVisitorsHandler);
visitorsRoutes.post('/api/visitors/update', updateVisitorHandler);
visitorsRoutes.post('/api/visitor-categories', createCategoryHandler);
visitorsRoutes.post('/api/visitor-categories/update', updateCategoryHandler);
