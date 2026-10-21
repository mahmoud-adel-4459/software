import type { Request } from 'express';
import type { Database, Tx } from '@/config/prisma';
import type { Store } from '@/common/store/Store';
import type { SessionStore, Session } from './sessions';
import type { BackupManager } from '@/modules/backup/backup.service';

export type DeviceKind = 'internal' | 'gate';

export interface Device {
  id: string;
  kind: DeviceKind;
  publicKey: string;
  fingerprint?: string;
}

export interface License {
  installation: string;
  serverId?: string;
  devices: Device[];
}

export type LicenseProvider = () => License;

export interface UserRow {
  id: string;
  username: string;
  name: string;
  password_hash: string;
  role: string;
  disabled: boolean;
  auth_version: number;
}

/** Authenticated caller: the account plus the kind of licensed device it signed in from. */
export interface Actor {
  user: UserRow;
  deviceId: string;
  kind: DeviceKind;
}

export type Input = Record<string, unknown>;

/** Everything a route needs, assembled once per request by the pipeline middlewares. */
export interface Ctx {
  req: Request;
  url: URL;
  data: Input;
  deviceId: string;
  device: Device;
  license: License;
  requestId: string | undefined;
  actor: Actor;
  token: string;
  session: Session | undefined;
  store: Store;
  db: Database;
  backupManager: BackupManager | undefined;
  sessions: SessionStore;
  clock: () => number;
  runExclusive: <T>(task: () => Promise<T>) => Promise<T>;
}

export type { Tx };

export type CtxBase = Omit<
  Ctx,
  'req' | 'url' | 'data' | 'deviceId' | 'device' | 'license' | 'requestId' | 'actor' | 'token' | 'session'
>;
