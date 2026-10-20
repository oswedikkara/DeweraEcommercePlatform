const assert=require('node:assert/strict');const {DatabaseSync}=require('node:sqlite');const fs=require('node:fs');
const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('backend/database/schema.sql','utf8'));const source=require.resolve('../backend/database/db');require.cache[source]={id:source,filename:source,loaded:true,exports:{getDb:()=>db,syncToJson:()=>{}}};
const Mail=require('../backend/services/EmailDeliveryService');const Queue=require('../backend/services/InquiryNotificationService');
const payload={inquiryId:'test-notification',listingName:'Sapphire',customerName:'Client',customerEmail:'client@example.test',customerPhone:'+94770000000',preferredContact:'email',message:'Please send details.'};
(async()=>{
 const originalUser=process.env.DEWERA_GMAIL_USER,originalPass=process.env.DEWERA_GMAIL_APP_PASSWORD;delete process.env.DEWERA_GMAIL_USER;delete process.env.DEWERA_GMAIL_APP_PASSWORD;
 try{
  Queue.enqueue(payload);Queue.enqueue(payload);assert.equal(db.prepare('SELECT count(*) AS n FROM enquiry_notifications').get().n,1);assert.equal(await Queue.deliver(payload.inquiryId),'pending');
  let deliveries=0;const fake={configured:()=>true,sendEnquiry:async message=>{deliveries++;assert.equal(message.customerEmail,payload.customerEmail);}};
  assert.equal(await Queue.deliver(payload.inquiryId,fake),'sent');assert.equal(await Queue.deliver(payload.inquiryId,fake),'sent');assert.equal(deliveries,1);
  Queue.enqueue({...payload,inquiryId:'failed'});assert.equal(await Queue.deliver('failed',{configured:()=>true,sendEnquiry:async()=>{throw Error('Unavailable');}}),'failed');assert.equal(db.prepare('SELECT status FROM enquiry_notifications WHERE inquiry_id=?').get('failed').status,'failed');
  process.env.DEWERA_GMAIL_USER='deweragems@gmail.com';process.env.DEWERA_GMAIL_APP_PASSWORD='test-only';let sent;
  Mail.transport=()=>({sendMail:async message=>{sent=message;return{accepted:['deweragems@gmail.com']};}});
  await Mail.sendEnquiry(payload);assert.equal(sent.from.address,'deweragems@gmail.com');assert.equal(sent.replyTo.address,'client@example.test');assert.equal(sent.to,'deweragems@gmail.com');assert(sent.text.includes('test-notification'));assert(!sent.subject.includes('Please send'));
  await Mail.sendCode('os.wedikkara@gmail.com','123456');assert.equal(sent.to,'os.wedikkara@gmail.com');assert(sent.text.includes('123456'));
  Mail.transport=()=>({sendMail:async()=>{throw Error('Credentials must not leak');}});await assert.rejects(Mail.sendCode('os.wedikkara@gmail.com','123456'),e=>e.status===502&&!e.message.includes('Credentials'));
  console.log('Gmail sender/Reply-To, code delivery, durable enquiry queue and failure checks passed; no external messages sent.');
 }finally{if(originalUser===undefined)delete process.env.DEWERA_GMAIL_USER;else process.env.DEWERA_GMAIL_USER=originalUser;if(originalPass===undefined)delete process.env.DEWERA_GMAIL_APP_PASSWORD;else process.env.DEWERA_GMAIL_APP_PASSWORD=originalPass;db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
