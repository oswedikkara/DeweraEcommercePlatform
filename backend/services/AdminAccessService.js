const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {getDb}=require('../database/db');
const OWNERS=Object.freeze(['os.wedikkara@gmail.com','pramodyadewmini.d@gmail.com']);
const normalize=value=>typeof value==='string'?value.trim().toLowerCase():'';
function ensure(){
 const db=getDb();
 db.exec(`CREATE TABLE IF NOT EXISTS admin_access(email TEXT PRIMARY KEY,added_by TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS admin_auth_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS email_login_codes(id TEXT PRIMARY KEY,email TEXT NOT NULL,code_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,used INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS auth_rate_limits(bucket TEXT PRIMARY KEY,count INTEGER NOT NULL,reset_at INTEGER NOT NULL);`);
 if(!db.prepare("SELECT value FROM admin_auth_meta WHERE key='access_initialized'").get()){
  let email='deweragems@gmail.com';
  try{email=normalize(JSON.parse(fs.readFileSync(path.join(__dirname,'../../store/config.json'),'utf8')).businessEmail)||email;}catch{}
  db.prepare('INSERT OR IGNORE INTO admin_access(email,added_by) VALUES (?,?)').run(email,'initial-site-email');
  db.prepare("INSERT OR IGNORE INTO admin_auth_meta(key,value) VALUES ('access_initialized','1')").run();
 }
 return db;
}
function isOwner(email){return OWNERS.includes(normalize(email));}
function isAllowed(email){const clean=normalize(email);if(!clean.includes('@'))return false;if(isOwner(clean))return true;return !!ensure().prepare('SELECT email FROM admin_access WHERE email=?').get(clean);}
function list(){const records=ensure().prepare('SELECT email,added_by,created_at FROM admin_access ORDER BY email').all();return [...OWNERS.map(email=>({email,protected:true,owner:true})),...records.filter(r=>!isOwner(r.email)).map(r=>({...r,protected:false,owner:false}))];}
function change(actor,email,remove=false){
 if(!isOwner(actor))throw Error('Only the two protected owners can manage approved emails.');
 const clean=normalize(email);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)||clean.length>254)throw Error('Enter a valid email address.');
 if(isOwner(clean))throw Error('The protected owners cannot be edited, removed or have their access changed.');
 const db=ensure();
 if(remove){db.prepare('DELETE FROM admin_access WHERE email=?').run(clean);db.prepare('DELETE FROM staff_sessions WHERE LOWER(username)=?').run(clean);db.prepare('DELETE FROM email_login_codes WHERE email=?').run(clean);}
 else db.prepare('INSERT OR IGNORE INTO admin_access(email,added_by) VALUES (?,?)').run(clean,normalize(actor));
 return list();
}
function rate(bucket,limit,windowMs,now=Date.now()){
 const db=ensure();const row=db.prepare('SELECT * FROM auth_rate_limits WHERE bucket=?').get(bucket);
 if(row&&row.reset_at>now&&row.count>=limit){const error=Error('Too many attempts. Please wait before trying again.');error.status=429;throw error;}
 if(!row||row.reset_at<=now)db.prepare('INSERT OR REPLACE INTO auth_rate_limits(bucket,count,reset_at) VALUES (?,1,?)').run(bucket,now+windowMs);
 else db.prepare('UPDATE auth_rate_limits SET count=count+1 WHERE bucket=?').run(bucket);
}
function digest(value){return crypto.createHash('sha256').update(value).digest('hex');}
module.exports={OWNERS,normalize,ensure,isOwner,isAllowed,list,change,rate,digest};
