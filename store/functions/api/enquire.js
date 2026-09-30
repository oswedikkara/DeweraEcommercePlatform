/**
 * Cloudflare Pages Function: /api/enquire
 * Compatible with Cloudflare Pages edge runtime (Web Fetch API)
 * Dispatches:
 * 1. Client acquisition confirmation email
 * 2. Atelier alert to deweragems@gmail.com with VIP headers for automatic Gmail categorization
 * 3. Client & Atelier WhatsApp notification payloads
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const data = await request.json();
    const { 
      name, 
      email, 
      phone, 
      gemInterest, 
      settingPreference, 
      custodyPreference, 
      budget, 
      contactChannel, 
      message, 
      refCode 
    } = data;

    const businessEmail = (env && env.BUSINESS_EMAIL) || "deweragems@gmail.com";
    const deweraWhatsapp = (env && env.WHATSAPP_NUMBER) || "+94770000000";
    const resendApiKey = (env && env.RESEND_API_KEY) || "";
    const metaPhoneId = (env && env.WHATSAPP_PHONE_NUMBER_ID) || "";
    const metaToken = (env && env.WHATSAPP_ACCESS_TOKEN) || "";

    // 1. Dispatch Emails via Resend (standard HTTP API supported on Cloudflare edge)
    if (resendApiKey) {
      // Email 1: Confirmation to Client
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: "Dewera Ceylon Atelier <onboarding@resend.dev>",
            to: [email],
            subject: `Acquisition Confirmation: ${gemInterest} — Dewera Ceylon`,
            html: `
              <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #FAF8F5; border: 1px solid #E5E0D8; color: #1A1A1A;">
                <h1 style="letter-spacing: 0.25em; font-size: 20px; text-align: center; margin-bottom: 4px;">DEWERA</h1>
                <p style="text-align: center; font-size: 9px; letter-spacing: 0.35em; color: #8B7355; margin-top: 0; text-transform: uppercase;">Natural Heated &bull; Ratna-Dweepa</p>
                <hr style="border: none; border-top: 1px solid #E5E0D8; margin: 24px 0;" />
                <h2 style="font-size: 16px; margin-bottom: 12px; font-weight: 600;">Acquisition Reservation Confirmed</h2>
                <p style="font-size: 13px; line-height: 1.6; color: #554D46;">Dear ${name},</p>
                <p style="font-size: 13px; line-height: 1.6; color: #554D46;">Your reservation for <strong>${gemInterest}</strong> (Protocol Ref: <strong>${refCode}</strong>) has been logged in our private register.</p>
                <div style="background: #FFFFFF; border: 1px solid #E5E0D8; padding: 18px; margin: 20px 0; font-size: 12px; line-height: 1.7;">
                  <div><strong>Gemstone:</strong> ${gemInterest}</div>
                  <div><strong>Handover Protocol:</strong> ${custodyPreference}</div>
                  <div><strong>Origin:</strong> Historic Sri Lankan Alluvial Gravels</div>
                  <div><strong>Authenticity:</strong> Accompanied by Official Gemological Passport</div>
                  <div><strong>Format:</strong> 100% Pure Loose Gemstone (No Mountings)</div>
                </div>
                <p style="font-size: 13px; line-height: 1.6; color: #554D46;">Our gemologist will connect directly with you to discuss certificate verification and delivery/handover arrangements.</p>
                <p style="font-size: 12px; color: #8B7355; margin-top: 30px;">Dewera Ceylon Natural Heated Atelier &bull; Sri Lanka</p>
              </div>
            `
          })
        });
      } catch (e) {
        console.error("Client email error:", e);
      }

      // Email 2: Atelier Notification to deweragems@gmail.com with VIP headers for Gmail categorization
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: "Dewera Ceylon Atelier <onboarding@resend.dev>",
            to: [businessEmail],
            headers: {
              "X-Priority": "1",
              "Priority": "Urgent",
              "Importance": "high",
              "X-Entity-Ref-ID": `DEWERA-${refCode}`
            },
            subject: `[Dewera Vault Inquiry] VIP Reservation: ${gemInterest} — ${name}`,
            html: `
              <div style="font-family: Arial, sans-serif; padding: 24px; background: #fff; border: 1px solid #ddd; max-width: 600px;">
                <h2 style="color: #8B7355; margin-top: 0;">New Gemstone Reservation [VIP]</h2>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px; line-height: 1.6;">
                  <tr><td style="padding: 8px 0; font-weight: bold; width: 140px;">Protocol Ref:</td><td>${refCode}</td></tr>
                  <tr><td style="padding: 8px 0; font-weight: bold;">Client Name:</td><td>${name}</td></tr>
                  <tr><td style="padding: 8px 0; font-weight: bold;">Email:</td><td><a href="mailto:${email}">${email}</a></td></tr>
                  <tr><td style="padding: 8px 0; font-weight: bold;">Phone / WhatsApp:</td><td><a href="https://wa.me/${phone.replace(/[^0-9]/g, '')}">${phone}</a></td></tr>
                  <tr><td style="padding: 8px 0; font-weight: bold;">Gemstone:</td><td>${gemInterest}</td></tr>
                  <tr><td style="padding: 8px 0; font-weight: bold;">Handover Protocol:</td><td>${custodyPreference}</td></tr>
                  <tr><td style="padding: 8px 0; font-weight: bold;">Allocation Budget:</td><td>${budget || 'Not specified'}</td></tr>
                  <tr><td style="padding: 8px 0; font-weight: bold;">Notes:</td><td>${message || 'None'}</td></tr>
                </table>
              </div>
            `
          })
        });
      } catch (e) {
        console.error("Atelier email error:", e);
      }
    }

    // 2. WhatsApp Notification via Meta Cloud API if configured
    if (metaPhoneId && metaToken) {
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      try {
        await fetch(`https://graph.facebook.com/v18.0/${metaPhoneId}/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${metaToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: cleanPhone,
            type: "text",
            text: {
              body: `Greetings ${name}. This is Dewera Ceylon Natural Heated. Your inquiry for ${gemInterest} (Ref: ${refCode}) has been received. Our gemologist will connect with you shortly regarding certification and handover arrangements.`
            }
          })
        });
      } catch (e) {
        console.error("Meta WhatsApp error:", e);
      }
    }

    const cleanDeweraWhatsapp = deweraWhatsapp.replace(/[^0-9]/g, '');
    const clientWaMsg = encodeURIComponent(`Greetings Dewera Atelier, I have placed an inquiry for ${gemInterest} (Ref: ${refCode}). My name is ${name}.`);
    const whatsappUrl = `https://wa.me/${cleanDeweraWhatsapp}?text=${clientWaMsg}`;

    return new Response(JSON.stringify({
      success: true,
      refCode,
      whatsappUrl,
      message: "Acquisition request processed and notifications logged."
    }), {
      status: 200,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
