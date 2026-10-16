const path=require('node:path');
try{process.loadEnvFile(path.resolve(__dirname,'../.env'));}catch(error){if(error.code!=='ENOENT')throw error;}
require('../backend/http/server').createServer({root:path.resolve(__dirname),port:3000,store:true});
