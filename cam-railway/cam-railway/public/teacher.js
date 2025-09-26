let token = null;
let selectedSubject = null;
let selectedRequestId = null;

const $ = (s) => document.querySelector(s);

document.getElementById('login').addEventListener('click', async () => {
  const teacher_id = document.getElementById('teacher_id').value.trim();
  const password = document.getElementById('teacher_pass').value;
  const r = await fetch('/api/auth/teacher/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ teacher_id, password }) }).then(r=>r.json());
  if (!r.ok) { alert('ログイン失敗'); return; }
  token = r.token;
  document.getElementById('panel').style.display = '';
  await loadSubjects();
  await refresh();
});

async function loadSubjects() {
  const r = await fetch('/api/subjects/all', { headers:{ Authorization:`Bearer ${token}` } }).then(r=>r.json());
  const sel = document.getElementById('subject'); sel.innerHTML = '';
  (r.subjects||[]).forEach(s => { const o=document.createElement('option'); o.value=s; o.textContent=s; sel.appendChild(o); });
  selectedSubject = sel.value;
  sel.addEventListener('change', async ()=>{ selectedSubject = sel.value; await refresh(); });
}

async function refresh() {
  await Promise.all([loadPending(), loadHistory()]);
}

async function loadPending() {
  const r = await fetch(`/api/reception/pending?subject_name=${encodeURIComponent(selectedSubject)}`, { headers:{ Authorization:`Bearer ${token}` } }).then(r=>r.json());
  const tbody = document.querySelector('#pending tbody'); tbody.innerHTML = '';
  (r.list||[]).forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><input type="radio" name="req" value="${row.request_id}"></td>`+
                   `<td>${row.class}</td><td>${row.student_id}</td><td>${row.student_name}</td><td>${row.appliedAt}</td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('input[name="req"]').forEach(radio => {
    radio.addEventListener('change', ()=>{ selectedRequestId = radio.value; });
  });
}

async function loadHistory() {
  const r = await fetch(`/api/reception/history?subject_name=${encodeURIComponent(selectedSubject)}`, { headers:{ Authorization:`Bearer ${token}` } }).then(r=>r.json());
  const tbody = document.querySelector('#history tbody'); tbody.innerHTML = '';
  (r.list||[]).forEach(h => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${h.class}</td><td>${h.student_id}</td><td>${h.student_name}</td><td>${h.teacher_name}</td><td>${h.actedAt}</td>`;
    tbody.appendChild(tr);
  });
}

document.getElementById('approve').addEventListener('click', async () => {
  if (!selectedRequestId) { alert('申請者を選択してください'); return; }
  await fetch('/api/reception/approve', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, body: JSON.stringify({ request_id: selectedRequestId }) });
  selectedRequestId = null; await refresh();
});

document.getElementById('reject').addEventListener('click', async () => {
  if (!selectedRequestId) { alert('申請者を選択してください'); return; }
  const comment = prompt('却下理由（任意）');
  await fetch('/api/reception/reject', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, body: JSON.stringify({ request_id: selectedRequestId, comment }) });
  selectedRequestId = null; await refresh();
});

document.getElementById('detail').addEventListener('click', async () => {
  if (!selectedRequestId) { alert('申請者を選択してください'); return; }
  const student_id = selectedRequestId.split('-')[1];
  const r = await fetch(`/api/student/overview?student_id=${student_id}`, { headers:{ Authorization:`Bearer ${token}` } }).then(r=>r.json());
  document.getElementById('statusPanel').style.display = '';
  document.getElementById('studentInfo').textContent = `${r.student?.student_id || ''} - ${r.student?.student_name || ''}`;
  const ul = document.getElementById('courseList'); ul.innerHTML = '';
  (r.courseList||[]).forEach(c => { const li = document.createElement('li'); li.textContent = c; ul.appendChild(li); });
});

setInterval(()=>{ if (token && selectedSubject) refresh(); }, 5000);
