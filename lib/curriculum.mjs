const task = (id, stage, title, ability, brief, starter, hints, extra = {}) => ({ id, stage, title, ability, brief, starter, hints, ...extra });
export const tasks = [
  task('s0-state', 'S0', '一笔订单的状态变化', '变量与顺序执行', '先预测控制台输出，再运行对照，观察 total 的值是否随着 price 更新。', 'let price = 1200;\nlet count = 2;\nlet total = price * count;\nprice = 1500;\nconsole.log(total);', ['从第一行开始记录每个变量的值。', 'total 保存的是计算结果，还是一条会自动重算的公式？'], { kind: 'predict', expected: '2400', completion: { mode: 'direct' } }),
  task('s0-branch', 'S0', '取消订单还计费吗', '条件与业务规则', '先预测输出，再用一道选择题确认取消订单为何不计费。金额单位始终是分，无需写长解释。', "const order = { amount: 3800, status: 'cancelled' };\nlet revenue = 0;\nif (order.status === 'paid') {\n  revenue += order.amount;\n}\nconsole.log(revenue);", ['判断条件为真还是假。', '只有 paid 订单进入累加分支。'], { kind: 'predict', expected: '0', completion: { mode: 'check', question: '为什么这笔订单没有计入营业额？', choices: [{ id: 'zero', text: '因为订单金额为 0。' }, { id: 'status', text: '因为 cancelled 不等于 paid，累加分支没有执行。' }, { id: 'reset', text: '因为 += 会把 revenue 重新设为 0。' }], answer: 'status' } }),
  task('s0-transfer', 'S0', '换一组订单，自己追踪', '循环追踪 · 独立变式', '先预测最终输出，解释每一轮结束后 total 的值。这一步关闭提示和 AI；独立性仍需教师复核。', "const orders = [400, 900, 600];\nlet total = 0;\nfor (const amount of orders) {\n  if (amount >= 600) total += amount;\n}\nconsole.log(total);", [], { kind: 'predict', expected: '1500', independent: true, completion: { mode: 'explain' } }),
  task('s1-total', 'S1', '实现营业额统计', '函数、遍历与边界', '实现 totalPaid(orders)，只累计 status 为 paid 的订单金额。空数组返回 0。请保留函数名；金额为非负整数分。', 'function totalPaid(orders) {\n  // TODO：只累加已支付订单\n  return 0;\n}', ['准备一个初值为 0 的累计变量。', '逐个检查 order.status，再决定是否加上 order.amount。', '别忘了循环结束后返回累计值，以及空数组情况。'], { kind: 'function', fn: 'totalPaid', completion: { mode: 'direct' } }),
  task('s1-group', 'S1', '为客户生成对账单', '分组与数据结构', '实现 byCustomer(orders)，返回客户到已支付金额的对象，例如 {"Ada": 1200}。取消订单不应建立客户条目。客户名是任意字符串，包括 constructor 等特殊名称。', 'function byCustomer(orders) {\n  const result = Object.create(null);\n  // TODO：按 customer 分组，只统计 paid\n  return result;\n}', ['每个客户需要一个独立累计值。', '第一次遇到客户时，已有金额应视为 0。Object.create(null) 可以避免客户名与原型属性冲突。', '先过滤状态，再建立客户条目。'], { kind: 'function', fn: 'byCustomer', completion: { mode: 'check', question: '为什么这里用 Object.create(null) 建立客户字典？', choices: [{ id: 'sort', text: '这样会自动把客户按名字排序。' }, { id: 'keys', text: '避免客户名与对象原型上的内置属性冲突。' }, { id: 'save', text: '这样会自动把客户数据保存到磁盘。' }], answer: 'keys' } }),
  task('s1-transfer', 'S1', '新需求：达到门槛的订单', '需求迁移 · 独立变式', '实现 countEligible(orders, minimum)，返回 paid 且 amount 大于或等于 minimum 的订单数量。注意：返回数量，不是总金额。', 'function countEligible(orders, minimum) {\n  // TODO：返回符合条件的订单数量\n  return 0;\n}', [], { kind: 'function', fn: 'countEligible', independent: true, completion: { mode: 'explain' } }),
  task('s2-store', 'S2', '让订单跨重启保存', '模块、文件持久化与测试', '编辑 store.cjs：实现 createStore(file) 返回的 load/save。不存在的文件读取为空数组；保存 JSON 后，新实例仍能读回。损坏 JSON 应抛出错误。其他文件可阅读。', '', ['阅读 store.cjs 的接口和项目 README。', '用 node:fs 的 readFileSync/writeFileSync；只对 ENOENT 返回空数组。', '测试使用临时路径，避免把数据文件写死。'], { kind: 'project', file: 'store.cjs', completion: { mode: 'explain' } }),
  task('s2-api', 'S2', '修复订单查询接口', 'HTTP、契约与集成测试', '编辑 app.cjs：GET /orders 只返回 paid 订单；GET /summary 返回 { total: 已支付金额合计 }；未知路径返回 404，非 GET 返回 405。持久化数据从 store.load() 读取。', '', ['先阅读 createApp(store) 和现有路由。', '使用真正的状态码和 application/json 响应头。', '验收会保存新数据后再次请求，不能把响应写死。'], { kind: 'project', file: 'app.cjs', completion: { mode: 'explain' } }),
  task('s2-delivery', 'S2', '交付一次可审查的修改', 'Git、回归测试与交付说明', '保留前两项实现，在 README.md 中写清启动、测试、变更原因和验证方法。运行 npm test，查看 git diff，提交一次有意义的 commit，再提交交付说明。最终验收会重新检查持久化和 API。', '', ['先执行 npm test，修复回归。', '查看 git status 与 git diff，确认提交内容。', '用右侧 Git 操作创建提交，再提交本任务。'], { kind: 'project', file: 'README.md', independent: true, completion: { mode: 'explain' } })
];
export const stages = [
  { id: 'S0', title: '读懂程序', subtitle: '先预测，再验证', outcome: '追踪状态、条件与循环' },
  { id: 'S1', title: '解决问题', subtitle: '把需求写成可靠逻辑', outcome: '函数、集合与边界测试' },
  { id: 'S2', title: '完成交付', subtitle: '进入真实的小型工程', outcome: '文件、HTTP、测试与 Git' }
];
const basics = {
  's0-state': 'let 用来创建一个可修改的变量。= 表示把右侧计算结果存入左侧变量，* 表示乘法。程序从上到下执行，每条语句通常以分号结束。console.log(...) 将括号里的值输出。先用纸笔写下每一行执行后的值。',
  's0-branch': '对象用 { 名称: 值 } 保存一组信息，order.status 读取其中的状态。=== 比较是否相等；if 只有在条件成立时才执行花括号里的语句。+= 表示在原值上累加。',
  's0-transfer': '数组 [400, 900, 600] 保存多个值。for (const amount of orders) 会依次把每一项放进 amount，并执行循环体。>= 表示大于或等于。先分别记录每轮的 amount 与 total。',
  's1-total': '函数用 function 名称(参数) { ... } 定义，return 返回结果。orders 是调用者传入的订单数组。可以使用 for...of 遍历，if 判断状态，用变量累加。系统会多次用不同数组调用你的函数。',
  's1-group': '对象可以作为按名称查找的字典。result[customer] 读取某客户的值，result[customer] = value 写入值。Object.create(null) 创建没有原型属性的字典，避免特殊客户名与内置属性冲突。',
  's1-transfer': '函数可以接收多个参数。&& 表示两个条件都必须成立。区分统计数量和累计金额，并检查等于门槛的情形。',
  's2-store': 'require 引入模块，module.exports 导出供其他文件使用的接口。JSON.stringify 把数据变成文本，JSON.parse 把文本还原成数据。try/catch 捕获错误；不存在文件的错误码是 ENOENT，其他错误需要继续抛出。',
  's2-api': 'HTTP 请求包含方法 req.method 与路径 req.url。响应通过 res.statusCode、res.setHeader 和 res.end 返回。createApp(store) 接收存储模块，路由不需要关心文件如何保存。测试会真正发出请求，检查响应和数据变化。',
  's2-delivery': '测试用于检查修改是否破坏旧行为。git status 查看哪些文件变化；git diff 查看具体改动；commit 保存带说明的版本。这里的操作作用于单独的订单练习仓库，不是 DevLabs 平台源码。'
};
export function publicTasks() { return tasks.map(({ expected, ...item }) => { const { answer, ...completion } = item.completion; return { ...item, completion, basics: basics[item.id] }; }); }
