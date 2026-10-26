import express, { type Express, type Response } from 'express';
import { requireValue } from '@/common/errors/AppError';
import {
  captureRawBody,
  deviceAuth,
  errorHandler,
  notFound,
  restoreGate,
  securityHeaders,
  sessionAuth,
  type PipelineDeps,
} from '@/common/http/pipeline';
import { SessionStore } from '@/common/http/sessions';
import type { CtxBase, LicenseProvider } from '@/common/http/types';
import type { Store } from '@/common/store/Store';
import type { Database } from '@/config/prisma';
import type { BackupManager } from '@/modules/backup/backup.service';
import { apiRoutes } from '@/routes';

export interface AppDeps {
  store: Store;
  database: Database;
  licenseProvider?: LicenseProvider;
  backupManager?: BackupManager | undefined;
  clock?: () => number;
}

export interface BackendApp {
  app: Express;
  sessions: SessionStore;
  /** Number of requests currently in flight (the backup scheduler skips its tick while > 0). */
  activeRequests: () => number;
}

/**
 * Builds the Express application. Every request passes the same pipeline:
 * restore lock -> raw body -> device signature + JSON -> session -> routes -> JSON response.
 */
export function createApp({ store, database, licenseProvider, backupManager, clock = Date.now }: AppDeps): BackendApp {
  const sessions = new SessionStore(clock);
  let restoring = false;
  let active = 0;

  const deps: PipelineDeps = {
    store,
    sessions,
    licenseProvider,
    clock,
    restoring: () => restoring,
    track: (res: Response) => {
      active++;
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          active--;
        }
      };
      res.once('finish', finish);
      res.once('close', finish);
    },
  };

  const base: CtxBase = {
    store,
    db: database,
    backupManager,
    sessions,
    clock,
    /** Backup restore replaces all data and must run alone. */
    runExclusive: async (task) => {
      requireValue(active === 1, 'انتظر انتهاء الطلبات الأخرى ثم أعد الاستعادة', 409);
      restoring = true;
      try {
        return await task();
      } finally {
        restoring = false;
      }
    },
  };

  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false);
  app.set('case sensitive routing', true);
  app.set('strict routing', true);
  app.use(securityHeaders);
  app.use(restoreGate(deps));
  app.use((_req, res, next) => {
    res.locals.base = base;
    next();
  });
  app.use(captureRawBody);
  app.use(deviceAuth(deps));
  app.use(sessionAuth(deps));
  app.use(apiRoutes);
  app.use(notFound);
  app.use(errorHandler);
  return { app, sessions, activeRequests: () => active };
}
