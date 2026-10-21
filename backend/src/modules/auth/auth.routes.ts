import { Router } from 'express';
import { loginHandler, logoutHandler } from './auth.controller';

export const authRoutes = Router({ caseSensitive: true, strict: true });
authRoutes.post('/api/login', loginHandler);
authRoutes.post('/api/logout', logoutHandler);
