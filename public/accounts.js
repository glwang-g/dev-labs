import {apiFetch, useSession} from './account-api.js';

const app = document.querySelector('#app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
async function request(url, body) {
  const response=await apiFetch(url,body===undefined ? {} : {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const result=await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

const query = new URLSearchParams(location.search);
const session = await request('/api/session');
const principal = session.principal;
const teacher = principal?.role === 'teacher';
const relationships = session.relationships || [];
const selected = relationships.find(relation => relation.status === 'active' && relation.student === query.get('learner'));
session.learnerId = teacher ? selected?.student : null;
session.learnerName = teacher ? selected?.studentName : null;
useSession(session);

if (!session.enabled || (principal && !query.has('account') && (!teacher || selected))) {
  await import('./app.js');
} else {
  render();
}

function render() {
  const active = relationships.filter(relation => relation.status === 'active');
  const pending = relationships.filter(relation => relation.status === 'pending');
  const register = query.get('mode') === 'register';
  app.innerHTML = `<main class="account-page"><h1>${teacher?'我的学生':principal?.role==='student'?'我的账号':'进入 DevLabs'}</h1>
    <p id="account-error" role="alert"></p>
    ${!principal || principal.role==='guest' ? `<section class="panel below-body"><h2>${register?'注册学生账号':'登录'}</h2>
      <form id="account-auth" class="account-form">
        ${register?'<label>显示名<input class="text-field" name="name" required maxlength="60" autocomplete="name"></label>':''}
        <label>邮箱<input class="text-field" name="email" type="email" required maxlength="254" autocomplete="email"></label>
        <label>密码<input class="text-field" name="password" type="password" required minlength="10" maxlength="128" autocomplete="${register?'new-password':'current-password'}"></label>
        <button class="primary">${register?'注册并登录':'登录'}</button>
      </form>
      <div class="actions"><a href="/?account=1${register?'':'&mode=register'}">${register?'已有账号，去登录':'注册学生账号'}</a>
      ${principal ? '<a href="/">继续匿名体验</a>' : '<button data-session="guest">匿名体验</button>'}</div>
      <p>匿名也可以练习。注册登录后可以选择导师，账号练习从自己的新工作区开始。</p></section>`
    : `<section class="panel below-body"><p>${esc(principal.name)} · ${teacher?'教师':'学生'}</p>
      ${teacher?'':'<a href="/">进入学生工作台</a>'} <button data-session="logout">退出登录</button></section>
      <section class="panel below-body"><h2>${teacher?'已绑定的学生':'我的老师'}</h2>
      ${active.length ? active.map(relation=>`<p>${esc(teacher?relation.studentName:relation.teacherName)}
      ${teacher?` <a href="/?learner=${encodeURIComponent(relation.student)}">进入学生记录</a>`:''}
      <button data-relation="end" data-id="${esc(relation.id)}">解除绑定</button></p>`).join('') : '<p>暂无绑定。</p>'}
      ${teacher || !active.length ? `<form class="account-form" id="account-request">
        ${teacher?'<label>已注册学生的邮箱<input name="email" class="text-field" type="email" required maxlength="254"></label>'
        : session.teachers.length ? `<label>选择教师<select name="teacherId" class="text-field">${session.teachers.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select></label>` : '<p>暂无已开通的试教教师。</p>'}
        ${teacher || session.teachers.length ? `<button class="primary">${teacher?'邀请学生':'发送绑定申请'}</button>`:''}
      </form>` : ''}</section>
      <section class="panel below-body"><h2>待确认的申请</h2>
        ${pending.length ? pending.map(relation=>`<p>${esc(teacher?relation.studentName:relation.teacherName)} · ${relation.sender===principal.id?'等对方确认':'等你确认'}
          ${relation.sender!==principal.id?`<button data-relation="accept" data-id="${esc(relation.id)}">确认绑定</button>`:''}
          <button data-relation="decline" data-id="${esc(relation.id)}">${relation.sender===principal.id?'撤回':'拒绝'}</button></p>`).join('') : '<p>当前没有待确认申请。</p>'}</section>`}
  </main>`;
  async function perform(url, body, destination) {
    const controls=[...app.querySelectorAll('button')];
    controls.forEach(button=>button.disabled=true);
    document.querySelector('#account-error').textContent='';
    try {
      await request(url,body);
      location.assign(destination);
    } catch (error) {
      document.querySelector('#account-error').textContent=error.message;
      controls.forEach(button=>button.disabled=false);
    }
  }
  document.querySelector('#account-auth')?.addEventListener('submit',event=>{
    event.preventDefault();
    perform('/api/session',{...Object.fromEntries(new FormData(event.currentTarget)),action:register?'register':'login'},'/');
  });
  document.querySelector('#account-request')?.addEventListener('submit',event=>{
    event.preventDefault();
    perform('/api/relationships',{...Object.fromEntries(new FormData(event.currentTarget)),action:'request'},'/?account=1');
  });
  app.querySelectorAll('[data-session]').forEach(button=>button.onclick=()=>perform('/api/session',{action:button.dataset.session},'/'));
  app.querySelectorAll('[data-relation]').forEach(button=>button.onclick=()=>{
    if(button.dataset.relation==='end' && !confirm('解除后，老师将失去该学生记录的访问权限。确定解除？'))return;
    perform('/api/relationships',{action:button.dataset.relation,id:button.dataset.id},'/?account=1');
  });
}
