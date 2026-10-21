import { requireValue } from '@/common/errors/AppError';
import { handle } from '@/common/http/route';
import { isUuid } from '@/common/utils/validation';
import { importLegacy, validateLegacy } from './import.service';

export const previewImportHandler = handle('admin', ({ data }) => validateLegacy(data));

export const applyImportHandler = handle(
  'admin',
  ({ data, requestId, store, actor }) => {
    requireValue(data.confirm === 'IMPORT' && isUuid(requestId || ''), 'تأكيد الاستيراد ومعرف الطلب مطلوبان');
    return importLegacy(store, actor, requestId!, data.source as Record<string, unknown>);
  },
  201,
);
