'use strict';
/**
 * The renderer may only call these API paths through `window.desktop.request`.
 * Anything else (backup download/import, legacy import, ...) has its own dedicated channel in output.cjs.
 * When you add a server route that the UI calls, add it here too.
 */
const GET_PATHS = [
  'soldier/records',
  'soldier/evaluation',
  'visitor-cards',
  'gate/visitor-card',
  'soldiers',
  'soldier',
  'gate/soldier',
  'gate/visitor',
  'visitors',
  'permits',
  'permit',
  'summary',
  'admin/users',
  'catalog',
  'photos',
  'attachment',
  'canteen(?:/transaction)?',
  'fitness',
  'audit',
  'reports(?:/daily)?',
  'backups',
  'backup/preview',
  'dashboard',
];
const ALLOWED_GET = new RegExp(`^/api/(${GET_PATHS.join('|')})(?:\\?[^#]*)?$`);

const ALLOWED_POST = new Set([
  '/api/soldier/records',
  '/api/soldier/records/delete',
  '/api/gate/visitor-card',
  '/api/soldiers',
  '/api/soldier/update',
  '/api/soldier/archive',
  '/api/attachments',
  '/api/canteen',
  '/api/canteen/reverse',
  '/api/outlets',
  '/api/outlets/update',
  '/api/outlets/delete',
  '/api/soldiers/import',
  '/api/visitors/import',
  '/api/fitness/import',
  '/api/canteen/import',
  '/api/fitness',
  '/api/settings',
  '/api/users/update',
  '/api/gate/correct',
  '/api/backup/create',
  '/api/backup/restore',
  '/api/gate',
  '/api/gate/visitor',
  '/api/visitors',
  '/api/visitors/update',
  '/api/visitor-categories',
  '/api/visitor-categories/update',
  '/api/admin/users',
]);

function isAllowedRequest(arg) {
  if (!arg) return false;
  if (arg.method === 'GET') return ALLOWED_GET.test(arg.path);
  if (arg.method === 'POST') return ALLOWED_POST.has(arg.path);
  return false;
}

module.exports = { isAllowedRequest };
