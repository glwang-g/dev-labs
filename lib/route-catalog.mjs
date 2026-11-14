import {randomInt,randomUUID} from 'node:crypto';
import {question as branchQuestion,slots as branchSlots} from './branch-unit.mjs';
export const units=[
 ['values','S0','变量、表达式与赋值','追踪求值顺序、更新与字符串/数字差异'],
 ['branch','S0','分支与边界','真假、多分支顺序、组合条件与边界'],
 ['loops','S0','循环与控制','零次/多次循环、累加、跳过与终止'],
 ['scope','S0','函数与作用域','参数、返回值、局部变量、块级同名变量'],
 ['data','S0','数组、对象与引用','索引、字段、复制与共享引用'],
 ['aggregate','S1','数据处理与函数拆分','按状态过滤、累计、分组并处理空输入'],
 ['validation','S1','输入校验与错误处理','识别非法记录、数值边界、明确返回契约'],
 ['debug','S1','调试与回归验证','修复边界错误并通过反例、正常与异常用例'],
 ['testing','S1','测试设计','为具体缺陷设计能失败的输入，覆盖边界'],
 ['modules','S2','工程启动、模块与依赖','识别入口、模块契约、依赖与运行命令'],
 ['store','S2','文件持久化','跨实例保存、空数据与损坏文件处理'],
 ['http','S2','HTTP 与集成测试','路由、方法、状态码及数据更新后的响应'],
 ['delivery','S2','Git 与可复现交付','测试、差异审查、提交和运行说明']
].map(([id,stage,title,goal])=>({id,stage,title,goal,trainingCount:id==='branch'?6:['store','http','delivery'].includes(id)?1:4}));
export const unitConcepts={
 values:['赋值顺序与旧值','更新表达式','字符串与数字','自增与状态变化'],
 branch:['条件成立','条件不成立','等于边界','低于边界','首个匹配分支','后续分支匹配'],
 loops:['零次循环','循环累加','continue 跳过','break 终止'],
 scope:['参数与外部变量','块级作用域','局部变量与返回值','条件返回'],
 data:['共享对象引用','对象复制','数组索引','数组复制'],
 aggregate:['过滤与求和','客户分组','多指标统计','函数拆分与报表组合'],
 validation:['输入校验与错误契约'],debug:['边界与状态回归'],
 testing:['等于边界的反例','状态过滤的反例','空输入测试','回归覆盖'],
 modules:['启动入口','模块契约','内置依赖','可复现说明'],
 store:['跨实例持久化与损坏文件'],http:['HTTP 路由、方法与数据响应'],delivery:['回归、文档与干净提交']
};
export function conceptFor(unitId,variant=0){const list=unitConcepts[unitId]||[];return list[variant%list.length]||'综合应用';}
const paid=(amount,customer='Ada')=>({amount,customer,status:'paid'});
function coding(fn,brief,starter,cases){return {kind:'function',fn,brief,starter,cases};}
export function makeQuestion(unitId,variant=0,mode='train',options={}) {
 const u=units.find(u=>u.id===unitId);if(!u)throw new Error('未知能力单元');
 const n=mode==='train'?randomInt(12,90):randomInt(200,900),k=variant%4;let q;
 if(unitId==='branch'){const b=branchQuestion(branchSlots[variant%6],mode==='train'?'train':'exam');q={...b,brief:'预测下面程序的输出。'};}
 if(unitId==='values'){
  const code=[`let a=${n}; let b=a+2; a+=7; console.log(b);`,`let a=${n}; a=a*2+1; console.log(a);`,`console.log(String(${n}) + 2);`,`let a=${n}; const old=a; a++; console.log(old+a);`][k];
  q={kind:'predict',starter:code,expected:[String(n+2),String(n*2+1),String(n)+'2',String(2*n+1)][k]};
 }
 if(unitId==='loops'){
  const code=[`let sum=0;for(let i=0;i<0;i++)sum+=${n};console.log(sum);`,`let sum=0;for(const x of [${n},2,3])sum+=x;console.log(sum);`,`let sum=0;for(const x of [${n},2,3]){if(x===2)continue;sum+=x;}console.log(sum);`,`let sum=0;for(const x of [${n},2,3]){if(x===2)break;sum+=x;}console.log(sum);`][k];
  q={kind:'predict',starter:code,expected:['0',String(n+5),String(n+3),String(n)][k]};
 }
 if(unitId==='scope'){
  const code=[`let x=${n};function f(x){return x+2;}console.log(f(3)+x);`,`let x=${n};{let x=2;x++;}console.log(x);`,`let x=${n};function f(){let x=2;return x;}console.log(f()+x);`,`function f(n){if(n>0)return n*2;return 0;}console.log(f(${n})+f(-1));`][k];
  q={kind:'predict',starter:code,expected:[String(n+5),String(n),String(n+2),String(n*2)][k]};
 }
 if(unitId==='data'){
  const code=[`const a={value:${n}};const b=a;b.value+=2;console.log(a.value);`,`const a={value:${n}};const b={...a};b.value=0;console.log(a.value);`,`const a=[${n},2,3];a[1]=4;console.log(a[0]+a[1]);`,`const a=[${n},2];const b=[...a];b.push(3);console.log(a.length+b.length);`][k];
  q={kind:'predict',starter:code,expected:[String(n+2),String(n),String(n+4),'5'][k]};
 }
 if(unitId==='aggregate'){
  const group=k%2===1;
  q=group?coding('report','实现 report(orders)：返回每位客户的已支付金额对象；取消订单不建立条目。客户名可以是任意字符串。','function report(orders) { const result=Object.create(null);\n  // TODO\n  return result;\n}',[
    {name:'空输入',args:[[]],expected:{}},{name:'重复与不同客户',args:[[paid(n),paid(3),paid(7,'Lin'),{...paid(100),status:'cancelled'}]],expected:{Ada:n+3,Lin:7}},{name:'特殊客户名',args:[[paid(n,'constructor')]],expected:JSON.parse('{"constructor":'+n+'}')}])
   :coding('report','实现 report(orders)：返回已支付订单的金额总和，空数组返回 0。','function report(orders) {\n  // TODO\n  return 0;\n}',[{name:'空输入',args:[[]],expected:0},{name:'混合状态',args:[[paid(n),paid(3),{...paid(900),status:'cancelled'}]],expected:n+3},{name:'只有取消',args:[[{...paid(n),status:'cancelled'}]],expected:0}]);
 }
 if(unitId==='aggregate'&&!options.legacy&&k===2)q=coding('summarizePaid','实现 summarizePaid(orders)：返回已支付订单的 {total, count, average}。count 是笔数；无已支付订单时 average 为 0，不做四舍五入。','function summarizePaid(orders) {\n  // TODO：一次统计多个指标\n  return { total: 0, count: 0, average: 0 };\n}',[
  {name:'空输入',args:[[]],expected:{total:0,count:0,average:0}},{name:'金额与笔数不同',args:[[paid(n),paid(3),{...paid(900),status:'cancelled'}]],expected:{total:n+3,count:2,average:(n+3)/2}},{name:'零金额也算一笔',args:[[paid(0),paid(7)]],expected:{total:7,count:2,average:3.5}},{name:'全部取消，不能除以零',args:[[{...paid(n),status:'cancelled'}]],expected:{total:0,count:0,average:0}},{name:'平均值不取整',args:[[paid(1),paid(2),paid(2)]],expected:{total:5,count:3,average:5/3}}]);
 if(unitId==='aggregate'&&!options.legacy&&k===3)q=coding('report','实现 sumPaid(orders)、groupPaid(orders) 和 report(orders)。report 必须调用前两个函数，组合其返回值为 {total, byCustomer}。三个函数分别验收，并替换辅助函数检查 report 是否真正复用它们。','function sumPaid(orders) {\n  // TODO：返回已支付总金额\n  return 0;\n}\n\nfunction groupPaid(orders) {\n  // TODO：返回各客户的已支付金额\n  return Object.create(null);\n}\n\nfunction report(orders) {\n  // TODO：调用上面两个函数，组合返回值\n  return { total: 0, byCustomer: {} };\n}',[
  {name:'sumPaid 单独处理混合状态',fn:'sumPaid',args:[[paid(n),paid(3),{...paid(900),status:'cancelled'}]],expected:n+3},{name:'sumPaid 单独处理空输入',fn:'sumPaid',args:[[]],expected:0},
  {name:'groupPaid 单独处理客户分组',fn:'groupPaid',args:[[paid(n),paid(3),paid(7,'Lin'),{...paid(900,'OnlyCancelled'),status:'cancelled'}]],expected:{Ada:n+3,Lin:7}},{name:'groupPaid 支持特殊名称和零金额',fn:'groupPaid',args:[[paid(0,'constructor'),paid(n,'__proto__')]],expected:JSON.parse('{"constructor":0,"__proto__":'+n+'}')},{name:'groupPaid 单独处理空输入',fn:'groupPaid',args:[[]],expected:{}},
  {name:'report 组合两个结果',args:[[paid(n),paid(5,'Lin'),{...paid(900),status:'cancelled'}]],expected:{total:n+5,byCustomer:{Ada:n,Lin:5}}},{name:'report 空输入组合',args:[[]],expected:{total:0,byCustomer:{}}},
  {name:'替换辅助函数后，report 使用返回值而非重复计算',args:[[paid(n)]],dependencies:{sumPaid:17,groupPaid:{Probe:9}},expected:{total:17,byCustomer:{Probe:9}}}]);
 if(unitId==='validation')q=coding('validTotal','实现 validTotal(records)：只累计对象中 status 为 paid、amount 为非负安全整数的金额。其他记录（包括 null）跳过，输入非数组时抛出 TypeError。','function validTotal(records) {\n  // TODO\n  return 0;\n}',[
  {name:'正常与零金额',args:[[paid(n),paid(0)]],expected:n},{name:'坏记录混入',args:[[null,{},paid(-1),paid('2'),paid(2.5),paid(n)]],expected:n},{name:'取消不计入',args:[[{...paid(n),status:'cancelled'}]],expected:0},{name:'空数组',args:[[]],expected:0},{name:'拒绝非数组',args:['bad'],throws:'TypeError',expected:{throws:'TypeError'}}]);
 if(unitId==='debug')q=coding('countEligible','修复函数：统计 paid 且 amount >= minimum 的订单数量。必须包含等于门槛；返回数量，不能返回金额。','function countEligible(orders, minimum) {\n  return orders.filter(o => o.amount > minimum).length;\n}',[
  {name:'等于边界',args:[[paid(n)],n],expected:1},{name:'取消订单',args:[[{...paid(n+1),status:'cancelled'}],n],expected:0},{name:'低于与高于',args:[[paid(n-1),paid(n+1)],n],expected:1},{name:'空数组',args:[[],n],expected:0}]);
 if(unitId==='testing'){
  const scenarios=[['一个实现把 >= 误写成 >。门槛为 '+n+'，哪笔 paid 订单最能暴露错误？',[String(n-1),String(n),String(n+1)],1],['一个实现忘了过滤订单状态。哪个输入最能暴露错误？',['空数组','一笔 paid 订单','一笔 cancelled 且金额大于 0 的订单'],2],['对空数组求和报错，应补哪项回归测试？',['只有多笔正常订单','空数组，预期 0','任意随机文本'],1],['修复取消订单后，怎样防止破坏原功能？',['只检查取消订单','同时检查 paid、cancelled、空数组与边界','只看代码能否运行'],1]][k];
  q={kind:'choice',brief:scenarios[0],options:scenarios[1],expected:String(scenarios[2]),starter:''};
 }
 if(unitId==='modules'){
  const scenarios=[['先阅读 package.json：scripts.start="node start.cjs"。启动入口应执行什么？',['npm start','git commit','node store.cjs'],0],['app.cjs 调用 store.load()，传入对象却没有 load 方法。优先检查什么？',['页面颜色','模块导出与传入接口是否一致','Git 分支名'],1],['本项目只依赖 node:http 与 node:fs，首次启动是否必须下载第三方包？',['必须安装 express','无需下载，它们是 Node 内置模块','必须连接生产数据库'],1],['想让新同事复现项目，应提供什么？',['只提供截图','运行版本、启动/测试命令与配置说明','只提供最后一行输出'],1]][k];q={kind:'choice',brief:scenarios[0],options:scenarios[1],expected:String(scenarios[2]),starter:''};
 }
 if(['store','http','delivery'].includes(unitId))q={kind:'project',projectMode:unitId==='store'?'store':unitId==='http'?'api':'all',brief:unitId==='store'?'在 store.cjs 实现 createStore(file).load/save：文件不存在返回 []，损坏 JSON 抛错；新实例可读回保存的数据。':unitId==='http'?'在 app.cjs 实现 GET /orders（只含 paid）、GET /summary（{total}）、未知路由 404、非 GET 405。数据必须来自 store.load()。':'完成完整回归，补齐 README 的运行与验证说明，查看 diff 后创建 Git 提交；工作区应干净。',starter:''};
 return {...q,contentRevision:unitId==='aggregate'?(options.legacy?1:2):1,caseSeed:n,id:randomUUID(),unitId,stage:u.stage,variant,mode,brief:q.brief||'先预测输出，再运行验证；注意执行顺序和边界。',tip:u.goal+'。先列出输入与预期，再逐项验证。'};
}
export function stageQuestions(stage){
 if(stage==='S0'){const qs=units.filter(u=>u.stage===stage).flatMap(u=>[0,1,2,3].map(i=>makeQuestion(u.id,i,'exam')));const n=randomInt(200,900);qs.push({id:randomUUID(),unitId:'loops',kind:'predict',brief:'综合：追踪函数、局部变量、循环与分支。',starter:`const orders=[${n},2,3];let total=9;function calc(rows){let total=0;for(const value of rows){if(value>2)total+=value;}return total;}console.log(calc(orders)+total);`,expected:String(n+12)});return qs;}
 if(stage==='S1'){const qs=['aggregate','validation','debug','testing'].flatMap(id=>(id==='aggregate'?[0,1,2,3]:[0,1]).map(i=>makeQuestion(id,i,'exam')));const n=randomInt(200,900);qs.push({...coding('buildReport','独立实现 buildReport(records)：返回 {total,byCustomer,rejected}。合法记录须为对象、customer 是字符串、amount 是非负安全整数、status 是 paid 或 cancelled；合法 cancelled 不计金额，非法记录计入 rejected。非数组抛 TypeError。','function buildReport(records) {\n // TODO\n}',[{name:'空输入',args:[[]],expected:{total:0,byCustomer:{},rejected:0}},{name:'混合业务与无效记录',args:[[paid(n),paid(3),paid(5,'Lin'),{...paid(100),status:'cancelled'},null,paid(-2)]],expected:{total:n+8,byCustomer:{Ada:n+3,Lin:5},rejected:2}},{name:'特殊客户名',args:[[paid(n,'__proto__')]],expected:{total:n,byCustomer:JSON.parse('{"__proto__":'+n+'}'),rejected:0}},{name:'非数组',args:['bad'],throws:'TypeError',expected:{throws:'TypeError'}}]),id:randomUUID(),unitId:'validation'});return qs;}
 const q=makeQuestion('delivery',0,'exam');q.projectExam=true;q.brief+=' 独立工程挑战：新增 GET /health 返回 {status:"ok"}；GET /orders?customer=Ada 只返回该客户的 paid 订单；/summary 仍统计所有已支付订单。运行完整回归并更新文档，最终提交。';return [q];
}
