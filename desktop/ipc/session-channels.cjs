'use strict';
/** IPC channels that talk to the server: login/logout, whitelisted API requests and QR images. */
const { randomUUID } = require('node:crypto');
const QRCode = require('qrcode');
const { buildQrPayload, buildVisitorQrPayload } = require('../../shared/soldier-profile.cjs');
const { isAllowedRequest } = require('./allowed-requests.cjs');

const ID_PATTERN = /^[0-9a-f-]{36}$/i;
// 1200 px keeps the dense modules crisp when printed on a 3.5 x 4 inch label.
const QR_OPTIONS = { errorCorrectionLevel: 'L', margin: 2, width: 1200 };

function registerSessionChannels({ expose, connection }) {
  const requireSession = () => {
    if (!connection.signedIn) throw new Error('سجل الدخول أولًا');
  };

  expose('app:login', (credentials) => connection.login(credentials));

  expose('app:logout', async () => {
    await connection.logout();
    return true;
  });

  expose('app:request', (arg) => {
    connection.requireServer();
    requireSession();
    if (!isAllowedRequest(arg)) throw new Error('الوظيفة غير مسموحة');
    return connection.request(arg.method, arg.path, arg.data, arg.requestId);
  });

  expose('app:qr', async (soldierId) => {
    if (!connection.token || !ID_PATTERN.test(soldierId)) throw new Error('معرف العسكري غير صالح أو الجلسة مغلقة');
    const { soldier } = await connection.request('GET', `/api/soldier?id=${encodeURIComponent(soldierId)}`);
    return QRCode.toDataURL(buildQrPayload(soldier), QR_OPTIONS);
  });

  expose('app:qrVisitor', async (visitorId) => {
    if (!connection.token || !ID_PATTERN.test(visitorId)) throw new Error('معرف الزائر غير صالح أو الجلسة مغلقة');
    const { visitor } = await connection.request('GET', `/api/gate/visitor?id=${encodeURIComponent(visitorId)}`);
    return QRCode.toDataURL(buildVisitorQrPayload(visitor), QR_OPTIONS);
  });

  /** Server access for output.cjs (printing/export); POST requests get a fresh request id. */
  return {
    api: (method, route, data, requestId) => {
      requireSession();
      return connection.request(method, route, data, method === 'POST' ? requestId || randomUUID() : undefined);
    },
  };
}

module.exports = { registerSessionChannels };
