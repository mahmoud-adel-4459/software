import { handle, write } from '@/common/http/route';
import { createUser, listUsers, updateUser } from './users.service';
import { newUserInput } from './users.validator';

export const listUsersHandler = handle('admin', listUsers);

export const createUserHandler = write({
  path: '/api/admin/users',
  access: 'admin',
  prepare: (ctx) => newUserInput(ctx.data),
  audit: { action: 'user.create', entity: (row) => row.id },
  execute: (tx, user) => createUser(tx, user),
});

export const updateUserHandler = write({
  path: '/api/users/update',
  access: 'admin',
  execute: (tx, _input, ctx) => updateUser(tx, ctx.data, ctx),
});
