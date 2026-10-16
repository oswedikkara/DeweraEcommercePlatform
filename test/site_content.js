const assert=require('node:assert/strict');
const {validateContent,handleContent}=require('../backend/api/content');
assert.deepEqual(validateContent({index:{'text:hero':'A new introduction','src:heroImage':'images/hero.jpg'}}),{index:{'text:hero':'A new introduction','src:heroImage':'images/hero.jpg'}});
assert.deepEqual(validateContent({gem:{'text:description':'<script>plain text only</script>'}}),{gem:{'text:description':'<script>plain text only</script>'}});
assert.throws(()=>validateContent({private:{'text:a':'x'}}),/Invalid page/);
assert.throws(()=>validateContent({index:{'href:a':'javascript:alert(1)'}}),/Unsupported/);
assert.throws(()=>validateContent({index:{'src:a':'file:///private'}}),/Unsupported/);
assert.throws(()=>validateContent({index:{'text:a':'x'.repeat(10001)}}),/Invalid content field/);
(async()=>{let code;let payload;const res={writeHead:s=>code=s,end:s=>payload=JSON.parse(s)};await handleContent({method:'POST',headers:{}},res,'/api/site-content');assert.equal(code,401);assert.equal(payload.success,false);console.log('Site content validation and unauthenticated-save checks passed.');})().catch(e=>{console.error(e);process.exitCode=1;});
