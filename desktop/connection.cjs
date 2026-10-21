'use strict';
/**
 * The app's link to the server: saved settings (address + trusted CA), the device identity,
 * and the signed-in session. The session token lives only here (main process) and never
 * reaches the renderer.
 */
const fs = require('node:fs');
const path = require('node:path');
const { validateServer, callServer } = require('./transport.cjs');
const { readBundledCa } = require('./bundled-files.cjs');

const LOCAL_SERVER = /^https:\/\/(127\.0\.0\.1|localhost):8443\/?$/i;

class Connection {
  /**
   * @param {{ userDataDir: string, onSignedOut?: () => void }} options
   *   onSignedOut runs whenever the session ends (logout, 401, server change).
   */
  constructor({ userDataDir, onSignedOut = () => {} }) {
    this.configFile = path.join(userDataDir, 'connection.json');
    this.onSignedOut = onSignedOut;
    this.config = { serverUrl: '' };
    this.identity = null;
    this.token = null;
    this.session = null; // { user, kind, installation } returned by the server at login
  }

  // ---- settings ----------------------------------------------------------------------------

  save() {
    fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2));
  }

  /** Reads connection.json (normal and lab modes). */
  loadSaved() {
    if (fs.existsSync(this.configFile)) this.config = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
  }

  /** Standalone/play mode: the server is the embedded one, trusting its own CA. */
  useEmbeddedServer({ origin, ca }) {
    this.config = { serverUrl: origin, ca };
    this.save();
  }

  /** Lab mode: default to the local lab server and its bundled CA. */
  useLabDefaults() {
    this.config.ca = this.config.ca || readBundledCa();
    if (!this.config.serverUrl) this.config.serverUrl = 'https://127.0.0.1:8443';
    this.save();
  }

  /** For a local server address, trust the bundled demo CA when none was imported. */
  applyBundledCaIfLocal() {
    if (!LOCAL_SERVER.test(this.config.serverUrl || '')) return false;
    if (this.config.ca) return true;
    const cert = readBundledCa();
    if (!cert) return false;
    this.config.ca = cert;
    this.save();
    return true;
  }

  setServerUrl(value) {
    this.config.serverUrl = validateServer(value);
    this.endSession();
    this.save();
    return this.config.serverUrl;
  }

  setCa(pem) {
    this.config.ca = pem;
    this.save();
  }

  requireServer() {
    if (!this.config.serverUrl) throw new Error('اضبط عنوان الخادم أولًا');
  }

  // ---- session -----------------------------------------------------------------------------

  get signedIn() {
    return Boolean(this.token && this.session);
  }

  endSession() {
    this.token = null;
    this.session = null;
    this.onSignedOut();
  }

  async login(credentials) {
    this.requireServer();
    if (!this.config.ca) this.applyBundledCaIfLocal();
    this.endSession();
    const result = await callServer(this.config, this.identity, null, 'POST', '/api/login', credentials);
    this.token = result.token;
    this.session = { user: result.user, kind: result.kind, installation: result.installation };
    return this.session;
  }

  async logout() {
    const previous = this.token;
    this.endSession();
    if (previous) await callServer(this.config, this.identity, previous, 'POST', '/api/logout', {});
  }

  /** Signed API call; a 401 from the server ends the local session too. */
  async request(method, apiPath, data, requestId) {
    try {
      return await callServer(this.config, this.identity, this.token, method, apiPath, data, requestId);
    } catch (error) {
      if (error.status === 401) this.endSession();
      throw error;
    }
  }
}

module.exports = { Connection };
