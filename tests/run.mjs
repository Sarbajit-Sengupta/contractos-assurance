import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import openapiTS,{astToString} from 'openapi-typescript';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);const tmp=path.join(root,'reports/self-test');fs.mkdirSync(tmp,{recursive:true});const results=[];
const exec=(script,args=[],env={})=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,[script,...args],{cwd:root,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);child.on('error',reject);const deadline=setTimeout(()=>{child.kill();reject(Error('Test child exceeded 90 seconds'));},90000);child.on('exit',code=>{clearTimeout(deadline);resolve({code,stdout,stderr});});});
const json=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2));
const spec={openapi:'3.0.3',info:{title:'Assurance fixture',version:'1'},paths:{'/item':{get:{responses:{200:{description:'ok',content:{'application/json':{schema:{$ref:'#/components/schemas/Item'}}}}}}}},components:{schemas:{Item:{type:'object',required:['name'],properties:{name:{type:'string'}}}}}};
const source="import type {components} from './api';\nexport const render=(item:components['schemas']['Item'])=>item.name.toUpperCase();\n";
async function typeCase(name,edit,expected){const dir=path.join(tmp,name);fs.mkdirSync(dir,{recursive:true});const state={before:structuredClone(spec),after:structuredClone(spec),source,tsconfig:{compilerOptions:{strict:true,target:'ES2022',module:'ESNext',moduleResolution:'Bundler',types:[]},include:['*.ts']},config:{baseline:'baseline.json',candidate:'candidate.json',tsconfig:'tsconfig.json',generatedFile:'api.d.ts',output:'evidence',timeoutMs:30000}};edit(state);json(path.join(dir,'baseline.json'),state.before);json(path.join(dir,'candidate.json'),state.after);json(path.join(dir,'tsconfig.json'),state.tsconfig);json(path.join(dir,'contractos.project.json'),state.config);fs.writeFileSync(path.join(dir,'consumer.ts'),state.source);fs.writeFileSync(path.join(dir,'api.d.ts'),'// Preserve this existing file.\n');if(state.invalidContract)fs.writeFileSync(path.join(dir,'candidate.json'),'INVALID {');if(state.invalidConfig)fs.writeFileSync(path.join(dir,'contractos.project.json'),'{');
 // Plant a stale passing report: every unsuccessful rerun must replace it.
 fs.mkdirSync(path.join(dir,'evidence'),{recursive:true});json(path.join(dir,'evidence/report.json'),{status:'passed',runId:'stale'});const r=await exec('scripts/gate.mjs',[path.join(dir,'contractos.project.json')]);assert.equal(r.code,expected,name+': '+r.stdout+r.stderr);const reportPath=path.join(dir,state.invalidConfig?'contractos-report':'evidence','report.json'),report=JSON.parse(fs.readFileSync(reportPath));assert.equal(report.status,expected===0?'passed':expected===1?'failed':'incomplete');assert.notEqual(report.runId,'stale');if(report.status==='passed'){assert.ok(report.provenance.baseline.checkedFiles.length>0);assert.equal(report.provenance.baseline.typescriptVersion,'5.9.3');assert.equal(report.inputFingerprint.length,64);assert.equal(fs.readFileSync(path.join(dir,'api.d.ts'),'utf8'),'// Preserve this existing file.\n','gate must not rewrite generated source');}
 if(state.parity){const codes=[];for(const [label,doc]of [['before',state.before],['after',state.after]]){fs.writeFileSync(path.join(dir,'api.d.ts'),astToString(await openapiTS(doc,{silent:true})));const compiler=await exec('node_modules/typescript/bin/tsc',['--project',path.join(dir,'tsconfig.json'),'--pretty','false']);codes.push([...compiler.stdout.matchAll(/consumer\.ts\((\d+),(\d+)\): error TS(\d+):/g)].map(m=>[+m[1],+m[2],+m[3]]));}assert.equal(codes[0].length,0);assert.deepEqual(report.newDiagnostics.map(d=>[d.line,d.column,d.code]),codes[1]);}
 results.push({name,kind:'types',passed:true,exitCode:r.code,status:report.status,summary:report.summary});console.log('PASS '+name);return report;}
await typeCase('unchanged',s=>{s.parity=true},0);
await typeCase('new-type-error',s=>{s.after.components.schemas.Item.properties.name.type='number';s.parity=true},1);
await typeCase('consumer-fixed',s=>{s.after.components.schemas.Item.properties.name.type='number';s.source=source.replace('item.name.toUpperCase()','String(item.name)');s.parity=true},0);
await typeCase('existing-baseline-error',s=>s.source+='const wrong:number="old error";',2);
await typeCase('missing-dependency',s=>s.source+="import 'uninstalled-contractos-package';\nimport {x} from 'uninstalled-contractos-package';\nconsole.log(x);",2);
await typeCase('unbound-contract',s=>s.source='export const n=1;',2);
await typeCase('empty-project',s=>s.tsconfig.include=['nothing/*.ts'],2);
await typeCase('unchecked-project',s=>s.tsconfig.compilerOptions.noCheck=true,2);
await typeCase('nonstrict-project',s=>s.tsconfig.compilerOptions.strict=false,2);
await typeCase('strict-subcheck-disabled',s=>s.tsconfig.compilerOptions.strictNullChecks=false,2);
await typeCase('unchecked-javascript',s=>s.tsconfig.compilerOptions.allowJs=true,2);
await typeCase('nondeclaration-overlay',s=>s.config.generatedFile='consumer.ts',2);
await typeCase('skipped-declarations',s=>s.tsconfig.compilerOptions.skipLibCheck=true,2);
await typeCase('project-references',s=>s.tsconfig.references=[{path:'./other'}],2);
await typeCase('unknown-setting',s=>s.config.ignoreErrors=true,2);
await typeCase('malformed-contract',s=>s.invalidContract=true,2);
await typeCase('external-reference',s=>s.after.components.schemas.Item={$ref:'https://example.invalid/schema'},2);
await typeCase('deadline-exceeded',s=>s.config.timeoutMs=250,2);
await typeCase('malformed-config',s=>s.invalidConfig=true,2);
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');if(req.url==='/slow'){setTimeout(()=>{res.end('{}');},400);return;}if(req.url==='/redirect'){res.writeHead(302,{Location:'/ok'});res.end('{}');return;}if(req.url==='/invalid'){res.end('{');return;}if(req.url==='/large'){res.end(JSON.stringify({payload:'x'.repeat(1_000_001)}));return;}if(req.url==='/wrong-status'){res.statusCode=500;res.end('{"name":"Widget"}');return;}if(req.url==='/double-charge'){res.end('{"chargeCount":2}');return;}if(req.url==='/charge'){res.end('{"chargeCount":1}');return;}if(req.url==='/secret'){assert.equal(req.headers.authorization,'Bearer sentinel-secret');res.end('{"name":"Widget"}');return;}res.end('{"name":"Widget","price":12,"tags":["a","b"],"a/b":{"~key":true}}');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const baseUrl='http://127.0.0.1:'+server.address().port;
async function runtimeCase(name,edit,expected,env={}){const dir=path.join(tmp,name);fs.mkdirSync(dir,{recursive:true});const config={baseUrl,output:'evidence',timeoutMs:10000,requestTimeoutMs:1000,tests:[{name:'Product contract',path:'/ok',expectedStatus:200,assertions:[{pointer:'/name',type:'string',equals:'Widget'},{pointer:'/price',type:'number',min:1,max:100},{pointer:'/tags',type:'array',length:2},{pointer:'/a~1b/~0key',equals:true}]}]};edit(config);json(path.join(dir,'runtime.json'),config);const r=await exec('scripts/runtime.mjs',[path.join(dir,'runtime.json')],env);assert.equal(r.code,expected,name+r.stdout+r.stderr);const report=JSON.parse(fs.readFileSync(path.join(dir,'evidence/report.json')));assert.equal(report.status,expected===0?'passed':expected===1?'failed':'incomplete');assert.ok(!JSON.stringify(report).includes('sentinel-secret'));results.push({name,kind:'runtime',passed:true,exitCode:r.code,status:report.status});console.log('PASS '+name);return report;}
try{
await runtimeCase('runtime-pass',()=>{},0);
await runtimeCase('runtime-missing-field',c=>c.tests[0].assertions=[{pointer:'/missing',type:'string'}],1);
await runtimeCase('runtime-wrong-value',c=>c.tests[0].assertions=[{pointer:'/name',equals:'Different'}],1);
await runtimeCase('runtime-wrong-type',c=>c.tests[0].assertions=[{pointer:'/price',type:'string'}],1);
await runtimeCase('runtime-wrong-status',c=>c.tests[0].path='/wrong-status',1);
await runtimeCase('runtime-invalid-json',c=>c.tests[0].path='/invalid',2);
await runtimeCase('runtime-redirect',c=>c.tests[0].path='/redirect',2);
await runtimeCase('runtime-request-timeout',c=>{c.tests[0].path='/slow';c.requestTimeoutMs=50},2);
await runtimeCase('runtime-size-limit',c=>c.tests[0].path='/large',2);
await runtimeCase('runtime-empty-suite',c=>c.tests=[],2);
await runtimeCase('runtime-empty-assertions',c=>c.tests[0].assertions=[],2);
await runtimeCase('runtime-unknown-assertion',c=>c.tests[0].assertions=[{pointer:'/name',matches:'*'}],2);
await runtimeCase('runtime-missing-secret',c=>c.tests[0].headersFromEnv={Authorization:'CONTRACTOS_MISSING_TEST_SECRET'},2);
await runtimeCase('runtime-secret-redacted',c=>{c.tests[0].path='/secret';c.tests[0].headersFromEnv={Authorization:'CONTRACTOS_TEST_SECRET'};c.tests[0].assertions=[{pointer:'/name',equals:'Widget'}]},0,{CONTRACTOS_TEST_SECRET:'Bearer sentinel-secret'});
await runtimeCase('runtime-mutation-opt-in',c=>c.tests[0].method='POST',2);
await runtimeCase('runtime-charge-once',c=>{c.allowMutations=true;c.tests=[{name:'One order creates one charge',method:'POST',path:'/charge',body:{sku:'test'},expectedStatus:200,assertions:[{pointer:'/chargeCount',equals:1}]}]},0);
await runtimeCase('runtime-double-charge-detected',c=>{c.allowMutations=true;c.tests=[{name:'One order creates one charge',method:'POST',path:'/double-charge',body:{sku:'test'},expectedStatus:200,assertions:[{pointer:'/chargeCount',equals:1}]}]},1);
}finally{await new Promise(resolve=>server.close(resolve));}
json(path.join(root,'reports/assurance-tests.json'),{testedAt:new Date().toISOString(),node:process.version,platform:process.platform,total:results.length,passed:results.length,results});console.log('All '+results.length+' assurance checks passed.');
