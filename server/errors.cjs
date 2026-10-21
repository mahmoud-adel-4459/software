'use strict';
class AppError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function requireValue(condition, message, status = 400) {
  if (!condition) throw new AppError(status, message);
}
module.exports = { AppError, requireValue };
