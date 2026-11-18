import vm from 'node:vm';
import {isDeepStrictEqual} from 'node:util';
import {executionDiagnostic} from './execution-diagnostic.mjs';
// This is a local teaching aid, not a hostile-code sandbox.
let input='',code='',phase='execution';
for await(const chunk of process.stdin)input+=chunk;
const identifier=name=>{if(!/^[A-Za-z_$][\w$]*$/.test(name))throw new Error('无效的验收函数名称');return name;};
const run=(source,context,filename='check.js')=>new vm.Script(source,{filename}).runInContext(context,{timeout:350});
const failure=(error,phase)=>({error:String(error.stack||error.message).slice(0,3000),diagnostic:executionDiagnostic(error,code,phase)});
try{
 const request=JSON.parse(input);code=request.code;const {fn,cases}=request;
 // Parse only the student's source so EOF and syntax locations do not include appended checks.
 const student=new vm.Script(code,{filename:'student.js'}),results=[];
 if(fn){
  for(const test of cases){
   const context=vm.createContext({},{codeGeneration:{strings:false,wasm:false}});
   phase='execution';
   try{
    student.runInContext(context,{timeout:350});
    const target=identifier(test.fn||fn);let expression=`${target}(...${JSON.stringify(test.args)})`;
    if(test.dependencies){
     phase='probe';
     // Re-create the report in a scope containing mock helper parameters, rather than
     // assigning to the learner's helper bindings. Top-level const/let/function all work.
     // Other top-level bindings remain available in the same VM context.
     const names=Object.keys(test.dependencies).map(identifier);
     const source=run(`Function.prototype.toString.call(${target})`,context);
     const mocks=names.map(name=>`function(...args){if(JSON.stringify(args)!==${JSON.stringify(JSON.stringify(test.args))})throw new Error('辅助函数应接收相同的 orders');return ${JSON.stringify(test.dependencies[name])};}`);
     expression=`((${names.join(',')})=>(${source}))(${mocks.join(',')})(...${JSON.stringify(test.args)})`;
    }
    let raw;
    try{raw=run(`JSON.stringify(${expression})`,context);if(test.throws)raw=JSON.stringify({throws:null});}
    catch(error){if(!test.throws)throw error;raw=JSON.stringify({throws:error.name});}
    const actual=raw===undefined?null:JSON.parse(raw),uncertain=Boolean(test.dependencies&&!isDeepStrictEqual(actual,test.expected));
    results.push({name:test.name,input:test.args,actual,expected:test.expected,skillKeys:test.skillKeys||[],...(uncertain?{status:'unassessed',diagnostic:{kind:'verification',title:'函数组合需要人工核对',message:'替换验证未能确认辅助函数返回值的使用。需要核对实际调用关系；这项探测不等于业务结果错误。'}}:{})});
   }catch(error){results.push({name:test.name,input:test.args,actual:null,expected:test.expected,skillKeys:test.skillKeys||[],status:phase==='probe'?'unassessed':'failed',...failure(error,phase)});}
  }
  process.stdout.write(JSON.stringify({results}));
 }else{
  const context=vm.createContext({},{codeGeneration:{strings:false,wasm:false}});
  run('globalThis.__lines=[];globalThis.console={log:(...args)=>__lines.push(args.map(String).join(" "))};',context);
  student.runInContext(context,{timeout:350});
  process.stdout.write(JSON.stringify({output:run('__lines.join("\\n")',context).slice(0,10000)}));
 }
}catch(error){process.stdout.write(JSON.stringify(failure(error,phase)));}
