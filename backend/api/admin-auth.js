const Access=require('../services/AdminAccessService');
const EmailAuth=require('../services/EmailAuthService');
const Mail=require('../services/EmailDeliveryService');
const Config=require('../services/ConfigService');
const {getStaffSession,extractToken}=require('../middleware/auth');
const {getDb}=require('../database/db');
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
function body(req){return new Promise((resolve,reject)=>{let data='';let tooLarge=false;req.on('data',chunk=>{if(data.length+chunk.length>16000)tooLarge=true;else data+=chunk;});req.on('end',()=>{try{if(tooLarge)throw Error('Request too large.');resolve(JSON.parse(data||'{}'));}catch(error){reject(error);}});req.on('error',reject);});}
async function handle(req,res,pathname){
 const retired=['/api/staff/login','/api/staff/create','/api/staff/update','/api/staff/delete'];
 if(retired.includes(pathname)){send(res,410,{success:false,error:'Password and legacy staff management have been retired. Use approved-email sign-in.'});return true;}
 if(!pathname.startsWith('/api/auth/')&&!pathname.startsWith('/api/admin/'))return false;
 try{
  const ip=req.socket?.remoteAddress||'local';
  if(pathname==='/api/auth/request-code'&&req.method==='POST'){const input=await body(req);send(res,200,{success:true,...await EmailAuth.request(input.email,ip)});return true;}
  if(pathname==='/api/auth/verify-code'&&req.method==='POST'){const input=await body(req);send(res,200,{success:true,...EmailAuth.verify(input.challengeId,input.code,ip)});return true;}
  const user=getStaffSession(req);
  if(!user){send(res,401,{success:false,error:'Sign in using an approved email address.'});return true;}
  if(pathname==='/api/auth/session'&&req.method==='GET'){send(res,200,{success:true,user});return true;}
  if(pathname==='/api/auth/logout'&&req.method==='POST'){getDb().prepare('DELETE FROM staff_sessions WHERE token=?').run(Access.digest(extractToken(req)));require('../middleware/auth').revokeStaffSession(extractToken(req));send(res,200,{success:true});return true;}
  if(pathname==='/api/admin/preview-token'&&req.method==='POST'){send(res,200,{success:true,token:require('../services/PreviewService').issue(user.email)});return true;}
  if(pathname==='/api/admin/access'&&req.method==='GET'){send(res,200,{success:true,emails:Access.list(),canManage:Access.isOwner(user.email)});return true;}
  if(pathname==='/api/admin/access'&&req.method==='POST'){const input=await body(req);if(!Access.isOwner(user.email)){send(res,403,{success:false,error:'Only the protected owners can manage access.'});return true;}send(res,200,{success:true,emails:Access.change(user.email,input.email,input.action==='remove')});return true;}
  if(pathname==='/api/admin/settings'&&req.method==='GET'){
   send(res,200,{success:true,settings:{maintenanceMode:Config.isMaintenanceModeEnabled(),businessEmail:require('../services/ContactService').details().businessEmail,whatsappNumber:require('../services/ContactService').details().whatsappNumber,maintenanceMessage:Config.getSetting('maintenanceMessage','Our collection is temporarily unavailable. Please contact Dewera for assistance.')},emailDeliveryConfigured:Mail.configured(),isOwner:Access.isOwner(user.email)});return true;
  }
  if(pathname==='/api/admin/settings'&&req.method==='POST'){
   const input=await body(req);const updates={};
   if(input.maintenanceMode!==undefined){if(typeof input.maintenanceMode!=='boolean')throw Error('Invalid maintenance setting.');updates.maintenanceMode=input.maintenanceMode;}
   if(input.businessEmail!==undefined){const email=Access.normalize(input.businessEmail);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Enter a valid business email.');updates.deweraEmail=email;}
   if(input.whatsappNumber!==undefined){const phone=String(input.whatsappNumber).replace(/[^\d+]/g,'');if(!/^\+?[1-9]\d{7,14}$/.test(phone))throw Error('Enter an international WhatsApp number.');updates.deweraWhatsApp=phone;}
   if(input.maintenanceMessage!==undefined){if(typeof input.maintenanceMessage!=='string'||input.maintenanceMessage.length>1000)throw Error('Maintenance text is too long.');updates.maintenanceMessage=input.maintenanceMessage;}
   Config.updateMultipleSettings(updates,user.username);send(res,200,{success:true});return true;
  }
  send(res,404,{success:false,error:'Endpoint not found.'});return true;
 }catch(error){send(res,error.status||400,{success:false,error:error.message});return true;}
}
module.exports={handle};
