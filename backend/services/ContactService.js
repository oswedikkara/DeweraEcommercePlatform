const fs=require('node:fs');const path=require('node:path');const Config=require('./ConfigService');
class ContactService{
 static details(){let config={};try{config=JSON.parse(fs.readFileSync(path.join(__dirname,'../../store/config.json'),'utf8'));}catch{}
  let email=Config.getSetting('deweraEmail',config.businessEmail||'deweragems@gmail.com');if(email==='concierge@dewera.com')email=config.businessEmail||'deweragems@gmail.com';
  let phone=Config.getSetting('deweraWhatsApp',config.whatsappNumber||'+94771210101');if(['+94771234567','+94770000000'].includes(phone))phone=config.whatsappNumber||'+94771210101';
  return {businessEmail:email,whatsappNumber:phone,atelierName:config.atelierName||'Dewera',maintenanceMode:Config.isMaintenanceModeEnabled()};
 }
 static whatsapp({inquiryId,listingName='Personal consultation',customerName,customerEmail,customerPhone='',message=''}){
  const phone=String(this.details().whatsappNumber).replace(/\D/g,'');if(!/^[1-9]\d{7,14}$/.test(phone))return null;
  const text=['DEWERA ENQUIRY: '+inquiryId,'Interest: '+listingName,'Name: '+customerName,'Email: '+customerEmail,customerPhone?'Phone: '+customerPhone:'',message].filter(Boolean).join('\n');
  return 'https://wa.me/'+phone+'?text='+encodeURIComponent(text);
 }
}
module.exports=ContactService;
