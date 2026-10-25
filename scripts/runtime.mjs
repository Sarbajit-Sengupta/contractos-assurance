import {supervise} from '../src/supervise.mjs';
process.exitCode=await supervise('runtime',process.argv[2]??'contractos.runtime.json');
