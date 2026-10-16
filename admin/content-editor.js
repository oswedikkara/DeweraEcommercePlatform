'use strict';
checkAuth();
(() => {
 const q=s=>document.querySelector(s);
 const frame=q('#contentPreview');
 const storeOrigin=(location.hostname==='localhost'||location.hostname==='127.0.0.1')?location.protocol+'//'+location.hostname+':3000':location.origin;
 let documentContent={};let fields=[];let dirty=false;let loaded=false;let loadingFrame=false;
 let currentPage='index';let revision=0;
 const status=(message,error=false)=>{q('#editorStatus').textContent=message;q('#editorStatus').classList.toggle('error',error);};
 const markDirty=()=>{dirty=true;q('#saveContent').disabled=false;status('Unsaved changes. Preview updated; save to apply to the store.');};
 function preview(){frame.contentWindow?.postMessage({type:'dewera:content-preview',page:currentPage,content:documentContent[currentPage]||{}},storeOrigin);}
 function render(){
  const term=q('#contentSearch').value.trim().toLowerCase();
  const list=q('#contentFields');list.replaceChildren();
  const filtered=fields.filter(f=>String(f.original||'').trim()).filter(f=>[f.label,f.original,f.kind].join(' ').toLowerCase().includes(term));
  q('#contentCount').textContent=fields.length+' editable fields';
  if(!filtered.length){const p=document.createElement('p');p.className='empty-editor';p.textContent=fields.length?'No matching text or media.':'Waiting for the page content. Use Refresh preview if needed.';list.append(p);}
  filtered.forEach(field=>{
   const article=document.createElement('article');article.className='editable-field';
   const group=document.createElement('div');group.className='content-field';
   const label=document.createElement('label');label.htmlFor='field-'+field.key.replace(':','-');label.textContent=(field.kind==='text'?field.original.trim().slice(0,85):field.kind.toUpperCase()+' / '+field.label);
   const input=document.createElement(field.kind==='text'?'textarea':'input');input.id=label.htmlFor;
   input.value=Object.prototype.hasOwnProperty.call(documentContent[currentPage]||{},field.key)?documentContent[currentPage][field.key]:field.original;
   if(field.kind!=='text')input.type='text';
   if(field.kind==='text')input.rows=field.original.length>130?4:2;
   input.maxLength=10000;
   input.addEventListener('input',()=>{documentContent[currentPage]||={};documentContent[currentPage][field.key]=input.value;markDirty();preview();});
   group.append(label,input);
   const meta=document.createElement('div');meta.className='editable-meta';const hint=document.createElement('span');hint.textContent=field.kind==='text'?'Plain text · '+field.label:field.kind==='src'?'Image URL or relative image path':field.kind==='href'?'Page path, https:// URL, mailto: or tel:':'Plain text';
   const reset=document.createElement('button');reset.type='button';reset.textContent='Restore default';reset.addEventListener('click',()=>{delete documentContent[currentPage]?.[field.key];input.value=field.original;markDirty();preview();});
   meta.append(hint,reset);article.append(group,meta);list.append(article);
  });
 }
 function requestCatalog(){frame.contentWindow?.postMessage({type:'dewera:content-request'},storeOrigin);}
 async function openPage(){
  currentPage=q('#editorPage').value;fields=[];render();loadingFrame=true;
  try{const response=await staffFetch('/api/admin/preview-token',{method:'POST'});const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to open preview.');const url=new URL('/'+currentPage+'.html',storeOrigin);url.searchParams.set('preview',data.token);if(currentPage==='gem')url.searchParams.set('id',window.editorFirstGemId||'gem-001');frame.src=url.href;}catch(error){loadingFrame=false;status(error.message,true);return;}
  status(dirty?'Unsaved changes are retained while you switch pages.':'Loading page preview…');
 }
 frame.addEventListener('load',()=>{loadingFrame=false;requestCatalog();});
 window.addEventListener('message',event=>{
  if(event.origin!==storeOrigin||event.source!==frame.contentWindow||event.data?.type!=='dewera:content-catalog'||event.data.page!==currentPage)return;
  fields=Array.isArray(event.data.fields)?event.data.fields:[];render();preview();
  if(!dirty)status('Ready to edit. All changes must be saved before they appear to customers.');
 });
 q('#editorPage').addEventListener('change',openPage);
 q('#contentSearch').addEventListener('input',render);
 q('#reloadPreview').addEventListener('click',()=>{if(loadingFrame)return;openPage();});
 q('#saveContent').addEventListener('click',async()=>{
  if(!loaded)return;const button=q('#saveContent');button.disabled=true;button.textContent='Saving…';
  try{
   const res=await staffFetch('/api/site-content',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:documentContent,revision})});
   const result=await res.json();if(!res.ok||!result.success)throw Error(result.error||'Could not save the site content.');
   documentContent=result.content;revision=result.revision;dirty=false;status('Saved. The updated content will appear when customers load the page.');
  }catch(error){status(error.message,true);button.disabled=false;}finally{button.textContent='Save changes';}
 });
 window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
 (async()=>{
  if(getStaffRole()!=='super_admin'){status('Only the head administrator can edit site content.',true);return;}
  try{
   const responses=await Promise.all([staffFetch('/api/site-content'),staffFetch('/api/gems')]);
   if(!responses[0].ok)throw Error('Unable to load saved site content.');
   const data=await responses[0].json();documentContent=data.content||{};revision=data.revision||0;
   if(responses[1].ok){const gems=await responses[1].json();window.editorFirstGemId=gems.find(g=>g.isDewera||g.sellerId==='dewera')?.id;}
   loaded=true;openPage();
  }catch(error){status(error.message,true);}
 })();
})();
