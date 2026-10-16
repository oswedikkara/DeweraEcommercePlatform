const crypto=require('node:crypto');
const {getDb}=require('../database/db');
const Access=require('./AdminAccessService');
class PreviewService{
 static ensure(){const db=getDb();db.exec('CREATE TABLE IF NOT EXISTS admin_preview_tokens(hash TEXT PRIMARY KEY,email TEXT NOT NULL,expires_at INTEGER NOT NULL)');return db;}
 static issue(email){const token=crypto.randomBytes(24).toString('hex');this.ensure().prepare('INSERT INTO admin_preview_tokens VALUES (?,?,?)').run(Access.digest(token),email,Date.now()+600000);return token;}
 static valid(token){if(typeof token!=='string'||!/^[a-f0-9]{48}$/.test(token))return false;const row=this.ensure().prepare('SELECT * FROM admin_preview_tokens WHERE hash=? AND expires_at>?').get(Access.digest(token),Date.now());return !!row&&Access.isAllowed(row.email);}
}
module.exports=PreviewService;
