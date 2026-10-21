import { Router } from 'express';
import {
  createOutletHandler,
  deleteOutletHandler,
  importCanteenHandler,
  ledgerHandler,
  purchaseHandler,
  reverseHandler,
  transactionHandler,
  updateOutletHandler,
} from './canteen.controller';

export const canteenRoutes = Router({ caseSensitive: true, strict: true });
canteenRoutes.get('/api/canteen/transaction', transactionHandler);
canteenRoutes.get('/api/canteen', ledgerHandler);
canteenRoutes.post('/api/canteen', purchaseHandler);
canteenRoutes.post('/api/canteen/reverse', reverseHandler);
canteenRoutes.post('/api/outlets', createOutletHandler);
canteenRoutes.post('/api/outlets/update', updateOutletHandler);
canteenRoutes.post('/api/outlets/delete', deleteOutletHandler);
canteenRoutes.post('/api/canteen/import', importCanteenHandler);
