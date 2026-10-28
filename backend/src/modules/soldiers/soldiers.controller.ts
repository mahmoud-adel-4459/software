import { requireClerkOrAdmin } from '@/common/http/access';
import { handle, write } from '@/common/http/route';
import { archiveSoldier, getSoldier, listSoldiers, updateSoldier } from './soldiers.service';
import { importSoldiers } from './soldiers.import';
import { newSoldierInput, soldierPhotos } from './soldiers.validator';
import { addAttachment } from './attachments.service';

/** Gate stations may search soldiers; internal PCs only for admin/clerk accounts. */
export const listSoldiersHandler = handle((actor) => {
  if (actor.kind === 'internal') requireClerkOrAdmin(actor);
}, listSoldiers);

export const getSoldierHandler = handle('clerkOrAdmin', getSoldier);

export const createSoldierHandler = write({
  path: '/api/soldiers',
  access: 'admin',
  prepare: (ctx) => {
    const soldier = newSoldierInput(ctx.data);
    return { ...soldier, photos: soldierPhotos(ctx.data.photos) };
  },
  audit: false, // store.createSoldier writes its own 'soldier.create' audit row.
  execute: async (tx, soldier, { store, actor }) => {
    const row = await store.createSoldier(tx, actor, soldier);
    for (const photo of soldier.photos) await addAttachment(tx, { ...photo, soldierId: row.id });
    return row;
  },
});

export const updateSoldierHandler = write({
  path: '/api/soldier/update',
  access: 'admin',
  execute: (tx, _input, { data }) => updateSoldier(tx, data),
});

export const archiveSoldierHandler = write({
  path: '/api/soldier/archive',
  access: 'admin',
  execute: (tx, _input, { data }) => archiveSoldier(tx, data),
});

export const importSoldiersHandler = write({
  path: '/api/soldiers/import',
  access: 'admin',
  audit: false,
  execute: (tx, _input, ctx) => importSoldiers(tx, ctx),
});
