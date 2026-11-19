import { chmodSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const hash = token => createHash('sha256').update(token).digest('hex');
const token = () => randomBytes(32).toString('hex');
const iso = () => new Date().toISOString();
const ttl = 7 * 86400;
const pick = ({ id, email, name, role }) => ({ id, email, name, role });
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const normalize = value => String(value ?? '').trim().toLowerCase();
const cookie = (req, key) => (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(key + '='))?.slice(key.length + 1);

export function createAccounts(file) {
  const db = new DatabaseSync(file);
  chmodSync(file,0o600);
  db.exec(`
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student','teacher')), secret TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      digest TEXT PRIMARY KEY, account TEXT REFERENCES accounts(id), guest TEXT, expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS relationships (
      id TEXT PRIMARY KEY, student TEXT NOT NULL REFERENCES accounts(id),
      teacher TEXT NOT NULL REFERENCES accounts(id), sender TEXT NOT NULL REFERENCES accounts(id),
      status TEXT NOT NULL CHECK(status IN ('pending','active','declined','ended')),
      created TEXT NOT NULL, changed TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS one_teacher ON relationships(student) WHERE status='active';
    CREATE UNIQUE INDEX IF NOT EXISTS one_request ON relationships(student,teacher) WHERE status='pending';
  `);
  const account = id => db.prepare('SELECT * FROM accounts WHERE id=?').get(id);
  const byEmail = email => db.prepare('SELECT * FROM accounts WHERE email=?').get(email);
  const active = (student, teacher) => Boolean(db.prepare("SELECT 1 FROM relationships WHERE student=? AND teacher=? AND status='active'").get(student, teacher));
  const session = req => {
    const raw = cookie(req, 'devlabs_session');
    if (!/^[a-f0-9]{64}$/.test(raw || '')) return null;
    const row = db.prepare('SELECT account,guest FROM sessions WHERE digest=? AND expires>?').get(hash(raw), Date.now());
    if (!row) return null;
    return row.account ? pick(account(row.account)) : { id: row.guest, role: 'guest' };
  };
  function newSession(res, principal) {
    const raw = token();
    db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(hash(raw), principal.role==='guest'?null:principal.id, principal.role==='guest'?principal.id:null, Date.now()+ttl*1000);
    res.setHeader('set-cookie', 'devlabs_session=' + raw + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + ttl);
  }
  function abandon(req) {
    const raw = cookie(req, 'devlabs_session');
    if (raw) db.prepare('DELETE FROM sessions WHERE digest=?').run(hash(raw));
  }
  function list(principal) {
    if (!principal || principal.role === 'guest') return { relationships: [], teachers: [] };
    const rows = db.prepare(`SELECT r.id,r.sender,r.status,r.created,r.changed,r.student,r.teacher,s.name as studentName,t.name as teacherName,s.email as studentEmail
      FROM relationships r JOIN accounts s ON s.id=r.student JOIN accounts t ON t.id=r.teacher
      WHERE r.student=? OR r.teacher=? ORDER BY r.changed DESC LIMIT 100`).all(principal.id, principal.id);
    const teachers = principal.role==='student' ? db.prepare("SELECT id,name FROM accounts WHERE role='teacher' ORDER BY name, id").all() : [];
    return { relationships: rows, teachers };
  }
  async function add(body, role) {
    const email = normalize(body.email), name = String(body.name ?? '').trim(), password = body.password;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !name || name.length > 60 ||
      typeof password !== 'string' || password.length < 10 || password.length > 128) {
      fail(400, '请填写有效邮箱、60 字以内的姓名，以及 10 到 128 字符的密码。');
    }
    const salt = randomBytes(16).toString('hex');
    const secret = salt + ':' + (await derive(password, salt, 64)).toString('hex');
    const id = randomUUID();
    const result = db.prepare('INSERT OR IGNORE INTO accounts VALUES (?,?,?,?,?)').run(id,email,name,role,secret);
    if (!result.changes) fail(409, '此邮箱已注册，请登录。');
    return { id, email, name, role };
  }
  async function authenticate(body) {
    const password = body.password;
    if (typeof password !== 'string' || password.length > 128) fail(401, '邮箱或密码错误。');
    const row = byEmail(normalize(body.email));
    const [salt, encoded] = row?.secret.split(':') || ['0'.repeat(32), '0'.repeat(128)];
    const matched = timingSafeEqual(await derive(password,salt,64),Buffer.from(encoded,'hex'));
    if (!row || !matched) fail(401, '邮箱或密码错误。');
    return pick(row);
  }
  function changeRelation(principal, body) {
    if (!principal || principal.role==='guest') fail(403,'请先注册登录，再建立师生关系。');
    if (body.action === 'request') {
      const other = principal.role==='student' ? account(body.teacherId ?? '') : byEmail(normalize(body.email));
      if (!other || other.role === principal.role) fail(404, principal.role==='teacher'?'找不到该邮箱对应的已注册学生。':'找不到该教师。');
      const student = principal.role==='student'?principal.id:other.id, teacher = principal.role==='teacher'?principal.id:other.id;
      if (db.prepare("SELECT 1 FROM relationships WHERE student=? AND status='active'").get(student)) fail(409,'该学生已有主带教师，请先解除原关系。');
      const at = iso();
      const result = db.prepare("INSERT OR IGNORE INTO relationships VALUES (?,?,?,?,'pending',?,?)").run(randomUUID(),student,teacher,principal.id,at,at);
      if (!result.changes) fail(409,'已经有待确认的申请。');
      return;
    }
    const relation = db.prepare('SELECT * FROM relationships WHERE id=? AND (student=? OR teacher=?)').get(body.id ?? '',principal.id,principal.id);
    if (!relation) fail(404,'找不到此申请。');
    if (body.action === 'accept' && relation.status==='pending' && relation.sender !== principal.id) {
      const at = iso();
      db.exec('BEGIN IMMEDIATE');
      try {
        if (db.prepare("SELECT 1 FROM relationships WHERE student=? AND status='active'").get(relation.student)) fail(409,'该学生已有主带教师。');
        db.prepare("UPDATE relationships SET status='active',changed=? WHERE id=? AND status='pending'").run(at,relation.id);
        db.prepare("UPDATE relationships SET status='declined',changed=? WHERE student=? AND status='pending'").run(at,relation.student);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    } else if ((body.action==='decline' && relation.status==='pending') || (body.action==='end' && relation.status==='active')) {
      db.prepare('UPDATE relationships SET status=?,changed=? WHERE id=?').run(body.action==='end'?'ended':'declined',iso(),relation.id);
    } else fail(409,'当前状态无法执行此操作。');
  }
  const attempts = new Map();
  let total = { until:0, count:0 };
  function throttle(body) {
    const now = Date.now(), key = normalize(body.email).slice(0,254);
    if (now > total.until) { total={until:now+60000,count:0}; attempts.clear(); }
    const count = attempts.get(key) || 0;
    if (total.count>=40 || count>=8) fail(429,'请求太频繁，请一分钟后重试。');
    total.count++; attempts.set(key,count+1);
  }
  return { session, newSession, abandon, list, active, add, authenticate, changeRelation, throttle, close:()=>db.close() };
}
