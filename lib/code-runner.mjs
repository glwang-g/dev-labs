import vm from 'node:vm';
// Process isolation, timeout and Node permissions are layered by the parent.
// This VM is a local teaching aid, not a hostile-code sandbox.
let input = '';
for await (const chunk of process.stdin) input += chunk;
try {
  const { code, fn, cases } = JSON.parse(input);
  const results = [];
  if (fn) {
    for (const test of cases) {
      const context = vm.createContext({}, { codeGeneration: { strings: false, wasm: false } });
      const target=test.fn||fn;
      if(!/^[A-Za-z_$][\w$]*$/.test(target))throw new Error('无效的验收函数名称');
      const replacements=Object.entries(test.dependencies||{}).map(([name,value])=>{
        if(!/^[A-Za-z_$][\w$]*$/.test(name))throw new Error('无效的辅助函数名称');
        return `${name}=function(...args){if(JSON.stringify(args)!==${JSON.stringify(JSON.stringify(test.args))})throw new Error('辅助函数应接收相同的 orders');return ${JSON.stringify(value)};};`;
      }).join('\n');
      const script = new vm.Script(`${code}\n${replacements}\nJSON.stringify(${target}(...${JSON.stringify(test.args)}))`);
      let raw;
      try { raw=script.runInContext(context,{timeout:350});if(test.throws)raw=JSON.stringify({throws:null}); } catch(error) {if(!test.throws)throw error;raw=JSON.stringify({throws:error.name});}
      results.push({ name: test.name, input: test.args, actual: raw === undefined ? null : JSON.parse(raw), expected: test.expected });
    }
    process.stdout.write(JSON.stringify({ results }));
  } else {
    const context = vm.createContext({}, { codeGeneration: { strings: false, wasm: false } });
    // Build the console inside the context; no host callback is exposed.
    vm.runInContext('globalThis.__lines = []; globalThis.console = { log: (...args) => __lines.push(args.map(String).join(" ")) };', context);
    new vm.Script(code).runInContext(context, { timeout: 350 });
    process.stdout.write(JSON.stringify({ output: vm.runInContext('__lines.join("\\n")', context, { timeout: 100 }).slice(0, 10000) }));
  }
} catch (error) { process.stdout.write(JSON.stringify({ error: String(error.stack || error.message).slice(0, 2000) })); }
