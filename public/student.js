let token = null;
let currentSubject = null;

const $ = (s) => document.querySelector(s);

document.getElementById('login').addEventListener('click', async () => {
  const student_id = document.getElementById('student_id').value.trim();
  const password = document.getElementById('student_pass').value;
  const r = await fetch('/api/auth/student/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ student_id, password }) }).then(r=>r.json());
  if (!r.ok) { alert('ログイン失敗'); return; }
  token = r.token;
  document.getElementById('app').style.display = '';
  loadSubjects();
});

async function loadSubjects() {
  const r = await fetch('/api/subjects', { headers:{ Authorization:`Bearer ${token}` } }).then(r=>r.json());
  const sel = document.getElementById('subject'); sel.innerHTML = '';
  (r.subjects||[]).forEach(s => { const o=document.createElement('option'); o.value=s; o.textContent=s; sel.appendChild(o); });
  currentSubject = sel.value;
  sel.addEventListener('change', ()=>{ currentSubject = sel.value; });
  pollStatus();
}

document.getElementById('apply').addEventListener('click', async () => {
  if (!currentSubject) return;
  await fetch('/api/reception/apply', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, body: JSON.stringify({ subject_name: currentSubject }) });
  await pollStatus();
});

async function pollStatus() {
  if (!currentSubject) return;
  const r = await fetch(`/api/reception/status?subject_name=${encodeURIComponent(currentSubject)}`, { headers:{ Authorization:`Bearer ${token}` } }).then(r=>r.json());
  document.getElementById('status').textContent = `状態: ${r.status}`;
}

setInterval(pollStatus, 5000);
