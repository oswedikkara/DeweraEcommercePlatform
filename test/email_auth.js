const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');const fs=require('node:fs');
const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('backend/database/schema.sql','utf8'));
const database=require.resolve('../backend/database/db');require.cache[database]={id:database,filename:database,loaded:true,exports:{getDb:()=>db,syncToJson:()=>{}}};
const Access=require('../backend/services/AdminAccessService');const Auth=require('../backend/services/EmailAuthService');const Sessions=require('../backend/middleware/auth');const Preview=require('../backend/services/PreviewService');const Config=require('../backend/services/ConfigService');const Contact=require('../backend/services/ContactService');
const owner=Access.OWNERS[0];let delivered=[];const mail={configured:()=>true,sendCode:async(email,code)=>delivered.push({email,code})};
function resetLimits(){db.exec('DELETE FROM auth_rate_limits');}
(async()=>{
 assert.equal(Access.list().filter(e=>e.protected).length,2);
 for(const root of Access.OWNERS){assert(Access.isAllowed(root));assert.throws(()=>Access.change(owner,root,true),/protected/);assert.throws(()=>Access.change(owner,root),/protected/);}
 assert.throws(()=>Access.change('deweragems@gmail.com','other@example.test'),/Only/);
 Access.change(owner,' OTHER@example.test ');assert(Access.isAllowed('other@example.test'));
 const challenge=await Auth.request(owner,'test',mail);assert.equal(delivered.length,1);assert(!JSON.stringify(challenge).includes(delivered[0].code));
 const row=db.prepare('SELECT * FROM email_login_codes WHERE id=?').get(challenge.challengeId);assert.notEqual(row.code_hash,delivered[0].code);
 const signed=Auth.verify(challenge.challengeId,delivered[0].code,'test');assert.equal(signed.user.isOwner,true);
 assert(Sessions.getStaffSession({headers:{authorization:'Bearer '+signed.token}}));assert.equal(Sessions.getStaffSession({headers:{'x-staff-token':'head_admin'}}),null);
 assert.equal(db.prepare('SELECT token FROM staff_sessions').get().token,Access.digest(signed.token));
 assert.throws(()=>Auth.verify(challenge.challengeId,delivered[0].code,'test'),/invalid|used/);
 resetLimits();const denied=await Auth.request('outsider@example.test','test',mail);assert.equal(delivered.length,1);assert.throws(()=>Auth.verify(denied.challengeId,'123456','test'),/invalid/);
 resetLimits();const wrong=await Auth.request(owner,'test',mail);const good=delivered.at(-1).code;const bad=good==='000000'?'111111':'000000';for(let i=0;i<5;i++)assert.throws(()=>Auth.verify(wrong.challengeId,bad,'test'));assert.throws(()=>Auth.verify(wrong.challengeId,good,'test'),/invalid/);
 resetLimits();const expired=await Auth.request(owner,'test',mail);db.prepare('UPDATE email_login_codes SET expires_at=0 WHERE id=?').run(expired.challengeId);assert.throws(()=>Auth.verify(expired.challengeId,delivered.at(-1).code,'test'),/expired/);
 resetLimits();await assert.rejects(Auth.request(owner,'test',{configured:()=>false}),e=>e.status===503);
 resetLimits();await Auth.request(owner,'test',mail);await assert.rejects(Auth.request(owner,'test',mail),e=>e.status===429);
 resetLimits();const other=await Auth.request('other@example.test','test',mail);const otherSession=Auth.verify(other.challengeId,delivered.at(-1).code,'test');const preview=Preview.issue('other@example.test');assert(Preview.valid(preview));Access.change(owner,'other@example.test',true);assert.equal(Sessions.getStaffSession({headers:{'x-staff-token':otherSession.token}}),null);assert(!Preview.valid(preview));
 Access.change(owner,'deweragems@gmail.com',true);assert(!Access.isAllowed('deweragems@gmail.com'));Access.ensure();assert(!Access.isAllowed('deweragems@gmail.com'));
 Config.updateSetting('deweraWhatsApp','+94771210101');const url=new URL(Contact.whatsapp({inquiryId:'test-ref',customerName:'Test',customerEmail:'test@example.test',message:'A & B'}));assert.equal(url.hostname,'wa.me');assert.equal(url.pathname,'/94771210101');assert(url.searchParams.get('text').includes('test-ref'));
 console.log('Email codes, protected owners, revocation, throttling, preview tokens and WhatsApp checks passed; no email sent.');
})().catch(error=>{console.error(error);process.exitCode=1;});
