import { Router } from 'express';
import { applyImportHandler, previewImportHandler } from './import.controller';

export const importRoutes = Router({ caseSensitive: true, strict: true });
importRoutes.post('/api/import/preview', previewImportHandler);
importRoutes.post('/api/import/apply', applyImportHandler);
