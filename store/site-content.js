/* Plain-text content bindings; inventory data remains in the inventory editor. */
(()=>{
 const page=document.body.dataset.page;if(!page)return;
 const fields=new Map(),tracked=new WeakMap();let content={},applying=false,timer,editor,lastCount=0;
 const hash=value=>{let h=2166136261;for(const c of value){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return(h>>>0).toString(36);};
 function path(el){const parts=[];while(el&&el!==document.body){if(el.id){parts.unshift('#'+el.id);break;}const tag=el.tagName.toLowerCase();if(!el.parentElement){parts.unshift(tag);break;}const siblings=[...el.parentElement.children].filter(s=>s.tagName===el.tagName);parts.unshift(tag+':'+siblings.indexOf(el));el=el.parentElement;}return parts.join('/');}
 function excluded(el){return !el||el.closest('[aria-hidden="true"],script,style,svg,select,option,.refined-select,#toast,[role="status"],.product-card,.selection-specs,.specs,.detail-price,.availability,.request-stone,.dossier-document,.gem-description,.detail-copy h1,.loading');}
 function register(node,kind,original,label,set){
  if(!String(original||'').trim()||/^[\d\s/+.]+$/.test(original))return;
  let info=tracked.get(node);if(!info){info={};tracked.set(node,info);}
  if(!info[kind]){const el=node.nodeType===3?node.parentElement:node;const index=node.nodeType===3?[...el.childNodes].indexOf(node):'';const key=kind+':'+hash(path(el)+'|'+index+'|'+original);info[kind]={key,kind,original,label};fields.set(key,{...info[kind],node,set});}
  const meta=info[kind];set(Object.hasOwn(content,meta.key)?content[meta.key]:meta.original);
 }
 function live(){return[...fields.values()].filter(f=>!f.node||f.node.isConnected).map(({key,kind,original,label})=>({key,kind,original,label}));}
 function scan(){
  if(applying)return;applying=true;
  for(const root of ['#siteHeader','#main','#siteFooter'].map(s=>document.querySelector(s)).filter(Boolean)){
   const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
   while(node=walk.nextNode()){const target=node;if((excluded(target.parentElement)&&target.parentElement.tagName!=='OPTION')||!target.textContent.trim())continue;const original=tracked.get(target)?.text?.original||target.textContent;register(target,'text',original,target.parentElement.closest('section')?.querySelector('h1,h2')?.textContent||'Page text',value=>{if(target.textContent!==value)target.textContent=value;});}
   root.querySelectorAll('a,img,input[placeholder],textarea[placeholder]').forEach(el=>{if(excluded(el))return;for(const kind of ['href','src','alt','placeholder']){if(!el.hasAttribute(kind))continue;const original=tracked.get(el)?.[kind]?.original||el.getAttribute(kind);register(el,kind,original,el.getAttribute('alt')||el.textContent?.trim().slice(0,90)||'Page media',value=>{if(el.getAttribute(kind)!==value)el.setAttribute(kind,value);});}});
  }
  const title=document.querySelector('title');if(title&&!document.querySelector('#main .loading'))register(title,'title',tracked.get(title)?.title?.original||title.textContent,'Browser page title',value=>{if(title.textContent!==value)title.textContent=value;});
  const description=document.querySelector('meta[name=description]');if(description)register(description,'title',tracked.get(description)?.title?.original||description.content,'Search engine description',value=>{if(description.content!==value)description.content=value;});
  const hero=document.querySelector('.maison-hero-photo');if(hero){const key='src:heroImage';fields.set(key,{key,kind:'src',original:'images/maison-editorial.jpg',label:'Homepage hero image',set:value=>hero.style.backgroundImage='url('+JSON.stringify(value)+')'});if(content[key])fields.get(key).set(content[key]);}
  applying=false;const catalog=live();if(editor&&catalog.length!==lastCount){lastCount=catalog.length;editor.source.postMessage({type:'dewera:content-catalog',page,fields:catalog},editor.origin);}
 }
 const allowedOrigin=['localhost','127.0.0.1'].includes(location.hostname)?location.protocol+'//'+location.hostname+':3001':location.origin;
 window.addEventListener('message',event=>{if(event.origin!==allowedOrigin||event.source!==window.parent)return;if(event.data?.type==='dewera:content-request'){editor={source:event.source,origin:event.origin};scan();event.source.postMessage({type:'dewera:content-catalog',page,fields:live()},event.origin);}if(event.data?.type==='dewera:content-preview'&&event.data.page===page){content=event.data.content||{};scan();}});
 fetch('/api/site-content').then(r=>r.ok?r.json():Promise.reject()).then(data=>{content=data.content?.[page]||{};scan();}).catch(()=>scan());
 new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(scan,80);}).observe(document.body,{childList:true,subtree:true});scan();
})();
