const crypto=require('node:crypto');
const Access=require('./AdminAccessService');
const Mail=require('./EmailDeliveryService');
class EmailAuthService{
 static async request(email,ip,delivery=Mail){
  const clean=Access.normalize(email);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)||clean.length>254)throw Error('Enter a valid email address.');
  Access.rate('request-ip:'+ip,20,3600000);Access.rate('request-email:'+clean,5,3600000);Access.rate('resend:'+clean,1,60000);
  if(!delivery.configured()){const error=Error('Email sign-in is not configured yet. The site owners need to connect the email sending service.');error.status=503;throw error;}
  const id=crypto.randomBytes(24).toString('hex');
  if(!Access.isAllowed(clean))return {challengeId:id,message:'If this email is approved, a sign-in code has been sent.'};
  const db=Access.ensure();const code=String(crypto.randomInt(0,1000000)).padStart(6,'0');
  db.prepare('UPDATE email_login_codes SET used=1 WHERE email=? AND used=0').run(clean);
  db.prepare('INSERT INTO email_login_codes(id,email,code_hash,expires_at,created_at) VALUES (?,?,?,?,?)').run(id,clean,Access.digest(id+':'+code),Date.now()+600000,Date.now());
  try{await delivery.sendCode(clean,code);}catch(error){db.prepare('UPDATE email_login_codes SET used=1 WHERE id=?').run(id);throw error;}
  return {challengeId:id,message:'If this email is approved, a sign-in code has been sent.'};
 }
 static verify(challengeId,code,ip){
  Access.rate('verify-ip:'+ip,40,3600000);
  if(typeof challengeId!=='string'||!/^[a-f0-9]{48}$/.test(challengeId)||typeof code!=='string'||!/^\d{6}$/.test(code))throw Error('Enter the six-digit code from your email.');
  const db=Access.ensure();const row=db.prepare('SELECT * FROM email_login_codes WHERE id=?').get(challengeId);
  if(!row||row.used||row.expires_at<=Date.now()||row.attempts>=5||!Access.isAllowed(row.email))throw Error('This code is invalid or expired. Request a new code.');
  db.prepare('UPDATE email_login_codes SET attempts=attempts+1 WHERE id=?').run(challengeId);
  const expected=Buffer.from(row.code_hash,'hex');const actual=Buffer.from(Access.digest(challengeId+':'+code),'hex');
  if(!crypto.timingSafeEqual(expected,actual))throw Error('This code is invalid or expired. Request a new code.');
  const used=db.prepare('UPDATE email_login_codes SET used=1 WHERE id=? AND used=0 AND expires_at>?').run(challengeId,Date.now());
  if(used.changes!==1)throw Error('This code has already been used.');
  const token='tok_email_'+crypto.randomBytes(32).toString('hex');
  const user={staffId:'email-'+Access.digest(row.email).slice(0,20),username:row.email,email:row.email,name:row.email,role:'super_admin',isOwner:Access.isOwner(row.email)};
  require('../middleware/auth').registerStaffSession(token,user);
  return {token,user};
 }
}
module.exports=EmailAuthService;
