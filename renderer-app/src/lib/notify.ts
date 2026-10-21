import { toast } from 'react-toastify';
import { errorMessage } from '@/api/client';

/** Toast helpers (react-toastify): success / error / apiError. */
export const notify = {
  success: (message: string) => toast.success(message),
  info: (message: string) => toast.info(message),
  error: (message: string) => toast.error(message),
  apiError: (error: unknown) => toast.error(errorMessage(error)),
};
