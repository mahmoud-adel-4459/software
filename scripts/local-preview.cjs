'use strict';
// Development-only browser preview. Never packaged or used by production startup.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {randomUUID,randomBytes}=require('node:crypto');
const {keyPair,hashPassword,sign,requestMessage}=require('../shared/crypto.cjs');
const {createPool}=require('../tests/pglite-pool.cjs');
const {Store}=require('../server/store.cjs');
const {createHandler}=require('../server/api.cjs');
const QRCode=require('qrcode');
const {seedSampleData}=require('./lab-sample-data.cjs');
async function main(){
 const pool=await createPool(),store=new Store(pool);await store.migrate();
 const password=randomBytes(9).toString('base64url');
 await pool.query('INSERT INTO users(id,username,name,password_hash,role) VALUES($1,$2,$3,$4,$5)',[randomUUID(),'admin','مسؤول تجربة محلية',await hashPassword(password),'admin']);
 if(await seedSampleData(pool))console.log('Sample data: 3 demo soldiers (e.g. 000012345).');
 const devices=['internal','gate'].map(kind=>({id:randomUUID(),kind,...keyPair()}));
 const api=http.createServer(createHandler({store,licenseProvider:()=>({installation:'تجربة محلية فقط',devices})}));
 await new Promise(r=>api.listen(0,'127.0.0.1',r));
 const upstream=`http://127.0.0.1:${api.address().port}`,secret=randomBytes(32).toString('hex'),sessions=new Map();
 const root=path.resolve(__dirname,'..');let origin;
 async function call(s,method,route,data,id){
  if(!['GET','POST'].includes(method)||!/^\/api\/[a-zA-Z/]+(?:\?[^#]*)?$/.test(route))throw new Error('Invalid API route');
  const body=method==='GET'?'':JSON.stringify(data||{}),timestamp=String(Date.now()),nonce=randomUUID(),device=s.device;
  const headers={'Content-Type':'application/json','X-Device-Id':device.id,'X-Timestamp':timestamp,'X-Nonce':nonce,'X-Signature':sign(device.privateKey,requestMessage({deviceId:device.id,timestamp,nonce,method,path:route,body}))};
  if(s.token)headers.Authorization=`Bearer ${s.token}`;if(method==='POST')headers['X-Request-Id']=id||randomUUID();
  const response=await fetch(upstream+route,{method,headers,body:method==='GET'?undefined:body});const result=await response.json();
  if(response.ok&&route==='/api/login'){s.token=result.token;delete result.token;}
  if(route==='/api/logout'||response.status===401)s.token=null;
  return response.ok?{ok:true,data:result}:{ok:false,error:result.error,status:response.status};
 }
 let webPort=0;
 function hostAllowed(hostHeader){
  if(!hostHeader)return false;
  const match=hostHeader.match(/^(.*):(\d+)$/);
  const hostname=match?match[1]:hostHeader;
  const port=Number(match?match[2]:80);
  if(port!==webPort)return false;
  return ['127.0.0.1','localhost','[::1]','::1'].includes(hostname);
 }
 const web=http.createServer(async(req,res)=>{
  try{
   res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
   if(!hostAllowed(req.headers.host)){res.writeHead(403);return res.end();}
   const url=new URL(req.url,origin);
   if(req.method==='POST'&&url.pathname==='/preview'){
    if(req.headers.origin!==origin||req.headers['x-preview-secret']!==secret){res.writeHead(403);return res.end();}
    let body='';for await(const chunk of req){body+=chunk;if(body.length>8*1024*1024)throw new Error('Request too large');}
    const a=JSON.parse(body);let s=sessions.get(a.session),result;
    if(a.action==='info'){
     if(!s){s={device:devices.find(d=>d.kind===(a.kind==='gate'?'gate':'internal'))};a.session=randomUUID();sessions.set(a.session,s);}
     result={ok:true,data:{serverUrl:origin,deviceId:s.device.id,fingerprint:'LOCAL TEST',version:'0.2.0 — تجربة مؤقتة',previewSession:a.session,caImported:true,previewMode:true,labMode:false}};
    }else{
     if(!s)throw new Error('Reload preview');
     if(a.action==='login')result=await call(s,'POST','/api/login',a.data);
     else if(a.action==='logout')result=await call(s,'POST','/api/logout');
     else if(a.action==='request')result=await call(s,a.method,a.path,a.data,a.requestId);
     else if(a.action==='qr'){if(!s.token||!/^\d{6,30}$/.test(a.data))throw new Error('Invalid QR');result={ok:true,data:await QRCode.toDataURL(a.data)};}
     else throw new Error('هذه الوظيفة تحتاج تطبيق Electron وليست متاحة في معاينة المتصفح');
    }
    res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(result));
   }
   if(req.method!=='GET'){res.writeHead(405);return res.end();}
   if(url.pathname==='/'){res.writeHead(302,{Location:'/renderer/index.html'+url.search});return res.end();}
   if(url.pathname==='/preview-bridge.js'){res.setHeader('Content-Type','text/javascript');return res.end('const previewSecret='+JSON.stringify(secret)+';\n'+fs.readFileSync(path.join(__dirname,'preview-bridge.js'),'utf8'));}
   if(!/^\/(renderer|css|fonts)\/[\w./-]+$/.test(url.pathname))throw new Error('Not found');
   const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep))throw new Error('Not found');
   const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf'};
   if(!types[path.extname(file)])throw new Error('Not found');res.setHeader('Content-Type',types[path.extname(file)]);
   let content=fs.readFileSync(file);
   if(url.pathname==='/renderer/index.html')content=content.toString().replace("connect-src 'none'","connect-src 'self'").replace('<script src="icons.js">','<script src="/preview-bridge.js"></script><script src="icons.js">');
   res.end(content);
  }catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:e.message}));}
 });
 await new Promise(r=>web.listen(0,'127.0.0.1',r));webPort=web.address().port;origin=`http://127.0.0.1:${webPort}`;
 const localUrl=`http://localhost:${webPort}`;
 const loginNote=path.join(root,'private','preview-login.txt');
 fs.mkdirSync(path.join(root,'private'),{recursive:true});
 fs.writeFileSync(loginNote,`Browser preview (npm.cmd run preview:local)\r\nInternal: ${origin}\r\nGate: ${origin}/?device=gate\r\nUsername: admin\r\nPassword: ${password}\r\n\r\nPassword changes every time you restart preview. Do NOT use private/lab-login.txt here.\r\n`,'utf8');
 console.log(`LOCAL PREVIEW (temporary data; cleared when stopped)\nInternal: ${origin}\n         or ${localUrl}\nGate: ${origin}/?device=gate\nUsername: admin\nPassword: ${password}\nSaved: private/preview-login.txt\nKeep this terminal open while using the preview.\nNative printing, PDF, backups and file dialogs are not available in this preview.`);
 async function stop(){web.close();api.close();await pool.end();process.exit(0);}process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
main().catch(e=>{console.error(e);process.exit(1);});
