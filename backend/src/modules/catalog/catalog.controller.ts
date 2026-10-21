import { handle } from '@/common/http/route';
import { catalog } from './catalog.service';

export const catalogHandler = handle('any', catalog);
