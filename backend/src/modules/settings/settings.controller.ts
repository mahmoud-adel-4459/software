import { write } from '@/common/http/route';
import { SETTINGS_AUDIT_ENTITY } from '@/common/utils/catalog';
import { saveSettings } from './settings.service';

export const saveSettingsHandler = write({
  path: '/api/settings',
  access: 'admin',
  audit: { action: 'settings', entity: () => SETTINGS_AUDIT_ENTITY },
  execute: (tx, _input, { data }) => saveSettings(tx, data),
});
