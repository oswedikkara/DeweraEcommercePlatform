const nodemailer = require('nodemailer');
class EmailDeliveryService {
  static configured() { return !!(process.env.DEWERA_GMAIL_USER && process.env.DEWERA_GMAIL_APP_PASSWORD); }
  static transport() {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {user: process.env.DEWERA_GMAIL_USER, pass: process.env.DEWERA_GMAIL_APP_PASSWORD?.replace(/\s/g, '')},
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
      disableFileAccess: true, disableUrlAccess: true
    });
  }
  static async send(message) {
    if (!this.configured()) { const error = Error('Connect Dewera Gmail using the server environment before sending email.'); error.status = 503; throw error; }
    try {
      const result = await this.transport().sendMail({...message, from: {name:'Dewera', address:process.env.DEWERA_GMAIL_USER}});
      if (!result.accepted?.length) throw Error('Recipient not accepted.');
    } catch { const error = Error('Email delivery is temporarily unavailable.'); error.status = 502; throw error; }
  }
  static async sendCode(email, code) {
    await this.send({to:email, subject:'Your Dewera sign-in code', text:'Your Dewera sign-in code is '+code+'.\n\nThis code expires in 10 minutes and can only be used once. If you did not request it, ignore this message. Dewera will never ask you to share this code.'});
  }
  static async sendEnquiry(payload) {
    await this.send({
      to:require('./ContactService').details().businessEmail,
      replyTo:{name:payload.customerName, address:payload.customerEmail},
      subject:'Dewera enquiry '+payload.inquiryId,
      text:['Reference: '+payload.inquiryId,'Gemstone: '+payload.listingName,'Name: '+payload.customerName,'Email: '+payload.customerEmail,'Phone: '+(payload.customerPhone||'Not provided'),'Preferred reply: '+payload.preferredContact,'',payload.message].join('\n')
    });
  }
}
module.exports = EmailDeliveryService;
