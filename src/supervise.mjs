import {Worker} from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import {baseReport,loadConfig,outputPath,writeReport} from './common.mjs';
export async function supervise(kind,configArg){
 const configPath=path.resolve(configArg),report=baseReport(kind);let output=outputPath(configPath,{}),config;
 try{({config}=loadConfig(configPath));output=outputPath(configPath,config);writeReport(output,report);const timeout=config.timeoutMs??60000;if(!Number.isInteger(timeout)||timeout<250||timeout>300000)throw Error('timeoutMs must be an integer from 250 to 300000.');
 const result=await new Promise((resolve,reject)=>{const worker=new Worker(new URL('./worker.mjs',import.meta.url),{workerData:{kind,configPath,config},resourceLimits:{maxOldGenerationSizeMb:512}});let done=false;const finish=(fn,value)=>{if(done)return;done=true;clearTimeout(timer);worker.terminate();fn(value);};const timer=setTimeout(()=>finish(reject,Error('Check exceeded its deadline; result is incomplete.')),timeout);worker.on('message',value=>value.error?finish(reject,Error(value.error)):finish(resolve,value));worker.on('error',error=>finish(reject,error));worker.on('exit',code=>{if(!done)finish(reject,Error('Worker ended without a result (exit '+code+').'));});});Object.assign(report,result);
 }catch(error){report.status='incomplete';report.summary=error.message;try{writeReport(output,report);}catch{}}
 report.finishedAt=new Date().toISOString();try{writeReport(output,report);}catch(error){console.error('Cannot write evidence: '+error.message);return 2;}
 const exit=report.status==='passed'?0:report.status==='failed'?1:2;console.log(JSON.stringify({status:report.status,summary:report.summary,exitCode:exit,report:path.join(output,'report.json')},null,2));return exit;
}
