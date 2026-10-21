import type { BridgeResult, DesktopBridge } from './types';

/** An API/bridge failure with an Arabic message and the HTTP status (0 = transport). */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type Listener = () => void;
const events: { unauthorized: Listener[]; deviceRejected: Listener[] } = { unauthorized: [], deviceRejected: [] };

/** Subscribe to "session expired" (401) notifications; returns an unsubscribe function. */
export function onUnauthorized(fn: Listener): () => void {
  events.unauthorized.push(fn);
  return () => {
    events.unauthorized = events.unauthorized.filter((f) => f !== fn);
  };
}
/** Subscribe to "device not licensed" (403 غير معتمد) notifications. */
export function onDeviceRejected(fn: Listener): () => void {
  events.deviceRejected.push(fn);
  return () => {
    events.deviceRejected = events.deviceRejected.filter((f) => f !== fn);
  };
}

/** The preload bridge, or an ApiError when the page runs outside the desktop app. */
export function bridge(): DesktopBridge {
  if (!window.desktop) throw new ApiError('شغّل تطبيق سطح المكتب؛ هذه الواجهة لا تعمل مباشرة في المتصفح.');
  return window.desktop;
}

const HINTS: { match: RegExp; hint: string }[] = [
  { match: /شهادة الخادم غير موثوقة|certificate|UNABLE_TO_VERIFY/i, hint: 'استورد شهادة الشبكة الداخلية من إعداد الاتصال.' },
  { match: /Failed to fetch|تعذر الاتصال|ECONNREFUSED|ETIMEDOUT|لا يستجيب/i, hint: 'تحقق من الخادم والشبكة ثم أعد المحاولة.' },
  { match: /غير معتمد/, hint: 'هذا الجهاز غير مدرج في الترخيص؛ أرسل طلب الاعتماد للجهة المالكة.' },
  { match: /اضبط عنوان الخادم/, hint: 'من شاشة الدخول: إعداد الاتصال ثم عنوان https://…' },
];

/** Adds a short actionable hint after known low-level error messages. */
export function withHint(message: string): string {
  const extra = HINTS.find((h) => h.match.test(message));
  return extra ? `${message} — ${extra.hint}` : message;
}

/** Unwraps a bridge result: returns data or throws ApiError (and fires 401/403 events). */
export async function unwrap<T>(promise: Promise<BridgeResult<T>>): Promise<T> {
  let result: BridgeResult<T>;
  try {
    result = await promise;
  } catch (error) {
    throw new ApiError(withHint(error instanceof Error ? error.message : 'تعذر الاتصال'));
  }
  if (!result.ok) {
    const status = result.status ?? 0;
    const message = result.error || 'حدث خطأ غير متوقع';
    if (status === 401) events.unauthorized.forEach((fn) => fn());
    if (status === 403 && message.includes('غير معتمد')) events.deviceRejected.forEach((fn) => fn());
    throw new ApiError(withHint(message), status);
  }
  return result.data as T;
}

/** GET through the main process. */
export async function get<T>(path: string): Promise<T> {
  return unwrap<T>(bridge().request('GET', path) as Promise<BridgeResult<T>>);
}

/** POST through the main process; every POST carries a request id (idempotency key). */
export async function post<T>(path: string, body: unknown, requestId: string = crypto.randomUUID()): Promise<T> {
  return unwrap<T>(bridge().request('POST', path, body, requestId) as Promise<BridgeResult<T>>);
}

/** Builds `?a=1&b=2` skipping empty values. */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** Best-effort message for any thrown value. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'حدث خطأ غير متوقع';
}
