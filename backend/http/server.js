const http=require('node:http');const fs=require('node:fs');const path=require('node:path');
const {initDb}=require('../database/db');const {handleApiRequest}=require('../api/router');const Config=require('../services/ConfigService');const Preview=require('../services/PreviewService');const Contact=require('../services/ContactService');
const escape=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon'};
function createServer({root,port,store=false}){
 initDb();
 let notificationTimer;
 if(store){const notifications=require('../services/InquiryNotificationService');let sending=false;const retry=async()=>{if(sending)return;sending=true;try{await notifications.retryPending();}catch{console.error('[Dewera] Notification retry unavailable.');}finally{sending=false;}};retry();notificationTimer=setInterval(retry,60000);notificationTimer.unref();}

 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
  const origin=req.headers.origin;if(['http://localhost:3000','http://localhost:3001','http://127.0.0.1:3000','http://127.0.0.1:3001'].includes(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, x-staff-token');res.setHeader('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  try{
   const url=new URL(req.url,'http://localhost:'+port);
   if(await handleApiRequest(req,res))return;
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end('Method not allowed');return;}
   const requestPath=decodeURIComponent(url.pathname)==='/'?'/index.html':decodeURIComponent(url.pathname);
   const file=path.resolve(root,'.'+requestPath);const relative=path.relative(root,file);const ext=path.extname(file).toLowerCase();
   if(relative.startsWith('..')||path.isAbsolute(relative)||!MIME[ext]||requestPath.includes('\0')){res.writeHead(404);res.end('Not found');return;}
   if(store&&ext==='.html'&&Config.isMaintenanceModeEnabled()&&!Preview.valid(url.searchParams.get('preview'))){
    const contact=Contact.details();res.writeHead(503,{'Content-Type':MIME['.html'],'Retry-After':'300'});
    res.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Dewera - temporarily unavailable</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8f7ef;color:#294332;font-family:"Segoe UI",Arial,sans-serif}main{max-width:530px;padding:40px}small{letter-spacing:.25em}h1{font-size:42px;font-weight:400;line-height:1.2}p{line-height:1.9;color:#7b856e}a{color:#4b7043}</style><main><small>DEWERA</small><h1>We will be with you shortly.</h1><p>'+escape(Config.getSetting('maintenanceMessage','Our collection is temporarily unavailable. Please contact Dewera for assistance.'))+'</p><a href="mailto:'+escape(contact.businessEmail)+'">'+escape(contact.businessEmail)+'</a></main></html>');return;
   }
   fs.readFile(file,(error,data)=>{if(error){res.writeHead(error.code==='ENOENT'?404:500);res.end('Page unavailable');return;}res.writeHead(200,{'Content-Type':MIME[ext],'Cache-Control':ext==='.html'?'no-store':'no-cache'});res.end(req.method==='HEAD'?undefined:data);});
  }catch(error){if(!res.headersSent){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({success:false,error:'The request could not be completed.'}));}else res.end();console.error('[Dewera request error]',error.message);}
 });
 server.on('close',()=>clearInterval(notificationTimer));
 server.on('error',error=>console.error('[Dewera server]',error.message));server.listen(port,()=>console.log('Dewera '+(store?'store':'management')+' running at http://localhost:'+port));return server;
}
module.exports={createServer};
