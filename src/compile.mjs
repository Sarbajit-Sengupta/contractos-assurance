import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {hash} from './common.mjs';
const norm=p=>{const n=path.resolve(p).replaceAll('\\','/');return process.platform==='win32'?n.toLowerCase():n;};
export function compile(configFile,generatedFile,declaration){
 const observed=new Map();const read=file=>{const text=ts.sys.readFile(file);if(text!==undefined)observed.set(norm(file),hash(text));return text;};
 const config=ts.readConfigFile(configFile,read);if(config.error)throw Error(ts.flattenDiagnosticMessageText(config.error.messageText,'\n'));
 const root=path.dirname(configFile),parsed=ts.parseJsonConfigFileContent(config.config,{...ts.sys,readFile:read},root,undefined,configFile);
 if(parsed.errors.length)throw Error(parsed.errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')).join('\n'));
 if(parsed.projectReferences?.length)throw Error('Project references are not supported by this gate. Check each leaf project separately.');
 const o=parsed.options;if(o.noCheck||o.noResolve||o.noLib||o.plugins?.length||o.disableSizeLimit||o.skipLibCheck||o.skipDefaultLibCheck)throw Error('Unsupported compiler options: noCheck, noResolve, noLib, plugins, disableSizeLimit, skipLibCheck or skipDefaultLibCheck. Use a dedicated strict assurance tsconfig.');
 if(!o.strict||['noImplicitAny','noImplicitThis','strictNullChecks','strictFunctionTypes','strictBindCallApply','strictPropertyInitialization','strictBuiltinIteratorReturn','alwaysStrict','useUnknownInCatchVariables'].some(k=>o[k]===false))throw Error('The assurance gate requires strict: true without disabled strict subchecks.');if(o.allowJs&&!o.checkJs)throw Error('JavaScript inputs require checkJs: true.');
 const roots=parsed.fileNames.filter(f=>!(/\.d\.[cm]?ts$/i.test(f)));if(!roots.length)throw Error('No consumer source files selected.');
 const target=norm(generatedFile),host=ts.createCompilerHost({...o,noEmit:true});const originalRead=host.readFile.bind(host),originalExists=host.fileExists.bind(host);
 host.readFile=f=>norm(f)===target?declaration:originalRead(f);host.fileExists=f=>norm(f)===target||originalExists(f);host.getCurrentDirectory=()=>root;
 const program=ts.createProgram(parsed.fileNames,{...o,noEmit:true,incremental:false,composite:false},host);
 const files=program.getSourceFiles();if(!files.some(f=>norm(f.fileName)===target))throw Error('Generated contract file was not loaded by the project.');
 let bound=false;for(const f of files){if(norm(f.fileName)===target||program.isSourceFileDefaultLibrary(f))continue;for(const imported of ts.preProcessFile(f.text,true,true).importedFiles){const result=ts.resolveModuleName(imported.fileName,f.fileName,o,host).resolvedModule;if(result&&norm(result.resolvedFileName)===target)bound=true;}}
 if(!bound)throw Error('No import resolves to the configured generated contract. Refusing an unbound check.');
 const diagnostics=ts.getPreEmitDiagnostics(program).map(d=>{const p=d.file&&d.start!==undefined?d.file.getLineAndCharacterOfPosition(d.start):null;return {file:d.file?path.relative(root,d.file.fileName).replaceAll('\\','/'):null,line:p?p.line+1:null,column:p?p.character+1:null,code:d.code,category:ts.DiagnosticCategory[d.category],message:ts.flattenDiagnosticMessageText(d.messageText,'\n')};});
 const inputs=files.filter(f=>norm(f.fileName)!==target).map(f=>({path:norm(f.fileName),sha256:hash(f.text)})).sort((a,b)=>a.path.localeCompare(b.path));
 return {diagnostics,manifest:{rootFiles:parsed.fileNames.map(norm).sort(),compilerOptions:o,configFiles:[...observed].sort().map(([path,sha256])=>({path,sha256})),checkedFiles:inputs,generated:{path:target,sha256:hash(declaration)},typescriptVersion:ts.version,sourceCount:roots.length}};
}
