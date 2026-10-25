import {supervise} from '../src/supervise.mjs';
process.exitCode=await supervise('types',process.argv[2]??'contractos.project.json');
