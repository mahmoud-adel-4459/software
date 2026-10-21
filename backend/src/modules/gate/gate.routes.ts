import { Router } from 'express';
import {
  correctionHandler,
  gateSoldierHandler,
  movementHandler,
  permitHandler,
  permitsHandler,
  summaryHandler,
} from './gate.controller';

export const gateRoutes = Router({ caseSensitive: true, strict: true });
gateRoutes.get('/api/gate/soldier', gateSoldierHandler);
gateRoutes.get('/api/permit', permitHandler);
gateRoutes.get('/api/permits', permitsHandler);
gateRoutes.get('/api/summary', summaryHandler);
gateRoutes.post('/api/gate', movementHandler);
gateRoutes.post('/api/gate/correct', correctionHandler);
