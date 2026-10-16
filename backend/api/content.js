const ConfigService = require('../services/ConfigService');
const { getStaffSession } = require('../middleware/auth');
const PAGES = new Set(['index','collection','gem','about','contact']);
function validateContent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid content document.');
  const output = {};
  for (const [page, entries] of Object.entries(value)) {
    if (!PAGES.has(page) || !entries || typeof entries !== 'object' || Array.isArray(entries)) throw Error('Invalid page content.');
    if (Object.keys(entries).length > 800) throw Error('Too many fields.');
    output[page] = {};
    for (const [key, text] of Object.entries(entries)) {
      if (!/^(text|href|src|alt|placeholder|title|theme):[a-zA-Z0-9_.-]+$/.test(key) || typeof text !== 'string' || text.length > 10000) throw Error('Invalid content field.');
      if ((key.startsWith('href:') || key.startsWith('src:')) && text && !/^(https?:\/\/|mailto:|tel:|[a-zA-Z0-9_./?#%-])/.test(text)) throw Error('Invalid link or image URL.');
      if ((key.startsWith('href:') || key.startsWith('src:')) && /^\s*[a-z][a-z0-9+.-]*:/i.test(text) && !/^\s*(https?:|mailto:|tel:)/i.test(text)) throw Error('Unsupported URL scheme.');
      output[page][key] = text;
    }
  }
  return output;
}
async function handleContent(req,res,pathname) {
  if (pathname !== '/api/site-content') return false;
  const send = (status,body) => {res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  if (req.method === 'GET') {const doc=ConfigService.getSetting('siteContentDocument',null);send(200,doc||{content:ConfigService.getSetting('siteContent',{}),revision:0});return true;}
  const user = getStaffSession(req);
  if (!user || user.role !== 'super_admin') {send(user?403:401,{success:false,error:'Head administrator sign-in is required.'});return true;}
  if (req.method !== 'POST') {send(405,{success:false,error:'Method not supported.'});return true;}
  let body='';let tooLarge=false;
  req.on('data',chunk=>{if(body.length+chunk.length>1024*1024)tooLarge=true;else body+=chunk;});
  req.on('end',()=>{try{if(tooLarge)throw Error('Content is too large.');const payload=JSON.parse(body);const current=ConfigService.getSetting('siteContentDocument',{revision:0});if(payload.revision!==current.revision){send(409,{success:false,error:'Site content was changed in another session. Reload the editor before saving.'});return;}const content=validateContent(payload.content);const revision=current.revision+1;ConfigService.updateSetting('siteContentDocument',{content,revision},user.username);send(200,{success:true,content,revision});}catch(error){send(400,{success:false,error:error.message});}});
  return true;
}
module.exports={handleContent,validateContent};
