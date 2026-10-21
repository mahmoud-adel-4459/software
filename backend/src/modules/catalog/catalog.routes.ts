import { Router } from 'express';
import { catalogHandler } from './catalog.controller';

export const catalogRoutes = Router({ caseSensitive: true, strict: true });
catalogRoutes.get('/api/catalog', catalogHandler);
