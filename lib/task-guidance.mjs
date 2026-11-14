// Public teaching material is authored separately from private grading cases.
const fields=[{name:'customer',type:'字符串',meaning:'客户名称；同一名称表示同一位客户，名称可以是任意字符串。'},{name:'amount',type:'数字',meaning:'本笔订单的金额，按输入数值直接计算，不换算货币单位。'},{name:'status',type:'字符串',meaning:'paid 表示已支付；cancelled 表示已取消。'}];
const orders=[{customer:'Ada',amount:120,status:'paid'},{customer:'Lin',amount:80,status:'cancelled'},{customer:'Ada',amount:30,status:'paid'},{customer:'Mei',amount:50,status:'paid'}];
const sample=JSON.stringify(orders,null,2);
const example=(label,args,expected)=>({label,args,expected});
const basic=(intro,rules=[])=>({intro,fields:[],rules,examples:[]});
export function taskContext(q){
 if(q.kind==='predict')return basic('这是一段完整的小程序。输入和初始值已写在代码中，无需另外准备 orders 或其他变量。',['按原代码预测 console.log 的输出，填写打印出来的文本。','本题只读程序，不需要补写函数或修改代码。']);
 if(q.kind==='choice')return basic('这是一道概念或测试设计选择题，已知条件和选项都在题干中。',['选择一项答案，不需要另外编写或运行一个工程。']);
 if(q.fn==='buildReport')return {intro:'records 是传入函数的候选订单数组，可能混入非法记录。返回一份汇总对象，由调用方使用。',signature:'buildReport(records) → { total, byCustomer, rejected }',fields,rules:['合法记录必须具有字符串 customer、非负安全整数 amount，以及 paid 或 cancelled 状态。','paid 计入总金额和客户分组；合法 cancelled 不计金额，也不算非法记录。','非法记录计入 rejected；非数组输入抛出 TypeError。','空数组返回 { total: 0, byCustomer: {}, rejected: 0 }。客户名可以是任意字符串。'],examples:[example('公开示例',[orders],{total:200,byCustomer:{Ada:150,Mei:50},rejected:0}),example('非法记录计数',[[null,{customer:'Ada',amount:12,status:'paid'}]],{total:12,byCustomer:{Ada:12},rejected:1})]};
 if(q.unitId==='aggregate'){
  if(q.contentRevision===2&&q.variant===2)return {intro:'orders 是有效订单对象数组，分别统计已支付金额、笔数和平均金额。',signature:'summarizePaid(orders) → { total, count, average }',fields,rules:['只统计 paid；金额为 0 的已支付订单也计入笔数。','average = total / count，不做四舍五入；没有已支付订单时三个值均为 0。','使用 return 返回三个字段组成的对象。'],examples:[example('公开订单示例',[orders],{total:200,count:3,average:200/3}),example('空输入',[[]],{total:0,count:0,average:0})]};
  if(q.contentRevision===2&&q.variant===3)return {intro:'把报表拆成三个函数：sumPaid 求总金额，groupPaid 按客户累计，report 组合两者。',signature:'report(orders) → { total, byCustomer }',fields,rules:['sumPaid(orders) 返回 paid 总金额；空数组返回 0。','groupPaid(orders) 返回按客户累计的 paid 金额对象；空数组返回 {}，客户名可以是任意字符串。','report 必须将同一 orders 传给两个辅助函数，并把各自返回值组合为 total 和 byCustomer。','验收分别检查辅助函数，并替换其返回值验证 report 的实际调用，不只检查最终报表。'],examples:[example('组合报表',[orders],{total:200,byCustomer:{Ada:150,Mei:50}}),example('空输入',[[]],{total:0,byCustomer:{}})]};
  const group=(q.variant??0)%2===1;
  return {intro:'orders 是由订单对象组成的数组。平台会调用 report(orders)，把不同订单数组传给你写的函数；不用自己创建全局 orders。',signature:group?'report(orders) → { 客户名: 已支付金额合计 }':'report(orders) → 已支付金额合计（数字）',fields,rules:group?['返回一个按客户名称为键、累计金额为值的对象。','只统计 paid，同一客户的多笔订单要合计。','只有 cancelled 订单的客户不建立条目；空数组返回 {}。','客户名可以是任意字符串，包括 constructor 等名称。','使用 return 返回结果，不是只打印结果；不要求修改输入数组。']:['只累计 status 为 paid 的订单金额。','cancelled 不计入；空数组或全部取消时返回 0。','本题给定有效的订单对象；非法记录校验在后续 Lab 中训练。','使用 return 返回数字，不是只打印结果；不要求修改输入数组。'],examples:[example('同一份公开订单示例',[orders],group?{Ada:150,Mei:50}:200),example('空输入',[[]],group?{}:0)]};
 }
 if(q.unitId==='validation')return {intro:'records 是候选记录数组，既可能包含正常订单，也可能有 null、缺字段或错误类型。',signature:'validTotal(records) → 金额合计（数字）',fields:fields.filter(f=>f.name!=='customer'),rules:['只累计 status 为 paid 且 amount 为非负安全整数的对象。','null、缺字段、负数、字符串金额、小数等不符合条件的记录跳过。','空数组返回 0，非数组输入抛出 TypeError。','本题不要求按 customer 分组，也不以 customer 是否存在作为金额记录的额外条件。'],examples:[example('混合正常与异常数据',[[null,{status:'paid',amount:12},{status:'paid',amount:'3'},{status:'cancelled',amount:9}]],12),example('空输入',[[]],0)]};
 if(q.unitId==='debug')return {intro:'orders 是有效订单对象数组，minimum 是本次统计的金额门槛。修复现有函数，返回满足业务条件的订单数量。',signature:'countEligible(orders, minimum) → 订单数量（整数）',fields:[...fields,{name:'minimum',type:'数字参数',meaning:'调用函数时额外传入的金额门槛；等于门槛也应计数。'}],rules:['仅统计 status 为 paid 且 amount >= minimum 的订单。','返回笔数，不返回金额总和；空数组返回 0。'],examples:[example('门槛为 50',[orders,50],2),example('空输入',[[],50],0)]};
 if(q.kind==='project'){
  if(q.projectMode==='store')return {intro:'这是实际的 Node.js 文件存储模块。平台提供 file 路径，你实现 createStore(file) 返回对象的 load 和 save 方法。',signature:'createStore(file) → { load(), save(rows) }',fields:[{name:'file',type:'文件路径字符串',meaning:'订单 JSON 文件的位置；每个实例都使用传入的路径。'},{name:'rows',type:'订单数组',meaning:'需要原样保存的订单数据，字段结构见下面公开示例。'}],rules:['load() 返回订单数组；目标文件不存在时返回 []。','save(rows) 替换文件中的旧数据；新的 store 实例也必须读回已保存内容。','损坏 JSON 或其他真实文件错误应抛出，不应都伪装成空数组。'],examples:[{label:'保存后由新实例读取',inputText:'const store = createStore(file);\nstore.save([{ customer: "Ada", amount: 120, status: "paid" }]);\ncreateStore(file).load();',expected:[{customer:'Ada',amount:120,status:'paid'}]}]};
  const extra=q.projectExam?['GET /health → 200，JSON 为 { status: "ok" }。','GET /orders?customer=Ada 只返回 Ada 的 paid 订单，找不到客户时返回 []。']:[];
  return {intro:q.projectMode==='api'?'createApp(store) 接收一个具有 load() 方法的存储对象，返回可 listen 的 Node HTTP 服务。验收时会注入存储对象，不需要连接数据库。':'这是同一个订单服务工程的交付任务，需要同时检查存储、HTTP、运行文档和 Git 提交。',signature:q.projectMode==='api'?'createApp(store) → Node HTTP Server':'npm test → 更新 README → 查看差异 → Git 提交',fields,rules:['订单数据由 store.load() 提供，每次请求应反映最新数据。','GET /orders → 200，返回 paid 订单数组；GET /summary → 200，返回 { total }。','响应使用 application/json；未知路径返回 404，非 GET 方法返回 405。',...extra,...(q.projectMode==='all'?['README 说明运行与验证方式，完成自己的提交并保持工作区干净。']:[])],examples:[{label:'假设 store.load() 返回这些订单',inputText:sample,responseLabel:'GET /summary 的 JSON',expected:{total:200}},{label:'相同数据下查询订单',inputText:'GET /orders',expected:orders.filter(o=>o.status==='paid')}]};
 }
 return basic('按题干给定的输入、输出和操作要求完成任务。');
}
const topic=(title,text,code)=>({title,text,...(code?{code}:{})});
export function knowledgeFor(q){
 const shared=[topic('函数参数与返回值','参数由调用方传入。函数用 return 把值交给调用方；console.log 只负责输出。','function double(value) { return value * 2; }'),topic('数组和对象','数组保存一组记录，每项可以是对象。用对象字段读取一项记录的信息。','const items = [{ name: "book", price: 12 }];\nitems[0].price; // 12')];
 const topics={
 values:[topic('赋值与当前值','赋值会更新变量。把一个数字赋给另一个变量，不代表两者以后会同步变化。','let a = 4; const old = a; a = 9;'),topic('表达式与类型','先算右侧表达式，再赋值。数字加法和字符串连接的行为不同。','3 + 2; // 5\n"3" + 2; // "32"')],
 branch:[topic('条件与分支','if 的条件成立时执行该分支，否则可以进入 else。else if 从上到下只执行第一个成立的分支。'),topic('比较与组合条件','>= 包含等于；&& 要求两侧都成立。先判断条件，再追踪实际执行的代码。')],
 loops:[topic('逐项遍历','for...of 每次取得数组的一项，循环体可以更新累计状态。','for (const item of items) { console.log(item); }'),topic('跳过与终止','continue 跳过本次循环的后续代码；break 结束整个循环。数组为空时，for...of 的循环体不会执行。')],
 scope:[...shared.slice(0,1),topic('局部变量与作用域','参数和局部变量只在相应作用域内有效。同名变量可能是不同的变量，需先判断当前代码处于哪个作用域。')],
 data:[shared[1],topic('引用与浅复制','两个变量可以指向同一个对象；修改共享对象会被两者看见。展开语法创建新的外层对象或数组，属于浅复制。','const original = { value: 4 };\nconst alias = original;\nconst copy = { ...original };')],
 aggregate:[...shared,topic('字段访问与动态键','record.customer 读取固定字段；result[name] 可以用变量 name 的内容作为键。','const counts = Object.create(null);\nconst name = "book";\ncounts[name] = 1;'),topic('筛选与累计','先明确哪些记录应该参与统计，再考虑如何遍历、累计或按名称分别累计。空输入也必须有约定结果。'),topic('判断对象是否已有某个键','推荐使用 Object.hasOwn(object, key) 判断对象自身是否包含这个键，key 可以是变量。in 还会检查继承来的属性；if (object[key]) 判断的是值的真假，不能准确判断键是否存在，例如已有金额为 0 时。Object.hasOwn 也适用于 Object.create(null) 创建的对象。','const totals = { Ada: 0, Lin: undefined };\nconst name = "Ada";\nObject.hasOwn(totals, name); // true，即使值为 0\nObject.hasOwn(totals, "Lin"); // true，即使值为 undefined\nObject.hasOwn(totals, "Mei"); // false\nObject.hasOwn(totals, "constructor"); // false\n"constructor" in totals; // true，来自原型'),topic('任意字符串键','普通对象可能继承 constructor 等属性。无原型对象适合当作字符串键的字典；不要把继承属性误认为已有统计值。','const dictionary = Object.create(null);')],
 validation:[shared[0],topic('区分值与类型','null 不是可直接读取字段的记录，字符串数字也不等于数字。校验输入后再访问字段。'),topic('安全整数与异常','Number.isSafeInteger 检查整数与安全范围。throw new TypeError() 表示输入类型不符合约定。')],
 debug:[topic('从失败输入定位问题','比较业务规则、触发错误的输入、预期与实际结果。一次只验证一个假设。'),topic('边界与回归','低于、等于和高于门槛属于不同情境；修复后也要检查原本正确的情况。')],
 testing:[topic('反例','好的反例能让有缺陷的实现和正确实现产生不同结果。'),topic('测试覆盖','空输入、正常值、边界和异常状态关注的是不同风险，不能互相替代。')],
 modules:[topic('项目入口','package.json 的 scripts 指定启动与测试命令，入口文件负责把模块组织起来。'),topic('模块契约','调用方依赖的是导出函数、参数与返回值的约定；模块名称相同不等于接口兼容。')],
 store:[topic('持久化与内存状态','内存变量只属于当前进程；持久化要求保存后其他实例仍能读到相同数据。'),topic('JSON 与错误分类','JSON.stringify 和 JSON.parse 在对象与文本之间转换。文件不存在、JSON 损坏与权限问题应区别处理。')],
 http:[topic('请求与响应','HTTP 请求包含方法和路径；响应包含状态码、头和正文。查询字符串不是路径的一部分。'),topic('依赖注入','createApp 接收存储对象，按约定调用它，不应把验收数据写死在处理器中。'),topic('JSON 响应','正文和 Content-Type 应一致，数据改变后接口也应返回新的结果。')],
 delivery:[topic('回归与可复现','交付说明应让另一个人能够启动、测试并检查结果；截图不能代替可复现的步骤。'),topic('Git 差异与提交','先检查工作区差异和测试结果，再提交有意义的改动。提交后仍需检查工作区状态。')]
 };
 if(q.unitId==='aggregate'&&q.contentRevision===2&&q.variant===2)return {title:'本题知识点',topics:[...shared,topic('多个统计量','金额累计与笔数累计是不同变量；零金额订单仍应计数。'),topic('平均值与空集合','平均值是总金额除以笔数；先判断笔数为 0 的情况，避免 NaN。'),topic('对象返回值','return { total, count, average } 将多个指标作为一个对象返回。')]};
 if(q.unitId==='aggregate'&&q.contentRevision===2&&q.variant===3)return {title:'本题知识点',topics:[...topics.aggregate,topic('函数职责与组合','每个辅助函数完成一项统计，report 调用它们后组合结果。返回函数对象与调用函数不同。','function double(x) { return x * 2; }\nfunction describe(x) { return { value: double(x) }; }')]};
 const chosen=q.unitId==='aggregate'&&(q.variant??0)%2===0?[topics.aggregate[0],topics.aggregate[1],topics.aggregate[3]]:topics[q.unitId]||shared;
 return {title:'本题知识点',topics:chosen};
}
