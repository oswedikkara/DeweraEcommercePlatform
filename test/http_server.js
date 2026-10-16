const assert=require('node:assert/strict');const {DatabaseSync}=require('node:sqlite');const fs=require('node:fs');const path=require('node:path');
const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('backend/database/schema.sql','utf8'));const database=require.resolve('../backend/database/db');require.cache[database]={id:database,filename:database,loaded:true,exports:{initDb:()=>db,getDb:()=>db,syncToJson:()=>{}}};
const {createServer}=require('../backend/http/server');const Config=require('../backend/services/ConfigService');const Preview=require('../backend/services/PreviewService');
(async()=>{const server=createServer({root:path.resolve('store'),port:0,store:true});await new Promise(resolve=>server.listening?resolve():server.once('listening',resolve));const origin='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await fetch(origin+'/index.html')).status,200);assert.equal((await fetch(origin+'/config.json')).status,404);assert.equal((await fetch(origin+'/api/gems',{headers:{'x-staff-token':'head_admin'}})).status,200);
  assert.equal((await fetch(origin+'/api/staff/login',{method:'POST'})).status,410);assert.equal((await fetch(origin+'/api/admin/settings')).status,401);assert.equal((await fetch(origin+'/api/payments')).status,410);
  Config.updateSetting('maintenanceMode',true);assert.equal((await fetch(origin+'/index.html')).status,503);assert.equal((await fetch(origin+'/api/gems')).status,503);assert.equal((await fetch(origin+'/index.html?admin=preview')).status,503);
  const token=Preview.issue('os.wedikkara@gmail.com');assert.equal((await fetch(origin+'/index.html?preview='+token)).status,200);assert.equal((await fetch(origin+'/api/gems?preview='+token)).status,200);assert.equal((await fetch(origin+'/api/enquire?preview='+token,{method:'POST'})).status,503);assert.equal((await fetch(origin+'/api/admin/settings?preview='+token)).status,401);
  console.log('HTTP static privacy, maintenance, scoped preview and retired-auth checks passed.');
 }finally{await new Promise(resolve=>server.close(resolve));db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
