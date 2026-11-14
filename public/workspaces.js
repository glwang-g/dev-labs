const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Workspace presentation is separate from identity. A future account session can
// supply its allowed workspace here; the local switch grants no authorization.
export const workspaces = {
  student: {title:'学生工作台', home:'route', pages:[
    {id:'route', label:'◇ S0–S2 学习路线', title:'JavaScript · S0–S2 完整路线'},
    {id:'evidence', label:'▤ 学习日志', title:'学习日志'},
    {id:'unit', label:'◇ 条件分支样板', title:'条件分支 · 训练与考核'},
    {id:'learn', label:'◈ 体验路线', title:'订单服务 · 体验路线'}
  ]},
  teacher: {title:'教师工作台', home:'overview', pages:[
    {id:'overview', label:'◈ 学习概览', title:'学习概览'},
    {id:'teaching', label:'◇ 学习详情', title:'学习详情与补练'},
    {id:'evidence', label:'▤ 学习记录', title:'学习记录'},
    {id:'pilot', label:'◉ 试教记录', title:'试教记录'},
    {id:'review', label:'◎ 人工复核', title:'人工复核'}
  ]}
};
export function workspaceFor(value) { return value === 'teacher' ? 'teacher' : 'student'; }
export function workspacePage(workspace, page) {
  const config=workspaces[workspaceFor(workspace)];
  return config.pages.some(p=>p.id===page) ? page : config.home;
}

export function teacherOverview(data) {
 const route=data.state.route, units=route?.units||[], events=route?.events||[];
 const weak=units.filter(u=>u.needs>0), passed=units.filter(u=>u.passed).length;
 const stages=Object.values(route?.stages||{}).filter(s=>s.passed).length;
 const exam=route?.exam, hints=events.filter(e=>e.kind==='hint').length;
 const observations=[...(data.state.pilot||[]),...(data.state.teaching?.observations||[])];
 const assigned=data.state.teaching?.assignments||[], awaiting=assigned.filter(a=>a.status==='awaiting-review');
 const pending=data.state.attempts.filter(a=>a.submitted&&a.passed&&a.review!=='not-required'&&!data.state.reviews[a.attemptId]).length;
 const unitName=id=>units.find(u=>u.id===id)?.title||id;
 const selected=units.find(u=>u.id===route?.selected);
 const status=u=>u.needs>0?`待补练 ${u.needs} 项`:u.passed?'单元考核通过':u.locked?'待解锁':u.trained.length||route?.question?.unitId===u.id||events.some(e=>e.kind==='practice-open'&&e.unitId===u.id)?'训练中':'待开始';
 return `<div class="intro"><div><div class="eyebrow">TEACHER WORKSPACE</div><h1>看见进展，找到需要帮助的地方。</h1><p>当前查看本机学员的学习情况。训练、自动考核与教师观察分别呈现。</p></div><a class="button-link" href="/api/export" download>导出学习记录 ↓</a></div>
 <div class="teacher-metrics"><section class="panel metric"><span>单元考核通过</span><strong>${passed}${units.length?' / '+units.length:''}</strong></section><section class="panel metric"><span>阶段综合考核通过</span><strong>${stages} / 3</strong></section><section class="panel metric"><span>待补练单元</span><strong>${weak.length}</strong></section><section class="panel metric"><span>试教观察记录</span><strong>${observations.length}</strong></section></div>
 <div class="teacher-columns"><section class="panel"><div class="panel-head">现在关注什么</div><div class="below-body">${exam&&!exam.finished?`<div class="callout amber">学员的${exam.paused?'已暂停':'进行中'}${exam.target==='stage'?exam.stage+' 阶段综合':'单元独立'}考核，已作答 ${exam.index}/${exam.total} 题。切换视角不会结束考核。</div>`:weak.length?`<div class="callout amber">优先关注：${weak.map(u=>esc(u.title)).join('、')}。先观察独立补练，再安排新的变式追问。</div>`:selected?`<p>当前单元：<strong>${esc(selected.title)}</strong> · ${status(selected)}</p><p>可围绕本单元更换输入、提出反例，观察能否独立预测、修改和验证。</p>`:'<p>学员尚未开始完整路线。切换到学生工作台，从第一项训练开始。</p>'}${exam?.finished?`<p>最近${exam.target==='stage'?exam.stage+' 阶段综合':'单元独立'}考核：<strong class="${exam.passed?'passed':'failed'}">${exam.passed?'通过':'待补练'}</strong>${exam.weak.length?' · '+exam.weak.map(id=>esc(unitName(id))).join('、'):''}</p>`:''}<p class="muted">完整路线累计请求提示 ${hints} 次。自动考核通过与现场展示理解分别记录。</p><div class="actions"><button data-view="evidence">查看学习记录</button><button data-view="pilot">记录试教观察</button></div></div></section>
 <section class="panel"><div class="panel-head">教师观察与复核</div><div class="below-body"><p>试教记录用于记录基线、卡点、陌生变式与延迟表现；人工复核用于记录对提交代码与解释的追问结论。</p><p>完整路线补练待追问：<strong>${awaiting.length}</strong> 项。</p><p>体验路线待人工复核：<strong>${pending}</strong> 项。</p><p class="muted">完整路线可在学习详情中记录追问、指定补练并检查后续变化。</p><div class="actions"><button data-view="teaching">查看完整路线详情</button><button data-view="review">进入人工复核</button></div></div></section></div>
 <section class="panel table-wrap"><div class="panel-head">S0–S2 能力进展<span class="muted">只读查看，不改变学员进度</span></div>${units.length?`<table class="evidence-table"><thead><tr><th>能力单元</th><th>训练覆盖</th><th>考核与补练</th><th>提示请求</th><th>教师跟进</th></tr></thead><tbody>${units.map(u=>`<tr><td><strong>${esc(u.stage)} · ${esc(u.title)}</strong></td><td>${u.trained.length} / ${u.trainingCount}</td><td><span class="${u.needs?'failed':u.passed?'passed':''}">${status(u)}</span></td><td>${events.filter(e=>e.kind==='hint'&&e.unitId===u.id).length}</td><td><button data-teaching-unit="${u.id}">查看详情${assigned.some(a=>a.unitId===u.id&&a.status==='awaiting-review')?' · 待追问':''}</button></td></tr>`).join('')}</tbody></table>`:'<div class="empty">完整路线尚无学习记录。旧体验路线记录仍可在“学习记录”中查看。</div>'}</section>`;
}
