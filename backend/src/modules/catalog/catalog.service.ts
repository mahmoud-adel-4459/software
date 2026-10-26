import type { Ctx } from '@/common/http/types';
import { isAdmin } from '@/common/http/access';
import { listOutlets, listVisitorCategories } from '@/common/store/lookups';
import { FITNESS_TYPES } from '@/common/utils/catalog';
import { exitReasonsOf } from '@/modules/settings/exit-reasons';
import { catalogForClient } from '@/common/utils/reports';
import { mergeBackupPolicy } from '@/modules/backup/backup.policy';
import { mergePrintSettings } from '@/modules/settings/print.settings';
import { memoFields } from '@/modules/settings/memo.settings';

interface SettingsData {
  unitName: string;
  parentFormation: string;
  logo: string | null;
  showLogo: boolean;
  paper: string;
  margins: string;
  extraReasons: string[];
  exitReasons?: string[];
}

/** Everything the UI needs after login: lists, report types and (role-dependent) settings. */
export async function catalog({ store, actor }: Ctx) {
  const prisma = store.prisma;
  const row = await prisma.settings.findUniqueOrThrow({ where: { id: 1 } });
  const settings = row.data as unknown as SettingsData;
  const admin = isAdmin(actor);
  const outlets = await listOutlets(prisma);
  const publicSettings = {
    unitName: settings.unitName,
    parentFormation: settings.parentFormation,
    logo: settings.showLogo ? settings.logo : null,
    showLogo: settings.showLogo,
    paper: settings.paper,
    margins: settings.margins,
    ...mergePrintSettings(settings),
    ...memoFields(settings),
  };
  return {
    exitReasons: exitReasonsOf(settings),
    fitnessTypes: FITNESS_TYPES,
    reports: catalogForClient(actor.user.role),
    outlets: {
      canteen: outlets.filter((o) => o.kind === 'canteen'),
      buffet: outlets.filter((o) => o.kind === 'buffet'),
    },
    outletsAll: admin ? await listOutlets(prisma, { includeDisabled: true }) : null,
    visitorCategories: await listVisitorCategories(prisma),
    visitorCategoriesAll: admin ? await listVisitorCategories(prisma, { includeDisabled: true }) : null,
    settings: admin ? { ...settings, ...mergeBackupPolicy(settings), ...mergePrintSettings(settings), version: row.version } : publicSettings,
  };
}
