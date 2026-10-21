'use strict';
const fs=require('node:fs');const {serverFingerprint}=require('./identity.cjs');
try{
  const id=process.env.SERVER_ID;if(!id||id.includes('CHANGE_'))throw new Error('Configure SERVER_ID in .env');
  fs.writeFileSync('server-request.json',JSON.stringify({serverId:id,serverFingerprint:serverFingerprint(id)},null,2),{flag:'wx'});
  console.log('server-request.json created. Send this public request with both device requests to the owner.');
}catch(e){console.error(e.message);process.exitCode=1;}
