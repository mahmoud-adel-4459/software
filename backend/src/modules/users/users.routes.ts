import { Router } from 'express';
import { createUserHandler, listUsersHandler, updateUserHandler } from './users.controller';

export const usersRoutes = Router({ caseSensitive: true, strict: true });
usersRoutes.get('/api/admin/users', listUsersHandler);
usersRoutes.post('/api/admin/users', createUserHandler);
usersRoutes.post('/api/users/update', updateUserHandler);
