const {getDb}=require('../database/db');
const Mail=require('./EmailDeliveryService');
function ensure(){const db=getDb();db.exec(`CREATE TABLE IF NOT EXISTS enquiry_notifications(inquiry_id TEXT PRIMARY KEY,payload_json TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL);`);return db;}
function enqueue(payload){ensure().prepare('INSERT OR IGNORE INTO enquiry_notifications(inquiry_id,payload_json,updated_at) VALUES(?,?,?)').run(payload.inquiryId,JSON.stringify(payload),Date.now());}
async function deliver(id,delivery=Mail){
 const db=ensure();if(!delivery.configured())return 'pending';
 const row=db.prepare('SELECT * FROM enquiry_notifications WHERE inquiry_id=?').get(id);if(!row)return 'pending';
 if(row.status==='sent')return 'sent';
 const claim=db.prepare("UPDATE enquiry_notifications SET status='sending',attempts=attempts+1,updated_at=? WHERE inquiry_id=? AND status IN ('pending','failed') AND attempts<3 AND next_attempt_at<=?").run(Date.now(),id,Date.now());
 if(claim.changes!==1)return row.status;
 try{await delivery.sendEnquiry(JSON.parse(row.payload_json));db.prepare("UPDATE enquiry_notifications SET status='sent',updated_at=? WHERE inquiry_id=?").run(Date.now(),id);return 'sent';}
 catch{db.prepare("UPDATE enquiry_notifications SET status='failed',next_attempt_at=?,updated_at=? WHERE inquiry_id=?").run(Date.now()+300000,Date.now(),id);return 'failed';}
}
async function retryPending(){if(!Mail.configured())return;const db=ensure();db.prepare("UPDATE enquiry_notifications SET status='failed' WHERE status='sending' AND updated_at<?").run(Date.now()-600000);const rows=db.prepare("SELECT inquiry_id FROM enquiry_notifications WHERE status IN ('pending','failed') AND attempts<3 AND next_attempt_at<=? ORDER BY updated_at LIMIT 5").all(Date.now());for(const row of rows)await deliver(row.inquiry_id);}
module.exports={enqueue,deliver,retryPending};
