import { Router } from 'express';
import { saveSettingsHandler } from './settings.controller';

export const settingsRoutes = Router({ caseSensitive: true, strict: true });
settingsRoutes.post('/api/settings', saveSettingsHandler);
