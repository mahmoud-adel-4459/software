'use strict';
/**
 * How the app was started:
 *   play        local data on this PC, no license (default for the installed app)
 *   standalone  embedded local server (play implies it)
 *   lab         lab devices + separate lab server
 *   (none)      normal: connects to the LAN server with an encrypted device key
 */
const path = require('node:path');
const { labDevicesFile } = require('./bundled-files.cjs');

const hasFlag = (flag) => process.argv.includes(flag);

const isPlayMode = () => hasFlag('--play') || process.env.MILITARY_AFFAIRS_PLAY === '1';
const isStandaloneMode = () =>
  isPlayMode() || hasFlag('--standalone') || process.env.MILITARY_AFFAIRS_STANDALONE === '1';
const isLabMode = () => {
  if (isStandaloneMode()) return false;
  return hasFlag('--lab') || process.env.MILITARY_AFFAIRS_LAB === '1' || Boolean(labDevicesFile());
};
const isSmokeTest = () => hasFlag('--smoke');

/** The installed app starts in play mode unless an explicit mode flag is given. */
function applyPackagedDefaults(app) {
  if (!app.isPackaged) return;
  const explicit = ['--lab', '--standalone', '--play', '--remote', '--smoke'].some(hasFlag);
  if (explicit || process.env.MILITARY_AFFAIRS_REMOTE === '1') return;
  process.argv.push('--play');
  process.env.MILITARY_AFFAIRS_PLAY = '1';
}

/** Where the play-mode login hint is written: beside the project in development, in the user's data folder once installed. */
const playLoginHintPath = (app) =>
  app.isPackaged ? path.join(app.getPath('userData'), 'play-login.txt') : path.join(__dirname, '../play-login.txt');

module.exports = { playLoginHintPath, isPlayMode, isStandaloneMode, isLabMode, isSmokeTest, applyPackagedDefaults };
