const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const nodes=new Map();
function node(){return {textContent:'',innerHTML:'',value:'',hidden:false,disabled:false,dataset:{},events:{},className:'',classList:{add(){},remove(){},toggle(){}},setAttribute(){},addEventListener(type,fn){this.events[type]=fn},querySelectorAll(){return []}};}
const get=selector=>{if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector)};
get('#enquiryFilter').value='all';
let selectedStatus=node();selectedStatus.dataset.status='INQ-1';selectedStatus.value='contacted';
let failStatus=false;
const response=body=>({ok:true,status:200,json:async()=>body});
const context=vm.createContext({URLSearchParams,Intl,Date,Number,String,Set,console,location:{search:'?view=enquiries'},setTimeout:()=>0,clearTimeout(){},getStaffRole:()=> 'super_admin',getStaffUser:()=>({name:'Test operator',role:'super_admin'}),checkAuth(){},logout(){throw Error('Unexpected logout')},document:{querySelector:get,querySelectorAll:selector=>selector==='[data-status]'?[selectedStatus]:[],title:''},staffFetch:async path=>{
 if(path==='/api/gems')return response([{id:'TEST',name:'Test sapphire',isDewera:true,status:'available',weight:2,price:3000,images:[]}]);
 if(path==='/api/inquiries')return response([{id:'INQ-1',customer_name:'<script>unsafe</script>',customer_email:'test@example.test',listing_name:'Test sapphire',message:'Viewing request',status:'new',created_at:'2026-10-16 10:00:00',preferred_contact:'email'}]);
 if(path==='/api/settings')return response({maintenanceMode:false});
 if(path.endsWith('/status'))return failStatus?{ok:false,json:async()=>({success:false,error:'Status rejected'})}:response({success:true});
 throw Error('Unexpected request '+path);
}});
vm.runInContext(fs.readFileSync('admin/management.js','utf8'),context);
(async()=>{
 await new Promise(setImmediate);
 assert.match(get('#enquiryList').innerHTML,/&lt;script&gt;unsafe&lt;\/script&gt;/);
 assert.doesNotMatch(get('#enquiryList').innerHTML,/<script>unsafe/);
 assert.equal(get('#storeStatus').textContent,'Store online');
 assert.equal(get('#metrics').hidden,true);
 get('#enquirySearch').value='no-such-name';get('#enquirySearch').events.input();
 assert.match(get('#enquiryList').innerHTML,/No enquiries match/);
 get('#enquirySearch').value='';get('#enquirySearch').events.input();
 const button=node();button.dataset.saveEnquiry='INQ-1';
 failStatus=true;
 await get('#enquiryList').events.click({target:{closest:()=>button}});
 assert.equal(selectedStatus.value,'new');
 assert.equal(get('#consoleNotice').textContent,'Status rejected');
 selectedStatus.value='contacted';failStatus=false;
 await get('#enquiryList').events.click({target:{closest:()=>button}});
 assert.match(get('#enquiryList').innerHTML,/contacted/);
 assert.equal(get('#consoleToast').textContent,'Enquiry status saved.');
 console.log('Management inbox rendering, filtering and save feedback checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
