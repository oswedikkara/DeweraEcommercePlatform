class EmailDeliveryService {
 static configured(){return !!(process.env.RESEND_API_KEY&&process.env.DEWERA_EMAIL_FROM);}
 static async sendCode(email,code){
  if(!this.configured()){const error=Error('Email sign-in is not ready. Configure RESEND_API_KEY and DEWERA_EMAIL_FROM on the server.');error.status=503;throw error;}
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.DEWERA_EMAIL_FROM,to:[email],subject:'Your Dewera sign-in code',text:'Your Dewera sign-in code is '+code+'.\n\nThis code expires in 10 minutes and can only be used once. If you did not request it, ignore this message. Dewera will never ask you to share this code.'}),signal:AbortSignal.timeout(15000)});
  if(!response.ok){const error=Error('The sign-in email could not be delivered. Please try again later or contact an owner.');error.status=502;throw error;}
 }
}
module.exports=EmailDeliveryService;
