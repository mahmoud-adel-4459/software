import { handle, write } from '@/common/http/route';
import { correctMovement, findSoldierForGate, getPermit, listPermits, recordMovement, summary } from './gate.service';
import { prepareMovement } from './gate.validator';

export const gateSoldierHandler = handle('gate', findSoldierForGate);
export const permitHandler = handle('any', getPermit);
export const permitsHandler = handle('any', listPermits);
export const summaryHandler = handle('any', summary);

export const movementHandler = write({
  path: '/api/gate',
  access: 'gate',
  prepare: (ctx) => prepareMovement(ctx.data),
  audit: false, // recordMovement writes its own 'gate.exit' / 'gate.entry' audit row.
  execute: (tx, movement, ctx) => recordMovement(tx, ctx, movement),
});

export const correctionHandler = write({
  path: '/api/gate/correct',
  access: 'admin',
  execute: (tx, _input, ctx) => correctMovement(tx, ctx.data, ctx),
});
