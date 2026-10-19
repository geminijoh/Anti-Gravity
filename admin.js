/**
 * admin.js — 다이어트 대시보드 관리자 콘솔 스크립트
 * 
 * 주요 기능:
 * 1. 4자리 PIN 인증 (초기 비밀번호: 0000)
 * 2. 6개 관리 탭 제어
 * 3. 신체 프로필 & 감량 목표 CRUD
 * 4. 매일 체크리스트 템플릿 관리
 * 5. 14일 운동 플랜 (헬스장 기구 + 실외 조깅) 일자별 편집
 * 6. 14일 식단 가이드 일자별 편집
 * 7. 체중/수분 실시간 기록 관리 및 보정
 * 8. 비밀번호 변경, JSON 백업/복원, 공장 초기화
 */

// ===== 스토리지 키 규격 =====
const KEYS = {
  ADMIN_PW: 'diet-admin-pw',
  PROFILE: 'diet-profile',
  CHECKLIST_TEMPLATE: 'diet-checklist-template',
  WORKOUT_DATA: 'diet-workout-data',
  DIET_DATA: 'diet-diet-data',
  APP_DATA: 'diet-dashboard-v1',
  START_DATE: 'diet-start-date',
};

// 현재 PIN 입력 버퍼
let currentPin = '';
let currentWorkoutList = [];
let currentDietList = [];
let currentChecklist = [];

// ==========================================
// 1. PIN 인증 로직
// ==========================================

function getAdminPassword() {
  return localStorage.getItem(KEYS.ADMIN_PW) || '0000';
}

function initAuth() {
  const isAuthed = sessionStorage.getItem('diet-admin-auth') === 'true';
  const overlay = document.getElementById('authOverlay');
  if (isAuthed) {
    overlay.classList.add('hidden');
    initAdminConsole();
  } else {
    overlay.classList.remove('hidden');
    currentPin = '';
    updatePinDots();
  }
}

function handlePinInput(num) {
  if (currentPin.length >= 4) return;
  currentPin += num;
  updatePinDots();

  if (currentPin.length === 4) {
    setTimeout(verifyPin, 100);
  }
}

function handlePinBackspace() {
  if (currentPin.length > 0) {
    currentPin = currentPin.slice(0, -1);
    updatePinDots();
  }
}

function handlePinClear() {
  currentPin = '';
  updatePinDots();
}

function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById(`dot-${i}`);
    if (dot) {
      if (i < currentPin.length) dot.classList.add('filled');
      else dot.classList.remove('filled');
    }
  }
}

function verifyPin() {
  const correctPin = getAdminPassword();
  if (currentPin === correctPin) {
    sessionStorage.setItem('diet-admin-auth', 'true');
    document.getElementById('authOverlay').classList.add('hidden');
    showAdminToast('🔓 관리자 인증 성공!');
    initAdminConsole();
  } else {
    showAdminToast('❌ 비밀번호가 올바르지 않습니다.');
    currentPin = '';
    updatePinDots();
  }
}

function handleLogout() {
  sessionStorage.removeItem('diet-admin-auth');
  location.reload();
}

// 키보드 입력 대응
window.addEventListener('keydown', (e) => {
  const overlay = document.getElementById('authOverlay');
  if (!overlay.classList.contains('hidden')) {
    if (e.key >= '0' && e.key <= '9') {
      handlePinInput(e.key);
    } else if (e.key === 'Backspace') {
      handlePinBackspace();
    } else if (e.key === 'Escape') {
      handlePinClear();
    }
  }
});

// ==========================================
// 2. 관리자 콘솔 초기화 & 탭 제어
// ==========================================

function initAdminConsole() {
  setupTabs();
  loadProfileData();
  setupDaySelectors();
  loadWorkoutDataList();
  loadDietDataList();
  loadChecklistTemplateList();
  renderRecordsTable();
}

function setupTabs() {
  const tabs = document.querySelectorAll('.admin-tabs .tab-btn');
  const panels = document.querySelectorAll('.panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetId = tab.getAttribute('data-tab');
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) targetPanel.classList.add('active');
    });
  });
}

function showAdminToast(message) {
  const existing = document.querySelector('.admin-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'admin-toast';
  toast.innerHTML = `<span>⚡</span> <span>${message}</span>`;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'all 0.3s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ==========================================
// 3. TAB 1: 신체 & 목표 관리
// ==========================================

const DEFAULT_PROFILE = {
  title: '2주 -5KG 다이어트',
  height: 175.0,
  startWeight: 72.0,
  targetWeight: 67.0,
  bmr: 1650,
  tdee: 2380,
  targetKcal: 1400,
  deficitKcal: -980,
  fastingStart: 20,
  notes: '남성 / 30대 / 오전 사무직 + 오후 외근 맞춤 플랜'
};

function getActiveProfile() {
  try {
    const raw = localStorage.getItem(KEYS.PROFILE);
    return raw ? { ...DEFAULT_PROFILE, ...JSON.parse(raw) } : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

function loadProfileData() {
  const p = getActiveProfile();
  document.getElementById('prof-title').value = p.title || '';
  document.getElementById('prof-height').value = p.height || 175;
  document.getElementById('prof-start-weight').value = p.startWeight || 72.0;
  document.getElementById('prof-target-weight').value = p.targetWeight || 67.0;
  document.getElementById('prof-bmr').value = p.bmr || 1650;
  document.getElementById('prof-tdee').value = p.tdee || 2380;
  document.getElementById('prof-target-kcal').value = p.targetKcal || 1400;
  document.getElementById('prof-deficit-kcal').value = p.deficitKcal || -980;
  document.getElementById('prof-fasting-start').value = p.fastingStart !== undefined ? p.fastingStart : 20;
  document.getElementById('prof-notes').value = p.notes || '';

  // 시작일
  const startDate = localStorage.getItem(KEYS.START_DATE);
  if (startDate) {
    document.getElementById('prof-start-date').value = startDate.split('T')[0];
  } else {
    document.getElementById('prof-start-date').value = new Date().toISOString().split('T')[0];
  }
}

function saveProfile(e) {
  e.preventDefault();
  const profile = {
    title: document.getElementById('prof-title').value,
    height: parseFloat(document.getElementById('prof-height').value) || 175,
    startWeight: parseFloat(document.getElementById('prof-start-weight').value) || 72,
    targetWeight: parseFloat(document.getElementById('prof-target-weight').value) || 67,
    bmr: parseInt(document.getElementById('prof-bmr').value) || 1650,
    tdee: parseInt(document.getElementById('prof-tdee').value) || 2380,
    targetKcal: parseInt(document.getElementById('prof-target-kcal').value) || 1400,
    deficitKcal: parseInt(document.getElementById('prof-deficit-kcal').value) || -980,
    fastingStart: parseInt(document.getElementById('prof-fasting-start').value) || 20,
    notes: document.getElementById('prof-notes').value,
  };

  localStorage.setItem(KEYS.PROFILE, JSON.stringify(profile));

  // 시작일 저장
  const inputDate = document.getElementById('prof-start-date').value;
  if (inputDate) {
    const d = new Date(inputDate);
    d.setHours(0, 0, 0, 0);
    localStorage.setItem(KEYS.START_DATE, d.toISOString());
  }

  showAdminToast('✅ 신체 & 목표 설정이 저장되었습니다!');
}

// ==========================================
// 4. TAB 2: 매일 체크리스트 템플릿 관리
// ==========================================

function loadChecklistTemplateList() {
  try {
    const raw = localStorage.getItem(KEYS.CHECKLIST_TEMPLATE);
    currentChecklist = raw ? JSON.parse(raw) : (typeof CHECKLIST_TEMPLATE !== 'undefined' ? JSON.parse(JSON.stringify(CHECKLIST_TEMPLATE)) : []);
  } catch {
    currentChecklist = typeof CHECKLIST_TEMPLATE !== 'undefined' ? JSON.parse(JSON.stringify(CHECKLIST_TEMPLATE)) : [];
  }
  renderChecklistEditor();
}

function renderChecklistEditor() {
  const container = document.getElementById('checklistEditorContainer');
  container.innerHTML = '';

  currentChecklist.forEach((grp, gIdx) => {
    const grpEl = document.createElement('div');
    grpEl.className = 'item-card';
    grpEl.innerHTML = `
      <div class="item-header">
        <input type="text" value="${escapeHtml(grp.group)}" onchange="updateGroupTitle(${gIdx}, this.value)" style="font-weight:700; width:60%;" />
        <div>
          <button type="button" class="btn btn-secondary btn-sm" onclick="addChecklistItem(${gIdx})">+ 항목 추가</button>
          <button type="button" class="btn btn-danger btn-sm" onclick="removeChecklistGroup(${gIdx})">그룹 삭제</button>
        </div>
      </div>
      <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
        ${grp.items.map((it, iIdx) => `
          <div style="display:flex; gap:8px; align-items:center;">
            <input type="text" value="${escapeHtml(it.emoji)}" onchange="updateChecklistItem(${gIdx}, ${iIdx}, 'emoji', this.value)" style="width:50px; text-align:center;" />
            <input type="text" value="${escapeHtml(it.text)}" onchange="updateChecklistItem(${gIdx}, ${iIdx}, 'text', this.value)" style="flex:1;" />
            <input type="text" value="${escapeHtml(it.time)}" onchange="updateChecklistItem(${gIdx}, ${iIdx}, 'time', this.value)" style="width:90px;" placeholder="시간" />
            <button type="button" class="btn btn-danger btn-sm" onclick="removeChecklistItem(${gIdx}, ${iIdx})">✕</button>
          </div>
        `).join('')}
      </div>
    `;
    container.appendChild(grpEl);
  });
}

function updateGroupTitle(gIdx, title) {
  if (currentChecklist[gIdx]) currentChecklist[gIdx].group = title;
}

function updateChecklistItem(gIdx, iIdx, field, val) {
  if (currentChecklist[gIdx] && currentChecklist[gIdx].items[iIdx]) {
    currentChecklist[gIdx].items[iIdx][field] = val;
  }
}

function addChecklistItem(gIdx) {
  if (!currentChecklist[gIdx]) return;
  const newId = 'custom-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
  currentChecklist[gIdx].items.push({
    id: newId,
    emoji: '✨',
    text: '새로운 실천 미션',
    time: '수시'
  });
  renderChecklistEditor();
}

function removeChecklistItem(gIdx, iIdx) {
  if (currentChecklist[gIdx]) {
    currentChecklist[gIdx].items.splice(iIdx, 1);
    renderChecklistEditor();
  }
}

function addNewChecklistGroup() {
  currentChecklist.push({
    group: '⭐ 새로운 루틴 그룹',
    items: [
      { id: 'custom-' + Date.now(), emoji: '📌', text: '새 미션 작성하기', time: '하루 중' }
    ]
  });
  renderChecklistEditor();
}

function removeChecklistGroup(gIdx) {
  if (confirm('이 그룹과 하위 미션들을 모두 삭제하시겠습니까?')) {
    currentChecklist.splice(gIdx, 1);
    renderChecklistEditor();
  }
}

function saveChecklistTemplate() {
  localStorage.setItem(KEYS.CHECKLIST_TEMPLATE, JSON.stringify(currentChecklist));
  showAdminToast('✅ 체크리스트 템플릿이 저장되었습니다!');
}

// ==========================================
// 5. TAB 3: 14일 운동 플랜 관리
// ==========================================

function setupDaySelectors() {
  const wSel = document.getElementById('workoutDaySelect');
  const dSel = document.getElementById('dietDaySelect');
  wSel.innerHTML = '';
  dSel.innerHTML = '';

  for (let i = 1; i <= 14; i++) {
    const optW = document.createElement('option');
    optW.value = i;
    optW.textContent = `Day ${i} (${i <= 7 ? '1주차' : '2주차'})`;
    wSel.appendChild(optW);

    const optD = document.createElement('option');
    optD.value = i;
    optD.textContent = `Day ${i} (${i <= 7 ? '1주차' : '2주차'})`;
    dSel.appendChild(optD);
  }
}

function loadWorkoutDataList() {
  try {
    const raw = localStorage.getItem(KEYS.WORKOUT_DATA);
    currentWorkoutList = raw ? JSON.parse(raw) : (typeof WORKOUT_DATA !== 'undefined' ? JSON.parse(JSON.stringify(WORKOUT_DATA)) : []);
  } catch {
    currentWorkoutList = typeof WORKOUT_DATA !== 'undefined' ? JSON.parse(JSON.stringify(WORKOUT_DATA)) : [];
  }
  loadWorkoutForSelectedDay();
}

function loadWorkoutForSelectedDay() {
  const day = parseInt(document.getElementById('workoutDaySelect').value) || 1;
  const item = currentWorkoutList.find(w => w.day === day) || {
    day: day,
    title: `Day ${day} 운동`,
    target: '전신',
    duration: '60분',
    tip: '',
    exercises: [],
    cardio: { type: '조깅', duration: 25, target: '3km', tip: '' }
  };

  document.getElementById('w-title').value = item.title || '';
  document.getElementById('w-target').value = item.target || '';
  document.getElementById('w-duration').value = item.duration || '';
  document.getElementById('w-tip').value = item.tip || '';

  // cardio
  const cardio = item.cardio || {};
  document.getElementById('w-cardio-type').value = cardio.type || '조깅';
  document.getElementById('w-cardio-duration').value = cardio.duration || 20;
  document.getElementById('w-cardio-target').value = cardio.target || cardio.distance || '';
  document.getElementById('w-cardio-tip').value = cardio.tip || cardio.detail || '';

  // 헬스장 근력 운동 리스트 호환 로드
  const rawExercises = (item.gym && Array.isArray(item.gym.exercises)) ? item.gym.exercises : (item.exercises || []);
  const normalizedExercises = rawExercises.map(e => ({
    name: e.name || '',
    target: e.target || '',
    sets: typeof e.sets === 'number' ? e.sets : (parseInt(e.sets) || 3),
    reps: e.reps || (typeof e.sets === 'string' && e.sets.includes('×') ? e.sets.split('×')[1] + '회' : '12회'),
    tip: e.tip || e.detail || ''
  }));
  renderGymExercises(normalizedExercises);
}

function renderGymExercises(exercises) {
  const container = document.getElementById('gymExercisesContainer');
  container.innerHTML = '';

  exercises.forEach((ex, idx) => {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `
      <div class="item-header">
        <span class="item-badge">#${idx + 1} ${escapeHtml(ex.target || '부위')}</span>
        <button type="button" class="btn btn-danger btn-sm" onclick="removeGymExercise(${idx})">삭제</button>
      </div>
      <div class="form-grid">
        <div class="form-group full-width">
          <label>운동명 / 머신명</label>
          <input type="text" class="ex-name" value="${escapeHtml(ex.name || '')}" required />
        </div>
        <div class="form-group">
          <label>세부 타겟</label>
          <input type="text" class="ex-target" value="${escapeHtml(ex.target || '')}" />
        </div>
        <div class="form-group">
          <label>세트수</label>
          <input type="number" class="ex-sets" value="${ex.sets || 3}" />
        </div>
        <div class="form-group">
          <label>반복 횟수</label>
          <input type="text" class="ex-reps" value="${escapeHtml(ex.reps || '12-15회')}" />
        </div>
        <div class="form-group full-width">
          <label>자세 팁 / 기구 세팅</label>
          <input type="text" class="ex-tip" value="${escapeHtml(ex.tip || '')}" />
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function addGymExercise() {
  const container = document.getElementById('gymExercisesContainer');
  const count = container.children.length;
  const card = document.createElement('div');
  card.className = 'item-card';
  card.innerHTML = `
    <div class="item-header">
      <span class="item-badge">#${count + 1} 신규 종목</span>
      <button type="button" class="btn btn-danger btn-sm" onclick="this.closest('.item-card').remove()">삭제</button>
    </div>
    <div class="form-grid">
      <div class="form-group full-width">
        <label>운동명 / 머신명</label>
        <input type="text" class="ex-name" placeholder="예: 시티드 체스트 프레스 머신" required />
      </div>
      <div class="form-group">
        <label>세부 타겟</label>
        <input type="text" class="ex-target" placeholder="예: 대흉근 중앙" />
      </div>
      <div class="form-group">
        <label>세트수</label>
        <input type="number" class="ex-sets" value="3" />
      </div>
      <div class="form-group">
        <label>반복 횟수</label>
        <input type="text" class="ex-reps" value="12-15회" />
      </div>
      <div class="form-group full-width">
        <label>자세 팁 / 기구 세팅</label>
        <input type="text" class="ex-tip" placeholder="손잡이 높이는 젖꼭지 라인에 맞추기" />
      </div>
    </div>
  `;
  container.appendChild(card);
}

function removeGymExercise(idx) {
  const day = parseInt(document.getElementById('workoutDaySelect').value) || 1;
  const item = currentWorkoutList.find(w => w.day === day);
  if (item && item.exercises) {
    item.exercises.splice(idx, 1);
    renderGymExercises(item.exercises);
  }
}

function saveWorkoutForSelectedDay(e) {
  e.preventDefault();
  const day = parseInt(document.getElementById('workoutDaySelect').value) || 1;

  // 헬스장 운동 요소 수집
  const exCards = document.querySelectorAll('#gymExercisesContainer .item-card');
  const exercises = [];
  exCards.forEach(c => {
    exercises.push({
      name: c.querySelector('.ex-name')?.value || '',
      target: c.querySelector('.ex-target')?.value || '',
      sets: parseInt(c.querySelector('.ex-sets')?.value) || 3,
      reps: c.querySelector('.ex-reps')?.value || '12-15회',
      tip: c.querySelector('.ex-tip')?.value || '',
    });
  });

  const gymExercises = exercises.map(e => ({
    name: e.name,
    sets: `${e.sets}×${e.reps || '12회'}`,
    detail: e.tip || e.target || '자세에 집중'
  }));

  const updatedItem = {
    day: day,
    title: document.getElementById('w-title').value,
    focus: document.getElementById('w-target').value || '전신',
    target: document.getElementById('w-target').value,
    theme: document.getElementById('w-tip').value || '매일 성장하는 근력 플랜',
    duration: document.getElementById('w-duration').value,
    tip: document.getElementById('w-tip').value,
    gym: {
      label: '🏋️ 헬스장 근력',
      exercises: gymExercises
    },
    exercises: exercises,
    cardio: {
      label: '🏃 실외 조깅/유산소',
      type: document.getElementById('w-cardio-type').value,
      duration: parseInt(document.getElementById('w-cardio-duration').value) || 20,
      distance: document.getElementById('w-cardio-target').value,
      target: document.getElementById('w-cardio-target').value,
      pace: '페이스 자율',
      detail: document.getElementById('w-cardio-tip').value,
      tip: document.getElementById('w-cardio-tip').value,
    }
  };

  const idx = currentWorkoutList.findIndex(w => w.day === day);
  if (idx >= 0) currentWorkoutList[idx] = updatedItem;
  else currentWorkoutList.push(updatedItem);

  // 저장
  localStorage.setItem(KEYS.WORKOUT_DATA, JSON.stringify(currentWorkoutList));
  showAdminToast(`✅ Day ${day} 운동 플랜이 저장되었습니다!`);
}

// ==========================================
// 6. TAB 4: 14일 식단 플랜 관리
// ==========================================

function loadDietDataList() {
  try {
    const raw = localStorage.getItem(KEYS.DIET_DATA);
    currentDietList = raw ? JSON.parse(raw) : (typeof DIET_DATA !== 'undefined' ? JSON.parse(JSON.stringify(DIET_DATA)) : []);
  } catch {
    currentDietList = typeof DIET_DATA !== 'undefined' ? JSON.parse(JSON.stringify(DIET_DATA)) : [];
  }
  loadDietForSelectedDay();
}

function loadDietForSelectedDay() {
  const day = parseInt(document.getElementById('dietDaySelect').value) || 1;
  const item = currentDietList.find(d => d.day === day) || {
    day: day,
    lunch: { title: '점심 식사', kcal: 500, tip: '' },
    snack: { title: '간식', kcal: 100 },
    dinner: { title: '저녁 식사', kcal: 300, tip: '' }
  };

  // 점심
  document.getElementById('d-lunch-title').value = item.lunch?.title || '';
  document.getElementById('d-lunch-kcal').value = item.lunch?.kcal || 500;
  document.getElementById('d-lunch-tip').value = item.lunch?.tip || '';

  // 간식
  document.getElementById('d-snack-title').value = item.snack?.title || '';
  document.getElementById('d-snack-kcal').value = item.snack?.kcal || 100;

  // 저녁
  document.getElementById('d-dinner-title').value = item.dinner?.title || '';
  document.getElementById('d-dinner-kcal').value = item.dinner?.kcal || 300;
  document.getElementById('d-dinner-tip').value = item.dinner?.tip || '';
}

function saveDietForSelectedDay(e) {
  e.preventDefault();
  const day = parseInt(document.getElementById('dietDaySelect').value) || 1;

  const updatedItem = {
    day: day,
    lunch: {
      title: document.getElementById('d-lunch-title').value,
      kcal: parseInt(document.getElementById('d-lunch-kcal').value) || 0,
      tip: document.getElementById('d-lunch-tip').value,
    },
    snack: {
      title: document.getElementById('d-snack-title').value,
      kcal: parseInt(document.getElementById('d-snack-kcal').value) || 0,
    },
    dinner: {
      title: document.getElementById('d-dinner-title').value,
      kcal: parseInt(document.getElementById('d-dinner-kcal').value) || 0,
      tip: document.getElementById('d-dinner-tip').value,
    }
  };

  const idx = currentDietList.findIndex(d => d.day === day);
  if (idx >= 0) currentDietList[idx] = updatedItem;
  else currentDietList.push(updatedItem);

  localStorage.setItem(KEYS.DIET_DATA, JSON.stringify(currentDietList));
  showAdminToast(`✅ Day ${day} 식단 가이드가 저장되었습니다!`);
}

// ==========================================
// 7. TAB 5: 체중 & 수분 실시간 기록 관리
// ==========================================

function getAppData() {
  try {
    const raw = localStorage.getItem(KEYS.APP_DATA);
    return raw ? JSON.parse(raw) : { weights: {}, checklist: {}, water: {} };
  } catch {
    return { weights: {}, checklist: {}, water: {} };
  }
}

function renderRecordsTable() {
  const tbody = document.getElementById('recordsTableBody');
  tbody.innerHTML = '';

  const appData = getAppData();
  const startDateStr = localStorage.getItem(KEYS.START_DATE);
  const startDate = startDateStr ? new Date(startDateStr) : new Date();

  for (let d = 1; d <= 14; d++) {
    const dayDate = new Date(startDate);
    dayDate.setDate(dayDate.getDate() + (d - 1));
    const dateFormatted = `${dayDate.getMonth() + 1}/${dayDate.getDate()} (${['일','월','화','수','목','금','토'][dayDate.getDay()]})`;

    const curWeight = appData.weights && appData.weights[d] !== undefined ? appData.weights[d] : '';
    const curWater = appData.water && appData.water[d] !== undefined ? appData.water[d] : 0;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>Day ${d}</strong></td>
      <td style="color:var(--text-muted);">${dateFormatted}</td>
      <td>
        <input type="number" step="0.1" class="record-weight" data-day="${d}" value="${curWeight}" placeholder="미입력" style="width:90px; padding:6px 8px;" /> kg
      </td>
      <td>
        <input type="number" min="0" max="20" class="record-water" data-day="${d}" value="${curWater}" style="width:70px; padding:6px 8px;" /> 잔 (${(curWater * 0.25).toFixed(1)}L)
      </td>
      <td>
        <button type="button" class="btn btn-secondary btn-sm" onclick="clearDayRecord(${d})">초기화</button>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

function saveAllRecords() {
  const appData = getAppData();
  if (!appData.weights) appData.weights = {};
  if (!appData.water) appData.water = {};

  const weightInputs = document.querySelectorAll('.record-weight');
  weightInputs.forEach(inp => {
    const d = inp.getAttribute('data-day');
    const val = inp.value.trim();
    if (val !== '') {
      appData.weights[d] = parseFloat(val);
    } else {
      delete appData.weights[d];
    }
  });

  const waterInputs = document.querySelectorAll('.record-water');
  waterInputs.forEach(inp => {
    const d = inp.getAttribute('data-day');
    const val = inp.value.trim();
    if (val !== '') {
      appData.water[d] = parseInt(val) || 0;
    }
  });

  localStorage.setItem(KEYS.APP_DATA, JSON.stringify(appData));
  showAdminToast('✅ 전체 체중 & 수분 기록이 저장되었습니다!');
  renderRecordsTable();
}

function clearDayRecord(d) {
  if (confirm(`Day ${d}의 체중 및 수분 기록을 지우시겠습니까?`)) {
    const appData = getAppData();
    if (appData.weights) delete appData.weights[d];
    if (appData.water) delete appData.water[d];
    localStorage.setItem(KEYS.APP_DATA, JSON.stringify(appData));
    showAdminToast(`Day ${d} 기록 초기화 완료`);
    renderRecordsTable();
  }
}

// ==========================================
// 8. TAB 6: 시스템, 백업, 복원, 초기화
// ==========================================

function changeAdminPassword(e) {
  e.preventDefault();
  const p1 = document.getElementById('newPin').value;
  const p2 = document.getElementById('confirmPin').value;

  if (p1.length !== 4 || !/^\d{4}$/.test(p1)) {
    alert('비밀번호는 4자리 숫자로 입력해주세요.');
    return;
  }

  if (p1 !== p2) {
    alert('비밀번호가 일치하지 않습니다.');
    return;
  }

  localStorage.setItem(KEYS.ADMIN_PW, p1);
  showAdminToast('🔐 관리자 비밀번호가 성공적으로 변경되었습니다!');
  document.getElementById('pwChangeForm').reset();
}

function exportDataToJson() {
  const fullBackup = {
    exportedAt: new Date().toISOString(),
    profile: getActiveProfile(),
    checklistTemplate: currentChecklist,
    workoutData: currentWorkoutList,
    dietData: currentDietList,
    appData: getAppData(),
    startDate: localStorage.getItem(KEYS.START_DATE)
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(fullBackup, null, 2));
  const dlAnchor = document.createElement('a');
  dlAnchor.setAttribute("href", dataStr);
  dlAnchor.setAttribute("download", `diet-dashboard-backup-${new Date().toISOString().slice(0,10)}.json`);
  document.body.appendChild(dlAnchor);
  dlAnchor.click();
  dlAnchor.remove();

  showAdminToast('📥 백업 파일 다운로드가 시작되었습니다.');
}

function importDataFromJson(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const data = JSON.parse(evt.target.result);
      if (data.profile) localStorage.setItem(KEYS.PROFILE, JSON.stringify(data.profile));
      if (data.checklistTemplate) localStorage.setItem(KEYS.CHECKLIST_TEMPLATE, JSON.stringify(data.checklistTemplate));
      if (data.workoutData) localStorage.setItem(KEYS.WORKOUT_DATA, JSON.stringify(data.workoutData));
      if (data.dietData) localStorage.setItem(KEYS.DIET_DATA, JSON.stringify(data.dietData));
      if (data.appData) localStorage.setItem(KEYS.APP_DATA, JSON.stringify(data.appData));
      if (data.startDate) localStorage.setItem(KEYS.START_DATE, data.startDate);

      showAdminToast('📤 데이터 복원이 완료되었습니다!');
      setTimeout(() => location.reload(), 1000);
    } catch (err) {
      alert('올바른 백업 JSON 파일이 아닙니다.');
    }
  };
  reader.readAsText(file);
}

function resetToFactoryDefault() {
  if (confirm('정말로 모든 관리자 수정 데이터와 사용자 기록을 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
    localStorage.removeItem(KEYS.PROFILE);
    localStorage.removeItem(KEYS.CHECKLIST_TEMPLATE);
    localStorage.removeItem(KEYS.WORKOUT_DATA);
    localStorage.removeItem(KEYS.DIET_DATA);
    localStorage.removeItem(KEYS.APP_DATA);
    localStorage.removeItem(KEYS.START_DATE);
    // 비밀번호는 유지하거나 0000으로 초기화
    localStorage.removeItem(KEYS.ADMIN_PW);

    showAdminToast('🔄 초기 상태로 리셋되었습니다.');
    setTimeout(() => location.reload(), 1000);
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// 최초 진입 시 인증 상태 확인
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
});
