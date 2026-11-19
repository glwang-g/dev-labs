import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createAccounts} from '../lib/accounts.mjs';

test('anonymous practice and two pairs of accounts enforce workspace and relationship boundaries', {timeout:15000}, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'devlabs-accounts-'));
  process.env.DEVLABS_DATA_DIR=dir;
  const { createServer }=await import('../server.mjs');
  const credentials=name=>({name,email:name+'@example.test',password:'test data only 123!'});
  const db=createAccounts(path.join(dir,'accounts.sqlite'));
  await db.add(credentials('teacher-one'),'teacher');
  await db.add(credentials('teacher-two'),'teacher');
  db.close();
  let server;
  async function boot() {
    server=createServer({accountMode:true});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  }
  await boot();
  function browser() {
    let cookie='', principal=null;
    const client=async (route,body,status=200,learner,override) => {
      const headers={cookie};
      if (principal) headers['x-devlabs-account']=override||principal.id;
      if (learner) headers['x-devlabs-learner']=learner;
      if (body) headers['content-type']='application/json';
      const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/'+route,{method:body?'POST':'GET',headers,body:body&&JSON.stringify(body)});
      const received=response.headers.get('set-cookie');
      if (received) {assert.match(received,/HttpOnly; SameSite=Strict/);cookie=received.split(';')[0];}
      const result=await response.json();
      assert.equal(response.status,status,JSON.stringify(result));
      if (route==='session'&&result.principal) principal=result.principal;
      return result;
    };
    return client;
  }
  try {
    const guest=browser(), s1=browser(), s2=browser(), t1=browser(), t2=browser();
    await guest('state',null,401);
    const g=(await guest('session',{action:'guest'})).principal;
    const anon=await guest('club-project',{action:'open'});
    await guest('club-project',{action:'save',step:0,code:anon.code+'\n// anonymous draft'});
    await guest('relationships',{action:'request',teacherId:'fake'},403);
    const a=(await s1('session',{action:'register',...credentials('student-one'),role:'teacher'})).principal;
    const b=(await s2('session',{action:'register',...credentials('student-two')})).principal;
    assert.equal(a.role,'student');
    const x=(await t1('session',{action:'login',...credentials('teacher-one')})).principal;
    const y=(await t2('session',{action:'login',...credentials('teacher-two')})).principal;
    await t1('relationships',{action:'request',email:g.id+'@example.test'},404);
    const p1=await s1('club-project',{action:'open'});
    const p2=await s2('club-project',{action:'open'});
    assert.notEqual(p1.directory,p2.directory);
    const fixed=p1.code.replace('+ 1 <','+ 1 <=');
    await Promise.all([s1('club-project',{action:'signup',step:0,code:fixed}),s2('club-project',{action:'save',step:0,code:p2.code+'\n// student two draft'})]);
    const req=await s1('relationships',{action:'request',teacherId:x.id});
    const id=req.relationships.find(row=>row.teacher===x.id).id;
    await s1('relationships',{action:'accept',id},409);
    await t1('state',null,403,a.id);
    await t2('relationships',{action:'accept',id},404);
    await t1('relationships',{action:'accept',id});
    const invite=await t2('relationships',{action:'request',email:b.email});
    const id2=invite.relationships.find(row=>row.student===b.id).id;
    await s2('relationships',{action:'accept',id:id2});
    const view=await t1('state',null,200,a.id);
    assert.ok(view.state.clubProject.signupPassedAt);
    assert.equal(view.project,undefined);
    await t1('teaching?unitId=values',null,200,a.id);
    await t1('state',null,403,b.id);
    await t2('state',null,403,a.id);
    await t2('state',null,200,b.id);
    await t1('state',null,403,g.id);
    await t1('club-project',{action:'open'},403,a.id);
    await s2('club-feedback',{note:'not a teacher'},403);
    await t1('club-feedback',{note:'请用刚好等于上限的输入复查。'},200,a.id);
    assert.equal((await s1('club-project',{action:'open'})).feedback[0].teacher,x.name);
    assert.equal((await s2('club-project',{action:'open'})).feedback,undefined);
    await s2('club-project',{action:'save',step:0,code:'cross-account'},409,null,a.id);
    await s1('relationships',{action:'end',id});
    await t1('state',null,403,a.id);
    await t1('club-feedback',{note:'unbound'},403,a.id);
    await new Promise(resolve=>server.close(resolve));
    await boot();
    assert.match((await guest('club-project',{action:'open'})).code,/anonymous draft/);
    assert.equal((await s1('club-project',{action:'open'})).code,fixed);
    assert.match((await s2('club-project',{action:'open'})).code,/student two draft/);
    await t1('state',null,403,a.id);
    await t2('state',null,200,b.id);
    await s1('session',{action:'logout'});
    await s1('state',null,401);
    assert.ok(y.id);
  } finally {
    await new Promise(resolve=>server.close(resolve));
    await fs.rm(dir,{recursive:true,force:true});
  }
});
