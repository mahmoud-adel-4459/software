import { Router } from 'express';
import { handle, write } from '@/common/http/route';
import { addAttachment, getAttachment, listPhotos } from './attachments.service';

export const attachmentRoutes = Router({ caseSensitive: true, strict: true });
attachmentRoutes.get('/api/attachment', handle('any', getAttachment));
attachmentRoutes.get('/api/photos', handle('any', listPhotos));
attachmentRoutes.post(
  '/api/attachments',
  write({
    path: '/api/attachments',
    access: 'admin',
    execute: (tx, _input, { data }) => addAttachment(tx, data),
  }),
);
