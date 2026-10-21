import { handle, write } from '@/common/http/route';
import { importFitness } from './fitness.import';
import { addFitness, listFitness } from './fitness.service';

export const listFitnessHandler = handle('admin', listFitness);

export const addFitnessHandler = write({
  path: '/api/fitness',
  access: 'admin',
  execute: (tx, _input, ctx) => addFitness(tx, ctx.data, ctx),
});

export const importFitnessHandler = write({
  path: '/api/fitness/import',
  access: 'admin',
  audit: false,
  execute: (tx, _input, ctx) => importFitness(tx, ctx),
});
