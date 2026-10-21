import { Router } from 'express';
import { addFitnessHandler, importFitnessHandler, listFitnessHandler } from './fitness.controller';

export const fitnessRoutes = Router({ caseSensitive: true, strict: true });
fitnessRoutes.get('/api/fitness', listFitnessHandler);
fitnessRoutes.post('/api/fitness', addFitnessHandler);
fitnessRoutes.post('/api/fitness/import', importFitnessHandler);
