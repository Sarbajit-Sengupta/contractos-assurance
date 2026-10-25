import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startServer} from '../examples/runtime/server.mjs';
import {supervise} from '../src/supervise.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),broken=process.argv.includes('--broken'),server=await startServer({broken});
try{const folder=path.join(root,'reports',broken?'runtime-broken':'runtime-demo');fs.mkdirSync(folder,{recursive:true});const config={baseUrl:server.url,allowMutations:true,output:'evidence',tests:[{name:'Health endpoint is healthy',path:'/health',expectedStatus:200,assertions:[{pointer:'/healthy',equals:true}]},{name:'One order creates exactly one charge',method:'POST',path:'/orders',body:{sku:'TEST-ONLY'},expectedStatus:201,assertions:[{pointer:'/orderId',type:'string'},{pointer:'/charges',equals:1}]}]};const configFile=path.join(folder,'runtime.json');fs.writeFileSync(configFile,JSON.stringify(config,null,2));process.exitCode=await supervise('runtime',configFile);}finally{await server.close();}
