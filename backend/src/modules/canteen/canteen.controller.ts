import { handle, write } from '@/common/http/route';
import { importCanteen } from './canteen.import';
import {
  addPurchase,
  createOutlet,
  deleteOutlet,
  getTransaction,
  monthlyLedger,
  reversePurchase,
  updateOutlet,
} from './canteen.service';

export const transactionHandler = handle('clerkOrAdmin', getTransaction);
export const ledgerHandler = handle('clerkOrAdmin', monthlyLedger);

export const purchaseHandler = write({
  path: '/api/canteen',
  access: 'clerkOrAdmin',
  execute: (tx, _input, ctx) => addPurchase(tx, ctx.data, ctx),
});

export const reverseHandler = write({
  path: '/api/canteen/reverse',
  access: 'clerkOrAdmin',
  execute: (tx, _input, ctx) => reversePurchase(tx, ctx.data, ctx),
});

export const createOutletHandler = write({
  path: '/api/outlets',
  access: 'admin',
  execute: (tx, _input, { data }) => createOutlet(tx, data),
});

export const updateOutletHandler = write({
  path: '/api/outlets/update',
  access: 'admin',
  execute: (tx, _input, { data }) => updateOutlet(tx, data),
});

export const deleteOutletHandler = write({
  path: '/api/outlets/delete',
  access: 'admin',
  execute: (tx, _input, { data }) => deleteOutlet(tx, data),
});

export const importCanteenHandler = write({
  path: '/api/canteen/import',
  access: 'admin',
  audit: false,
  execute: (tx, _input, ctx) => importCanteen(tx, ctx),
});
