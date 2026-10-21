import { handle } from '@/common/http/route';
import { login, logout } from './auth.service';

export const loginHandler = handle('any', login, 200);
export const logoutHandler = handle('any', logout, 200);
