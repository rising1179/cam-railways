import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import path from 'path';
import { fileURLToPath } from 'url';
import expressLayouts from 'express-ejs-layouts';
import { SheetsClient, nowJST, todayKey, requestIdOf } from './sheets.js';
import dotenv from 'dotenv';
import { DateTime } from 'luxon';

dotenv.config();
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(morgan('dev'));
app.use('/public', express.static(path.join(__dirname, 'public')));

// EJS + Layouts
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout'); // views/layout.ejs をデフォルトに

const sheets = new SheetsClient({
  spreadsheetId: process.env.GOOGLE_SHEETS_ID,
  serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
});

const JWT_SECRET = process.env.JWT_SECRET || 'change_me';
const CACHE_TTL = Number(process.env.CACHE_TTL_SECONDS || 45);

// 簡易メモリキャッシュ
const cache = new Map();
const setCache = (k, v) => cache.set(k, { v, exp: Date.now() + CACHE_TTL * 1000 });
const getCache = (k) => {
  const c = cache.get(k);
  if (!c) return null;
  if (Date.now() > c.exp) { cache.delete(k); return null; }
  return c.v;
};

// ユーティリティ読み込み
async function loadDirectories() {
  const [teachers, students, courses, pass, events] = await Promise.all([
    sheets.read('Teacher Directory'),
    sheets.read('Student Directory'),
    sheets.read('Course List'),
    sheets.read('Pass'),
    sheets.read('Event')
  ]);
  return { teachers, students, courses, pass, events };
}

async function loadReceptionAll() {
  const cacheKey = `reception-all-${todayKey()}`;
  const c = getCache(cacheKey);
  if (c) return c;
  const rows = await sheets.read('Reception');
  setCache(cacheKey, rows);
  return rows;
}

function jwtSign(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '60m' });
}

function authMiddleware(role) {
  return (req, res, next) => {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, code: 'NO_TOKEN' });
    try {
      const data = jwt.verify(token, JWT_SECRET);
      if (role && data.role !== role) return res.status(403).json({ ok: false, code: 'FORBIDDEN' });
      req.user = data;
      next();
    } catch (e) {
      return res.status(401).json({ ok: false, code: 'AUTH_FAILED' });
    }
  };
}

// 画面
app.get('/', (req, res) => res.redirect('/student'));
app.get('/student', (req, res) => res.render('student', { title: 'Cam - Student' }));
app.get('/teacher', (req, res) => res.render('teacher', { title: 'Cam - Teacher' }));

// --- 認証 ---
app.post('/api/auth/student/login', async (req, res) => {
  const { student_id, password } = req.body;
  const { students, pass } = await loadDirectories();
  const exists = students.find(s => s.student_id === student_id);
  if (!exists) return res.json({ ok: false, code: 'AUTH_FAILED', message: 'ID/パスが不正' });
  const studentHash = pass?.[0]?.student_pass || '';
  const ok = await argon2.verify(studentHash, password).catch(() => false);
  if (!ok) return res.json({ ok: false, code: 'AUTH_FAILED', message: 'ID/パスが不正' });
  const token = jwtSign({ role: 'student', student_id, student_name: exists.student_name });
  res.json({ ok: true, token, student_name: exists.student_name });
});

app.post('/api/auth/teacher/login', async (req, res) => {
  const { teacher_id, password } = req.body;
  const { teachers, pass } = await loadDirectories();
  const exists = teachers.find(t => t.teacher_id === teacher_id);
  if (!exists) return res.json({ ok: false, code: 'AUTH_FAILED', message: 'ID/パスが不正' });
  const teacherHash = pass?.[0]?.teacher_pass || '';
  const ok = await argon2.verify(teacherHash, password).catch(() => false);
  if (!ok) return res.json({ ok: false, code: 'AUTH_FAILED', message: 'ID/パスが不正' });
  const token = jwtSign({ role: 'teacher', teacher_id, teacher_name: exists.teacher_name });
  res.json({ ok: true, token, teacher_name: exists.teacher_name });
});

// --- マスタ取得 ---
// 生徒向け：自分の履修科目
app.get('/api/subjects', authMiddleware('student'), async (req, res) => {
  const { student_id } = req.user;
  const { courses } = await loadDirectories();
  const list = courses.filter(c => c.student_id === student_id).map(c => c.subject_name);
  res.json({ ok: true, subjects: [...new Set(list)] });
});

// 教員向け：全科目
app.get('/api/subjects/all', authMiddleware('teacher'), async (req, res) => {
  const { courses } = await loadDirectories();
  const list = [...new Set(courses.map(c => c.subject_name).filter(Boolean))];
  res.json({ ok: true, subjects: list });
});

// --- 申請/状態 ---
app.post('/api/reception/apply', authMiddleware('student'), async (req, res) => {
  const { subject_name } = req.body;
  const { student_id, student_name } = req.user;
  const { courses } = await loadDirectories();
  const eligible = courses.some(c => c.student_id === student_id && c.subject_name === subject_name);
  if (!eligible) return res.json({ ok: false, code: 'SUBJECT_FORBIDDEN', message: '履修外の科目です' });

  const request_id = requestIdOf(student_id, subject_name);
  await sheets.append('Reception', {
    request_id,
    subject_name,
    student_id,
    student_name,
    action: 'apply',
    actor: 'student',
    actedAt: nowJST().toISO(),
    comment: '',
    teacher_id: '',
    teacher_name: ''
  });
  cache.delete(`reception-all-${todayKey()}`);
  res.json({ ok: true, request_id });
});

app.get('/api/reception/status', authMiddleware('student'), async (req, res) => {
  const { subject_name } = req.query;
  const { student_id } = req.user;
  const keyPrefix = DateTime.now().setZone('Asia/Tokyo').toFormat('yyyyLLdd') + `-${student_id}-${subject_name}`;
  const rows = await loadReceptionAll();
  const same = rows.filter(r => r.request_id === keyPrefix);
  const latest = same.at(-1);
  let status = '未申請';
  if (latest?.action === 'apply') status = '申請中';
  if (latest?.action === 'approve') status = '申請済';
  if (latest?.action === 'reject') status = '未申請';
  res.json({ ok: true, status, latest });
});

// --- 教員向け ---
app.get('/api/reception/pending', authMiddleware('teacher'), async (req, res) => {
  const { subject_name } = req.query;
  const rows = await loadReceptionAll();
  const today = DateTime.now().setZone('Asia/Tokyo').toFormat('yyyyLLdd');
  const map = new Map();
  for (const r of rows) {
    if (!r.request_id.startsWith(today)) continue;
    if (r.subject_name !== subject_name) continue;
    map.set(r.request_id, r); // 後勝ち
  }
  const pending = [...map.values()].filter(r => r.action === 'apply');
  const { students } = await loadDirectories();
  const byId = Object.fromEntries(students.map(s => [s.student_id, s]));
  const list = pending.map(p => ({
    request_id: p.request_id,
    class: byId[p.student_id]?.class || '',
    student_id: p.student_id,
    student_name: p.student_name,
    appliedAt: p.actedAt
  }));
  res.json({ ok: true, list });
});

app.post('/api/reception/approve', authMiddleware('teacher'), async (req, res) => {
  const { request_id } = req.body;
  const { teacher_id, teacher_name } = req.user;
  await sheets.append('Reception', {
    request_id,
    subject_name: request_id.split('-').slice(2).join('-'),
    student_id: request_id.split('-')[1],
    student_name: '',
    action: 'approve',
    actor: 'teacher',
    actedAt: nowJST().toISO(),
    comment: '',
    teacher_id,
    teacher_name
  });
  cache.delete(`reception-all-${todayKey()}`);
  res.json({ ok: true });
});

app.post('/api/reception/reject', authMiddleware('teacher'), async (req, res) => {
  const { request_id, comment } = req.body;
  const { teacher_id, teacher_name } = req.user;
  await sheets.append('Reception', {
    request_id,
    subject_name: request_id.split('-').slice(2).join('-'),
    student_id: request_id.split('-')[1],
    student_name: '',
    action: 'reject',
    actor: 'teacher',
    actedAt: nowJST().toISO(),
    comment: comment || '',
    teacher_id,
    teacher_name
  });
  cache.delete(`reception-all-${todayKey()}`);
  res.json({ ok: true });
});

app.get('/api/reception/history', authMiddleware('teacher'), async (req, res) => {
  const { subject_name } = req.query;
  const rows = await loadReceptionAll();
  const history = rows
    .filter(r => r.subject_name === subject_name && r.action === 'approve')
    .slice(-200)
    .reverse();
  const { students } = await loadDirectories();
  const byId = Object.fromEntries(students.map(s => [s.student_id, s]));
  const list = history.map(h => ({
    class: byId[h.student_id]?.class || '',
    student_id: h.student_id,
    student_name: byId[h.student_id]?.student_name || h.student_name,
    teacher_name: h.teacher_name,
    actedAt: h.actedAt
  }));
  res.json({ ok: true, list });
});

app.get('/api/student/overview', authMiddleware('teacher'), async (req, res) => {
  const { student_id } = req.query;
  const { students, courses } = await loadDirectories();
  const student = students.find(s => s.student_id === student_id);
  const courseList = courses.filter(c => c.student_id === student_id).map(c => c.subject_name);
  res.json({ ok: true, student, courseList });
});

// ヘルスチェック
app.get('/healthz', (req, res) => res.json({ ok: true, time: nowJST().toISO() }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Cam listening on :${port}`));
