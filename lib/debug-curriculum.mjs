// A unit is designed together: task, contract, public scaffold, regression and transfer assessment.
const example=(label,args,expected)=>({label,args,expected});
const schemas={train:[['countEligible','orders','amount','status','paid','customer'],['sumPaid','orders','amount','status','paid','customer'],['groupPaid','orders','amount','status','paid','customer'],['sumPaid','orders','amount','status','paid','customer']],exam:[['countAvailable','items','qty','enabled',true,'name'],['totalCompleted','jobs','minutes','done',true,'name'],['groupHours','entries','hours','approved',true,'team'],['sumDelivered','shipments','units','delivered',true,'name']]};
export const debugTitles=['包含等于的边界','循环结束后再返回','分组累计而非覆盖','多次调用互不污染'];
export function debugQuestion(variant,mode,n){
 const k=variant%4,training=mode==='train';
 const [fn,param,amount,flag,accepted,key]=schemas[training?'train':'exam'][k];
 const spec={kind:k===0?'count':k===2?'group':'sum',sequence:k===3,fn,param,amount,flag,accepted,key};
 const row=(value,name='Ada',eligible=true)=>({[amount]:value,[flag]:eligible?accepted:training?'cancelled':false,...(k===2?{[key]:name}:{})});
 const fieldAccess=`row.${amount}`,condition=`row.${flag} === ${JSON.stringify(accepted)}`;
 const signature=`${fn}(${param}${k===0?', minimum':''})`;
 const starters=[
 `function ${fn}(${param}, minimum) {\n  return ${param}.filter(row => ${condition} && ${fieldAccess} > minimum).length;\n}`,
 `function ${fn}(${param}) {\n  let total = 0;\n  for (const row of ${param}) {\n    if (${condition}) total += ${fieldAccess};\n    return total;\n  }\n  return total;\n}`,
 `function ${fn}(${param}) {\n  const totals = Object.create(null);\n  for (const row of ${param}) {\n    if (${condition}) totals[row.${key}] = ${fieldAccess};\n  }\n  return totals;\n}`,
 `let total = 0;\nfunction ${fn}(${param}) {\n  for (const row of ${param}) {\n    if (${condition}) total += ${fieldAccess};\n  }\n  return total;\n}`
 ];
 const skillKeys=[`debug:${k}`];
 const cases=(k===0?[
 {name:'刚好等于门槛',args:[[row(n)],n],expected:1},{name:'低于与高于门槛',args:[[row(n-1),row(n+1)],n],expected:1},{name:'不符合状态的不计数',args:[[row(n+1,'Ada',false)],n],expected:0},{name:'空输入',args:[[],n],expected:0},{name:'零门槛包含零值',args:[[row(0)],0],expected:1}]:k===1?[
 {name:'多笔有效记录均累计',args:[[row(n),row(3),row(90,'Ada',false)]],expected:n+3},{name:'首项无效仍继续遍历',args:[[row(90,'Ada',false),row(n)]],expected:n},{name:'空输入',args:[[]],expected:0},{name:'零值不终止遍历',args:[[row(0),row(n)]],expected:n}]:k===2?[
 {name:'同一名称重复累计',args:[[row(n),row(3),row(7,'Lin')]],expected:{Ada:n+3,Lin:7}},{name:'取消记录不覆盖已有值',args:[[row(n),row(90,'Ada',false),row(91,'OnlyCancelled',false)]],expected:{Ada:n}},{name:'任意字符串名称',args:[[row(0,'constructor'),row(n,'__proto__')]],expected:JSON.parse('{"constructor":0,"__proto__":'+n+'}')},{name:'空输入',args:[[]],expected:{}}]:[
 {name:'连续调用各自计算',calls:[[[row(n)]],[[row(3)]]],expected:[n,3]},{name:'非空之后再传空数组',calls:[[[row(n)]],[[]]],expected:[n,0]},{name:'取消记录不影响下一次调用',calls:[[[row(n,'Ada',false)]],[[row(7)]]],expected:[0,7]},{name:'三次调用均独立',calls:[[[row(n),row(3)]],[[row(2)]],[[row(1)]]],expected:[n+3,2,1]}]).map(c=>({...c,skillKeys}));
 const requirement=k===0?`仅对 ${flag} 为 ${JSON.stringify(accepted)} 且 ${amount} >= minimum 的记录计数，包含等于。`:k===2?`仅累计 ${flag} 为 ${JSON.stringify(accepted)} 的记录，按 ${key} 分组；同一名称的多笔 ${amount} 必须合计，名称可以是任意字符串。`:`累计所有 ${flag} 为 ${JSON.stringify(accepted)} 的记录的 ${amount}；空数组返回 0。`;
 const sequenceRule=k===3?'同一进程连续调用时，每次仅统计本次参数，不能受到前一次调用影响。':'';
 const context={intro:`${param} 由调用方传入，为有效记录组成的数组。${k===3?'本关会在同一执行环境中连续调用函数。':''}`,signature:`${signature} → ${k===2?'{ 名称: 合计 }':k===0?'数量（整数）':'合计（数字）'}`,fields:[{name:amount,type:'非负安全整数',meaning:'本条记录的数值。'},{name:flag,type:training?'字符串':'布尔值',meaning:`仅 ${JSON.stringify(accepted)} 的记录参与统计。`},...(k===2?[{name:key,type:'字符串',meaning:'分组名称，可以是任意字符串。'}]:[]),...(k===0?[{name:'minimum',type:'非负安全整数参数',meaning:'包含等于的统计门槛。'}]:[])],rules:[requirement,sequenceRule,'使用 return 返回结果。'].filter(Boolean),examples:k===3?[{label:'同一环境连续调用',calls:[[[row(5)]],[[row(2)]]],inputText:`${fn}(${JSON.stringify([row(5)])});\n${fn}(${JSON.stringify([row(2)])});`,responseLabel:'两次应分别返回',expected:[5,2]}]:[example('公开示例',k===0?[[row(12)],10]:[[row(12),row(90,'Lin',false)]],k===0?1:k===2?{Ada:12}:12),example('空输入',k===0?[[],10]:[[]],k===2?{}:0)]};
 const hints=[
 ['先构造一笔刚好位于门槛上的有效记录，比较需求与实际输出。','“大于”和“大于或等于”的边界不同；先检查比较表达式。','保留状态过滤，只在比较符处做局部修复，再验证低于、等于、高于三种输入。'],
 ['让函数处理不止一笔有效记录，观察实际返回值是否包含后面的记录。','return 会立即结束函数，循环内后续记录不会继续处理。','追踪循环体与函数体的边界，考虑累计完成后再返回。'],
 ['让同一个名称出现两次，比较两条记录合计与最后一条记录的数值。','对同一个对象键赋值会覆盖原值；检查首次出现与再次出现的处理。','结合 Object.hasOwn 判断是否已有该键，保持已有合计后再累计；注意金额为 0 的情况。'],
 ['在同一环境调用两次，再把第二次参数换成空数组。','函数外的变量可以跨调用保留状态；检查累计变量的作用域与初始化时机。','每次调用需要自己的累计初值，不能依赖清空外部变量的手工操作。']
 ][k];
 return {kind:'function',fn,starter:starters[k],cases,debugSpec:spec,debugVersion:2,context,skillKeys,scaffold:['引导复现与局部修改','构造反例并修复控制流','独立设计分组反例','独立修复并验证多次调用'][k],brief:`修复 ${signature}：${requirement}${sequenceRule}${training?'先试运行一个能暴露初始缺陷的反例，再修改并完成回归验收。':'独立完成新业务情境的修复。'}`,hints,formatExample:k===3?{args:JSON.stringify([[[]],[[]]],null,2),expected:'[0,0]'}:{args:JSON.stringify(context.examples[0].args,null,2),expected:JSON.stringify(context.examples[0].expected,null,2)},defaultTest:k===0?{args:JSON.stringify([[row(20)],20],null,2),expected:'1'}:{args:'',expected:''}};
}
export function parseDebugTest(q,body){
 let input,expected;try{input=JSON.parse(body.testArgs);expected=JSON.parse(body.testExpected);}catch{throw new Error('输入参数和预期结果都需要是有效 JSON。');}
 const s=q.debugSpec,calls=s.sequence?input:[input];
 if(!Array.isArray(calls)||!calls.length||calls.length>4||s.sequence&&calls.length<2)throw new Error('连续调用请提供 2～4 组参数；普通调用请提供一组参数数组。');
 const outputs=calls.map(args=>{
  if(!Array.isArray(args)||args.length!==(s.kind==='count'?2:1)||!Array.isArray(args[0])||args[0].length>16)throw new Error('每组参数首项应是记录数组，最多 16 条；请按函数签名填写参数个数。');
  if(s.kind==='count'&&(!Number.isSafeInteger(args[1])||args[1]<0||args[1]>1000000))throw new Error('试运行门槛需为 0～1000000 的整数。');
  for(const row of args[0])if(!row||Array.isArray(row)||typeof row!=='object'||!Number.isSafeInteger(row[s.amount])||row[s.amount]<0||row[s.amount]>1000000||(typeof s.accepted==='boolean'?typeof row[s.flag]!=='boolean':!['paid','cancelled'].includes(row[s.flag]))||s.kind==='group'&&(typeof row[s.key]!=='string'||row[s.key].length>100))throw new Error('记录字段不符合本题约定；试运行数值需为 0～1000000 的整数。');
  const rows=args[0].filter(row=>row[s.flag]===s.accepted);
  if(s.kind==='count')return rows.filter(row=>row[s.amount]>=args[1]).length;
  if(s.kind==='group'){const result=Object.create(null);for(const row of rows)result[row[s.key]]=(result[row[s.key]]||0)+row[s.amount];return JSON.parse(JSON.stringify(result));}
  return rows.reduce((total,row)=>total+row[s.amount],0);
 });
 return {test:{name:'学生保留的回归反例',...(s.sequence?{calls:input}:{args:input}),expected},oracle:s.sequence?outputs:outputs[0]};
}
