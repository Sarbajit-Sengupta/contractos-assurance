import {parentPort,workerData} from 'node:worker_threads';
try{const module=await import(workerData.kind==='types'?'./gate.mjs':'./runtime.mjs');const result=await module.analyze(workerData.configPath,workerData.config);parentPort.postMessage(result);}catch(error){parentPort.postMessage({error:error.message});}
