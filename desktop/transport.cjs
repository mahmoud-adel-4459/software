'use strict';
const https = require('node:https');
const { randomUUID } = require('node:crypto');
const { sign, requestMessage } = require('../shared/crypto.cjs');

function validateServer(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new Error('أدخل عنوان HTTPS للخادم فقط، مثل https://server.local:8443');
  }
  return url.origin;
}
function callServer(config, identity, token, method, apiPath, data, requestId) {
  const body = method === 'GET' ? '' : JSON.stringify(data || {});
  const deviceId = identity.id;
  const timestamp = String(Date.now());
  const nonce = randomUUID();
  const signature = sign(
    identity.privateKey,
    requestMessage({ deviceId, timestamp, nonce, method, path: apiPath, body }),
  );
  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'X-Device-Id': deviceId,
    'X-Device-Key': Buffer.from(identity.publicKey).toString('base64'),
    'X-Timestamp': timestamp,
    'X-Nonce': nonce,
    'X-Signature': signature,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (requestId) headers['X-Request-Id'] = requestId;
  return new Promise((resolve, reject) => {
    const req = https.request(
      new URL(apiPath, validateServer(config.serverUrl)),
      {
        method,
        headers,
        ca: config.ca || undefined,
        rejectUnauthorized: true,
        timeout: 8000,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk.toString('utf8');
          if (Buffer.byteLength(raw) > 64 * 1024 * 1024) req.destroy(new Error('استجابة الخادم أكبر من المسموح'));
        });
        res.on('error', reject);
        res.on('end', () => {
          try {
            const result = JSON.parse(raw);
            if (res.statusCode < 200 || res.statusCode >= 300) {
              const error = new Error(result.error || 'تعذر تنفيذ الطلب');
              error.status = res.statusCode;
              reject(error);
            } else resolve(result);
          } catch {
            reject(new Error('استجابة الخادم غير صالحة'));
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('انتهت مهلة الاتصال؛ تحقق من الشبكة والخادم')));
    req.on('error', (error) => {
      const msg = error.message || '';
      if (msg.includes('مهلة')) return reject(error);
      if (error.code === 'ECONNREFUSED' || msg.includes('ECONNREFUSED')) {
        return reject(
          new Error(
            'الخادم لا يستجيب على هذا العنوان. شغّل lab:server أو Demo-Lab\\تشغيل-التجربة.cmd واترك النافذة مفتوحة.',
          ),
        );
      }
      if (error.code === 'ENOTFOUND' || msg.includes('ENOTFOUND')) {
        return reject(new Error('تعذر إيجاد عنوان الخادم؛ تحقق من اسم الجهاز أو IP في إعدادات الاتصال.'));
      }
      if (/certificate|UNABLE_TO_VERIFY|self signed|altnames|ERR_TLS/i.test(msg)) {
        return reject(
          new Error(
            'شهادة الخادم غير موثوقة: استورد ca-cert.pem من Demo-Lab\\private أو اضغط «شهادة التجربة المحلية» في الإعداد. إن أعدت lab:setup أعد استيراد الشهادة.',
          ),
        );
      }
      return reject(
        new Error(
          'تعذر الاتصال الآمن بالخادم؛ تحقق من العنوان والشبكة وشهادة الخادم — تأكد أن الخادم يعمل (lab:server أو خدمة الإنتاج).',
        ),
      );
    });
    req.end(body);
  });
}
module.exports = { validateServer, callServer };
