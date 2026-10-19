/**
 * app.js — 2주 -5KG 다이어트 대시보드 메인 애플리케이션 로직
 *
 * 왜 바닐라 JS인가?
 * → Node.js 미설치 환경에서 별도 빌드 없이 index.html만 열면 즉시 작동.
 * → 모든 데이터는 LocalStorage에 저장하여 새로고침 후에도 유지.
 *
 * 주요 기능:
 * 1. 탭 내비게이션 & 라우팅
 * 2. D-Day 타임라인 & 진행률
 * 3. 16:8 간헐적 단식 타이머 (실시간)
 * 4. 14일 체크리스트 (LocalStorage 저장)
 * 5. 일별 헬스장 근력 + 조깅 운동 가이드
 * 6. 일별 식단 가이드
 * 7. 체중 기록 차트 (Canvas 직접 그리기)
 * 8. 수분 트래커 (10잔 = 2.5L)
 * 9. 주간 통계
 */

// ===== 상수 정의 =====
const STORAGE_KEY = 'diet-dashboard-v1';

// 프로젝트 시작일: 사용자가 처음 접속한 날 기준 (변경 가능)
const PROJECT_START_DATE = getOrSetStartDate();

// ===== 유틸리티 함수 =====

/** 프로젝트 시작일을 가져오거나 설정하는 함수 */
function getOrSetStartDate() {
  const saved = localStorage.getItem('diet-start-date');
  if (saved) return new Date(saved);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  localStorage.setItem('diet-start-date', today.toISOString());
  return today;
}

/** 현재 Day 번호 계산 (1~14, 14 이후에도 14 반환) */
function getCurrentDay() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.floor((now - PROJECT_START_DATE) / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.min(14, diff + 1));
}

/** LocalStorage 데이터 로드 */
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : getDefaultData();
  } catch {
    return getDefaultData();
  }
}

/** 기본 데이터 구조 */
function getDefaultData() {
  return {
    weights: {},       // { '1': 72.0, '2': 71.5, ... }
    checklist: {},     // { '1': { 'morning-water': true, ... }, '2': {...} }
    water: {},         // { '1': 5, '2': 8, ... } (잔 수)
  };
}

/** LocalStorage에 데이터 저장 */
function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** 관리자 커스텀 신체 프로필 로드 */
function getActiveProfile() {
  const defaultProfile = {
    title: '2주 -5KG 다이어트',
    height: 175.0,
    startWeight: 72.0,
    targetWeight: 67.0,
    bmr: 1650,
    tdee: 2380,
    targetKcal: 1400,
    deficitKcal: -980,
    fastingStart: 20
  };
  try {
    const raw = localStorage.getItem('diet-profile');
    return raw ? { ...defaultProfile, ...JSON.parse(raw) } : defaultProfile;
  } catch {
    return defaultProfile;
  }
}

/** 관리자 커스텀 체크리스트 템플릿 로드 */
function getActiveChecklistTemplate() {
  try {
    const raw = localStorage.getItem('diet-checklist-template');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return typeof CHECKLIST_TEMPLATE !== 'undefined' ? CHECKLIST_TEMPLATE : [];
}

/** 관리자 커스텀 운동 플랜 데이터 로드 */
function getActiveWorkoutData() {
  try {
    const raw = localStorage.getItem('diet-workout-data');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return typeof WORKOUT_DATA !== 'undefined' ? WORKOUT_DATA : [];
}

/** 관리자 커스텀 식단 가이드 데이터 로드 */
function getActiveDietData() {
  try {
    const raw = localStorage.getItem('diet-diet-data');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return typeof DIET_DATA !== 'undefined' ? DIET_DATA : [];
}

/** 토스트 알림 표시 */
function showToast(message) {
  // 기존 토스트 제거
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  // 약간의 딜레이 후 표시 (트랜지션 트리거)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 2500);
}

/** 모달 표시 */
function showModal(emoji, title, text) {
  const overlay = document.getElementById('modal-overlay');
  document.querySelector('.modal-emoji').textContent = emoji;
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-text').textContent = text;
  overlay.classList.add('show');
}

/** 날짜 포맷 (YYYY.MM.DD 요일) */
function formatDate(date) {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}.${m}.${d} (${days[date.getDay()]})`;
}

// ===== 앱 상태 =====
let appData = loadData();
let currentDay = getCurrentDay();
let selectedChecklistDay = currentDay;
let selectedWorkoutDay = currentDay;
let selectedDietDay = currentDay;

// 단식 타이머 상태
let timerInterval = null;
let timerRunning = false;

// ===== 초기화 =====
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initHeader();
  initDashboard();
  initChecklist();
  initWorkout();
  initDiet();
  initTracker();
  initModal();
  initFastingTimer();
});

// ===== 1. 탭 내비게이션 =====
function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;

      // 활성 탭 전환
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // 활성 패널 전환
      panels.forEach(p => p.classList.remove('active'));
      document.getElementById(`tab-${target}`).classList.add('active');
    });
  });
}

// ===== 2. 헤더 =====
function initHeader() {
  document.getElementById('header-date').textContent = formatDate(new Date());
  updateHeaderProgress();
}

function updateHeaderProgress() {
  // 전체 달성률: 완료된 체크리스트 비율
  let totalItems = 0;
  let totalChecked = 0;
  const template = getActiveChecklistTemplate();

  for (let d = 1; d <= currentDay; d++) {
    const dayChecks = appData.checklist[d] || {};
    template.forEach(group => {
      group.items.forEach(item => {
        totalItems++;
        if (dayChecks[item.id]) totalChecked++;
      });
    });
  }

  const pct = totalItems > 0 ? Math.round((totalChecked / totalItems) * 100) : 0;
  document.getElementById('header-progress').textContent = `${pct}%`;
}

// ===== 3. 대시보드 =====
function initDashboard() {
  renderDdayTimeline();
  renderTodayMissions();
  updateDashboardStats();
  updateCurrentWeight();
}

function renderDdayTimeline() {
  const container = document.getElementById('dday-timeline');
  container.innerHTML = '';

  for (let d = 1; d <= 14; d++) {
    const dot = document.createElement('div');
    dot.className = 'dday-dot';

    // 상태 판별
    if (d < currentDay) {
      dot.classList.add('completed');
    } else if (d === currentDay) {
      dot.classList.add('current');
    }

    dot.innerHTML = `
      <div class="dot-circle">${d < currentDay ? '✓' : d}</div>
      <span class="dot-label">Day${d}</span>
    `;

    // 클릭 시 해당 Day의 체크리스트로 이동
    dot.addEventListener('click', () => {
      selectedChecklistDay = d;
      renderChecklistDay();
      // 체크리스트 탭 활성화
      document.querySelector('.tab-btn[data-tab="checklist"]').click();
    });

    container.appendChild(dot);
  }
}

function renderTodayMissions() {
  const container = document.getElementById('today-missions');
  const dayChecks = appData.checklist[currentDay] || {};
  container.innerHTML = '';

  const workoutList = getActiveWorkoutData();
  const todayWorkout = workoutList[(currentDay - 1) % workoutList.length] || {};
  const workoutTitle = todayWorkout.title || '운동';
  const cardioType = todayWorkout.cardio?.type || '조깅';

  // 오늘의 핵심 미션 5개 요약
  const missions = [
    { emoji: '⏱️', text: '16:8 단식 준수 (12시까지 공복)', id: 'fasting-keep' },
    { emoji: '🏋️', text: `헬스장: ${workoutTitle}`, id: 'workout-gym' },
    { emoji: '🏃', text: `조깅: ${cardioType}`, id: 'workout-jogging' },
    { emoji: '🥗', text: '식단 관리 (1,400kcal 이내)', id: 'lunch' },
    { emoji: '💧', text: '물 2.5L (10잔) 달성', id: 'water-goal' },
  ];

  missions.forEach(m => {
    const div = document.createElement('div');
    div.className = `mission-item ${dayChecks[m.id] ? 'done' : ''}`;
    div.innerHTML = `
      <span class="mission-emoji">${m.emoji}</span>
      <span>${m.text}</span>
      <span class="mission-check">✅</span>
    `;
    container.appendChild(div);
  });

  document.getElementById('today-day-badge').textContent = `Day ${currentDay}`;
}

function updateDashboardStats() {
  // 완료일 수 계산 (체크리스트 80% 이상 완료 시 "완료" 처리)
  let completedDays = 0;
  const template = getActiveChecklistTemplate();
  for (let d = 1; d < currentDay; d++) {
    const dayChecks = appData.checklist[d] || {};
    let total = 0, checked = 0;
    template.forEach(g => g.items.forEach(i => {
      total++;
      if (dayChecks[i.id]) checked++;
    }));
    if (total > 0 && (checked / total) >= 0.8) completedDays++;
  }

  document.getElementById('completed-days').textContent = completedDays;
  document.getElementById('remaining-days').textContent = Math.max(0, 14 - currentDay + 1);

  // D-Day 배지
  const remaining = Math.max(0, 14 - currentDay + 1);
  document.getElementById('dday-badge').textContent = remaining > 0 ? `D-${remaining}` : '완료!';

  // 총 감량
  const profile = getActiveProfile();
  const firstWeight = appData.weights['1'] || profile.startWeight || 72.0;
  const latestWeight = getLatestWeight() || firstWeight;
  const lost = (firstWeight - latestWeight).toFixed(1);
  document.getElementById('total-lost').textContent = parseFloat(lost) > 0 ? lost : '0.0';
}

function getLatestWeight() {
  const profile = getActiveProfile();
  let latest = profile.startWeight || 72.0;
  for (let d = 14; d >= 1; d--) {
    if (appData.weights[d]) {
      latest = appData.weights[d];
      break;
    }
  }
  return latest;
}

function updateCurrentWeight() {
  const profile = getActiveProfile();
  const w = getLatestWeight() || profile.startWeight || 72.0;

  const curEl = document.getElementById('current-weight');
  if (curEl) curEl.textContent = w.toFixed(1);

  const targetEl = document.getElementById('profile-target-weight');
  if (targetEl) targetEl.textContent = (profile.targetWeight || 67.0).toFixed(1);

  const bmrEl = document.getElementById('profile-bmr');
  if (bmrEl) bmrEl.textContent = (profile.bmr || 1650).toLocaleString();

  const tdeeEl = document.getElementById('profile-tdee');
  if (tdeeEl) tdeeEl.textContent = (profile.tdee || 2380).toLocaleString();

  const targetKcalEl = document.getElementById('profile-target-kcal');
  if (targetKcalEl) targetKcalEl.textContent = (profile.targetKcal || 1400).toLocaleString();

  const deficitKcalEl = document.getElementById('profile-deficit-kcal');
  if (deficitKcalEl) deficitKcalEl.textContent = (profile.deficitKcal || -980).toLocaleString();
}

// ===== 4. 16:8 단식 타이머 =====
function initFastingTimer() {
  // SVG 그래디언트 추가
  const svgDefs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgDefs.setAttribute('class', 'svg-defs');
  svgDefs.innerHTML = `
    <defs>
      <linearGradient id="timer-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#10b981" />
        <stop offset="100%" stop-color="#22d3ee" />
      </linearGradient>
    </defs>
  `;
  document.body.appendChild(svgDefs);

  // 타이머 원형 프로그레스에 그래디언트 적용
  const circle = document.getElementById('timer-progress-circle');
  circle.setAttribute('stroke', 'url(#timer-gradient)');

  const btn = document.getElementById('timer-toggle-btn');
  btn.addEventListener('click', toggleFastingTimer);

  // 자동 판별: 현재 시간이 단식/식사 시간인지
  updateFastingDisplay();
}

function toggleFastingTimer() {
  const btn = document.getElementById('timer-toggle-btn');
  if (timerRunning) {
    clearInterval(timerInterval);
    timerRunning = false;
    btn.textContent = '시작';
    btn.classList.remove('active');
  } else {
    timerRunning = true;
    btn.textContent = '정지';
    btn.classList.add('active');
    timerInterval = setInterval(updateFastingDisplay, 1000);
    updateFastingDisplay();
  }
}

function updateFastingDisplay() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();

  // 식사 시간: 12:00 ~ 20:00
  const isFasting = hours < 12 || hours >= 20;
  const phase = document.getElementById('timer-phase');
  const timeDisplay = document.getElementById('timer-time');
  const circle = document.getElementById('timer-progress-circle');
  const circumference = 2 * Math.PI * 90; // r=90

  if (isFasting) {
    // 단식 중
    phase.textContent = '🔴 단식 진행 중';
    phase.style.color = '#ef4444';

    // 남은 단식 시간 계산
    let targetHour = 12;
    let remainSeconds;
    if (hours >= 20) {
      // 20시~24시: 다음 날 12시까지
      remainSeconds = ((24 - hours - 1) * 3600) + ((60 - minutes - 1) * 60) + (60 - seconds) + (12 * 3600);
    } else {
      // 0시~12시
      remainSeconds = ((12 - hours - 1) * 3600) + ((60 - minutes - 1) * 60) + (60 - seconds);
    }

    const totalFastingSeconds = 16 * 3600;
    const elapsed = totalFastingSeconds - remainSeconds;
    const progress = Math.min(1, elapsed / totalFastingSeconds);
    const offset = circumference - (progress * circumference);
    circle.style.strokeDashoffset = offset;

    const rh = Math.floor(remainSeconds / 3600);
    const rm = Math.floor((remainSeconds % 3600) / 60);
    const rs = remainSeconds % 60;
    timeDisplay.textContent = `${String(rh).padStart(2, '0')}:${String(rm).padStart(2, '0')}:${String(rs).padStart(2, '0')}`;

  } else {
    // 식사 시간
    phase.textContent = '🟢 식사 가능 시간';
    phase.style.color = '#10b981';

    // 남은 식사 시간
    const remainSeconds = ((20 - hours - 1) * 3600) + ((60 - minutes - 1) * 60) + (60 - seconds);
    const totalEatingSeconds = 8 * 3600;
    const elapsed = totalEatingSeconds - remainSeconds;
    const progress = Math.min(1, elapsed / totalEatingSeconds);
    const offset = circumference - (progress * circumference);
    circle.style.strokeDashoffset = offset;

    const rh = Math.floor(remainSeconds / 3600);
    const rm = Math.floor((remainSeconds % 3600) / 60);
    const rs = remainSeconds % 60;
    timeDisplay.textContent = `${String(rh).padStart(2, '0')}:${String(rm).padStart(2, '0')}:${String(rs).padStart(2, '0')}`;
  }
}

// ===== 5. 체크리스트 =====
function initChecklist() {
  // Day 선택 버튼
  document.getElementById('prev-day-btn').addEventListener('click', () => {
    if (selectedChecklistDay > 1) {
      selectedChecklistDay--;
      renderChecklistDay();
    }
  });
  document.getElementById('next-day-btn').addEventListener('click', () => {
    if (selectedChecklistDay < 14) {
      selectedChecklistDay++;
      renderChecklistDay();
    }
  });

  renderChecklistDay();
}

function renderChecklistDay() {
  const container = document.getElementById('checklist-items');
  container.innerHTML = '';

  const dayChecks = appData.checklist[selectedChecklistDay] || {};
  document.getElementById('checklist-day-title').textContent = `Day ${selectedChecklistDay}`;

  let totalItems = 0;
  let checkedItems = 0;

  const template = getActiveChecklistTemplate();
  template.forEach(group => {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'checklist-group';

    const headerDiv = document.createElement('div');
    headerDiv.className = 'checklist-group-header';
    headerDiv.textContent = group.group;
    groupDiv.appendChild(headerDiv);

    group.items.forEach(item => {
      totalItems++;
      const isChecked = !!dayChecks[item.id];
      if (isChecked) checkedItems++;

      const itemDiv = document.createElement('div');
      itemDiv.className = `check-item ${isChecked ? 'checked' : ''}`;
      itemDiv.innerHTML = `
        <div class="check-box">${isChecked ? '✓' : ''}</div>
        <span class="check-emoji">${item.emoji}</span>
        <span class="check-text">${item.text}</span>
        <span class="check-time">${item.time}</span>
      `;

      itemDiv.addEventListener('click', () => {
        toggleCheckItem(selectedChecklistDay, item.id);
      });

      groupDiv.appendChild(itemDiv);
    });

    container.appendChild(groupDiv);
  });

  // 진행률 업데이트
  document.getElementById('checklist-done').textContent = checkedItems;
  document.getElementById('checklist-total').textContent = totalItems;
  const pct = totalItems > 0 ? (checkedItems / totalItems) * 100 : 0;
  document.getElementById('checklist-progress-fill').style.width = `${pct}%`;
}

function toggleCheckItem(day, itemId) {
  if (!appData.checklist[day]) appData.checklist[day] = {};
  appData.checklist[day][itemId] = !appData.checklist[day][itemId];
  saveData(appData);
  renderChecklistDay();
  updateHeaderProgress();
  renderTodayMissions();
  updateDashboardStats();

  // 모든 항목 완료 체크
  const template = getActiveChecklistTemplate();
  const dayChecks = appData.checklist[day];
  let total = 0, checked = 0;
  template.forEach(g => g.items.forEach(i => {
    total++;
    if (dayChecks[i.id]) checked++;
  }));

  if (checked === total) {
    showModal('🎉', '미션 올 클리어!', `Day ${day}의 모든 미션을 완수했습니다! 대단해요! 🔥`);
  } else if (appData.checklist[day][itemId]) {
    showToast('✅ 미션 완료!');
  }
}

// ===== 6. 운동 탭 =====
function initWorkout() {
  document.getElementById('workout-prev-day').addEventListener('click', () => {
    if (selectedWorkoutDay > 1) {
      selectedWorkoutDay--;
      renderWorkoutDay();
    }
  });
  document.getElementById('workout-next-day').addEventListener('click', () => {
    if (selectedWorkoutDay < 14) {
      selectedWorkoutDay++;
      renderWorkoutDay();
    }
  });

  renderWorkoutDay();
}

function renderWorkoutDay() {
  const container = document.getElementById('workout-content');
  const workoutList = getActiveWorkoutData();
  const data = workoutList[(selectedWorkoutDay - 1) % workoutList.length] || {};
  document.getElementById('workout-day-title').textContent = `Day ${selectedWorkoutDay}`;

  // 헬스장 운동 리스트 호환 (gym.exercises 또는 exercises)
  const exercises = (data.gym && data.gym.exercises) ? data.gym.exercises : (data.exercises || []);
  const cardio = data.cardio || {};
  const gymLabel = data.gym?.label || '🏋️ 헬스장 근력 (40분)';
  const cardioLabel = cardio.label || '🏃 실외 조깅/유산소';

  container.innerHTML = `
    <!-- 오늘의 테마 -->
    <div class="card" style="text-align: center; padding: 20px;">
      <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">오늘의 포커스: <strong style="color: var(--accent-cyan);">${data.focus || data.target || '전신'}</strong></div>
      <h3 style="font-size: 1.1rem; font-weight: 800; margin-bottom: 8px; background: linear-gradient(135deg, var(--accent-primary), var(--accent-cyan)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">${data.title || '운동 플랜'}</h3>
      <p style="font-size: 0.82rem; color: var(--text-secondary);">${data.theme || data.tip || ''}</p>
    </div>

    <!-- 헬스장 근력 -->
    <div class="workout-card">
      <div class="workout-card-header">
        <span class="workout-icon">🏋️</span>
        <span class="workout-title">${gymLabel}</span>
        <span class="workout-tag">근력</span>
      </div>
      ${exercises.map((ex, i) => `
        <div class="workout-exercise">
          <span class="exercise-num">${i + 1}</span>
          <div class="exercise-info">
            <div class="exercise-name">${ex.name}</div>
            <div class="exercise-detail">${ex.detail || ex.tip || ex.target || ''}</div>
          </div>
          <span class="exercise-sets">${ex.sets}${typeof ex.sets === 'number' ? '세트' : ''}</span>
        </div>
      `).join('')}
    </div>

    <!-- 실외 조깅/러닝 -->
    <div class="workout-card jogging-card">
      <div class="workout-card-header">
        <span class="workout-icon">🏃</span>
        <span class="workout-title">${cardioLabel}</span>
        <span class="workout-tag cardio">유산소</span>
      </div>
      <div class="jogging-stats">
        <div class="jogging-stat">
          <span class="jogging-stat-value">${cardio.distance || cardio.target || '-'}</span>
          <span class="jogging-stat-label">거리/목표</span>
        </div>
        <div class="jogging-stat">
          <span class="jogging-stat-value">${cardio.pace || (cardio.duration ? cardio.duration + '분' : '-')}</span>
          <span class="jogging-stat-label">페이스/시간</span>
        </div>
        <div class="jogging-stat">
          <span class="jogging-stat-value">${cardio.type || '조깅'}</span>
          <span class="jogging-stat-label">타입</span>
        </div>
      </div>
      <div style="padding: 0 16px 16px;">
        <p style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.5;">${cardio.detail || cardio.tip || ''}</p>
      </div>
    </div>

    <!-- 오늘의 팁 -->
    <div class="workout-tip">
      <span class="tip-icon">💡</span>
      <span class="tip-text">${data.tip || '안전하고 즐겁게 완주하세요!'}</span>
    </div>
  `;
}

// ===== 7. 식단 탭 =====
function initDiet() {
  document.getElementById('diet-prev-day').addEventListener('click', () => {
    if (selectedDietDay > 1) {
      selectedDietDay--;
      renderDietDay();
    }
  });
  document.getElementById('diet-next-day').addEventListener('click', () => {
    if (selectedDietDay < 14) {
      selectedDietDay++;
      renderDietDay();
    }
  });

  renderDietDay();
}

function renderDietDay() {
  const container = document.getElementById('diet-content');
  const dietList = getActiveDietData();
  const data = dietList[(selectedDietDay - 1) % dietList.length] || {};
  document.getElementById('diet-day-title').textContent = `Day ${selectedDietDay}`;

  const profile = getActiveProfile();
  const targetKcal = profile.targetKcal || 1400;
  const lunchKcal = data.lunch?.kcal || 0;
  const snackKcal = data.snack?.kcal || 0;
  const dinnerKcal = data.dinner?.kcal || 0;
  const totalKcal = lunchKcal + snackKcal + dinnerKcal;
  const remaining = targetKcal - totalKcal;

  container.innerHTML = `
    <!-- 일일 칼로리 요약 -->
    <div class="card" style="text-align: center;">
      <div style="font-size: 2rem; font-weight: 900; background: linear-gradient(135deg, var(--accent-primary), var(--accent-cyan)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">${totalKcal}</div>
      <div style="font-size: 0.75rem; color: var(--text-muted);">/ 1,400 kcal 목표</div>
      <div style="margin-top: 8px; height: 4px; background: var(--bg-elevated); border-radius: 2px; overflow: hidden;">
        <div style="height: 100%; width: ${Math.min(100, (totalKcal / 1400) * 100)}%; background: linear-gradient(90deg, var(--accent-primary), ${totalKcal > 1400 ? 'var(--color-danger)' : 'var(--accent-cyan)'}); border-radius: 2px; transition: width 0.5s ease;"></div>
      </div>
      <div style="font-size: 0.7rem; color: ${remaining >= 0 ? 'var(--color-success)' : 'var(--color-danger)'}; margin-top: 6px;">${remaining >= 0 ? `여유 ${remaining} kcal 💚` : `${Math.abs(remaining)} kcal 초과 ⚠️`}</div>
    </div>

    <!-- 단식 안내 -->
    <div class="card" style="background: rgba(239, 68, 68, 0.06); border-color: rgba(239, 68, 68, 0.2);">
      <p style="font-size: 0.82rem; color: var(--text-secondary); text-align: center;">
        🚫 <strong style="color: var(--color-danger);">아침 단식</strong> (07:00~12:00)<br>
        <span style="font-size: 0.75rem; color: var(--text-muted);">물, 블랙커피, 무가당 녹차만 허용</span>
      </p>
    </div>

    <!-- 점심 -->
    <div class="diet-card">
      <div class="diet-card-header">
        <span class="diet-icon">🍚</span>
        <span class="diet-title">점심</span>
        <span class="diet-time">12:00</span>
      </div>
      <div class="diet-menu-list">
        <div class="diet-menu-item">${data.lunch.title}</div>
      </div>
      <div class="diet-kcal">
        <span class="diet-kcal-label">예상 칼로리</span>
        <span class="diet-kcal-value">${data.lunch.kcal} kcal</span>
      </div>
      ${data.lunch.tip ? `<div style="padding: 8px 16px; font-size: 0.72rem; color: var(--text-muted);">💡 ${data.lunch.tip}</div>` : ''}
    </div>

    <!-- 간식 -->
    <div class="diet-card">
      <div class="diet-card-header">
        <span class="diet-icon">🥜</span>
        <span class="diet-title">간식</span>
        <span class="diet-time">15:30</span>
      </div>
      <div class="diet-menu-list">
        <div class="diet-menu-item">${data.snack.title}</div>
      </div>
      <div class="diet-kcal">
        <span class="diet-kcal-label">예상 칼로리</span>
        <span class="diet-kcal-value">${data.snack.kcal} kcal</span>
      </div>
    </div>

    <!-- 저녁 -->
    <div class="diet-card">
      <div class="diet-card-header">
        <span class="diet-icon">🥗</span>
        <span class="diet-title">저녁</span>
        <span class="diet-time">19:00</span>
      </div>
      <div class="diet-menu-list">
        <div class="diet-menu-item">${data.dinner.title}</div>
      </div>
      <div class="diet-kcal">
        <span class="diet-kcal-label">예상 칼로리</span>
        <span class="diet-kcal-value">${data.dinner.kcal} kcal</span>
      </div>
      ${data.dinner.tip ? `<div style="padding: 8px 16px; font-size: 0.72rem; color: var(--text-muted);">💡 ${data.dinner.tip}</div>` : ''}
    </div>

    <!-- 주의사항 -->
    <div class="diet-warning">
      <span>⚠️</span>
      <span>20:00 이후 음식 섭취 금지! 국물류 & 라면은 나트륨 부종의 원인. 수분은 물로만 섭취하세요.</span>
    </div>
  `;
}

// ===== 8. 트래커 (체중 차트 + 수분) =====
function initTracker() {
  // 체중 저장 버튼
  document.getElementById('save-weight-btn').addEventListener('click', saveWeight);

  // Enter 키로도 저장
  document.getElementById('weight-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') saveWeight();
  });

  // 수분 트래커 초기화
  initWaterTracker();

  // 차트 그리기
  renderWeightChart();

  // 주간 통계
  renderWeeklyStats();
}

function saveWeight() {
  const input = document.getElementById('weight-input');
  const weight = parseFloat(input.value);

  if (isNaN(weight) || weight < 40 || weight > 200) {
    showToast('⚠️ 올바른 체중을 입력해주세요 (40~200kg)');
    return;
  }

  appData.weights[currentDay] = weight;
  saveData(appData);

  input.value = '';
  showToast(`⚖️ Day ${currentDay} 체중 ${weight}kg 저장 완료!`);

  renderWeightChart();
  updateCurrentWeight();
  updateDashboardStats();
  renderWeeklyStats();
}

// ===== Canvas 체중 차트 =====
function renderWeightChart() {
  const canvas = document.getElementById('weight-chart');
  const ctx = canvas.getContext('2d');

  // 고해상도 디스플레이 대응
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  ctx.scale(dpr, dpr);

  const W = rect.width;
  const H = rect.height;
  const padL = 45, padR = 15, padT = 20, padB = 35;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  // 클리어
  ctx.clearRect(0, 0, W, H);

  // 데이터 수집
  const points = [];
  for (let d = 1; d <= 14; d++) {
    if (appData.weights[d]) {
      points.push({ day: d, weight: appData.weights[d] });
    }
  }

  // 최소/최대 범위 설정
  const minW = points.length > 0 ? Math.min(...points.map(p => p.weight)) - 1 : 66;
  const maxW = points.length > 0 ? Math.max(...points.map(p => p.weight)) + 1 : 73;
  const range = maxW - minW || 1;

  // 목표선(67kg) 그리기
  const goalY = padT + chartH - ((67 - minW) / range) * chartH;
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, goalY);
  ctx.lineTo(W - padR, goalY);
  ctx.stroke();
  ctx.setLineDash([]);

  // 목표 라벨
  ctx.fillStyle = 'rgba(239, 68, 68, 0.6)';
  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('목표 67kg', W - padR, goalY - 4);

  // Y축 눈금
  ctx.fillStyle = '#64748b';
  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'right';
  const ySteps = 5;
  for (let i = 0; i <= ySteps; i++) {
    const val = minW + (range / ySteps) * i;
    const y = padT + chartH - (i / ySteps) * chartH;
    ctx.fillText(val.toFixed(1), padL - 6, y + 3);

    // 그리드 라인
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
  }

  // X축 눈금
  ctx.textAlign = 'center';
  ctx.fillStyle = '#64748b';
  for (let d = 1; d <= 14; d++) {
    const x = padL + ((d - 1) / 13) * chartW;
    ctx.fillText(d, x, H - padB + 16);

    // 세로 그리드
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.05)';
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + chartH);
    ctx.stroke();
  }

  // 데이터 없으면 안내
  if (points.length === 0) {
    ctx.fillStyle = '#64748b';
    ctx.font = '13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('체중을 기록하면 여기에 차트가 표시됩니다', W / 2, H / 2);
    return;
  }

  // 꺾은선 그래프 그리기
  const getX = (d) => padL + ((d - 1) / 13) * chartW;
  const getY = (w) => padT + chartH - ((w - minW) / range) * chartH;

  // 영역 채우기 (그라데이션)
  if (points.length >= 2) {
    const gradient = ctx.createLinearGradient(0, padT, 0, padT + chartH);
    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.2)');
    gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(getX(points[0].day), padT + chartH);
    points.forEach(p => ctx.lineTo(getX(p.day), getY(p.weight)));
    ctx.lineTo(getX(points[points.length - 1].day), padT + chartH);
    ctx.closePath();
    ctx.fill();
  }

  // 라인
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = getX(p.day);
    const y = getY(p.weight);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // 포인트 & 값
  points.forEach(p => {
    const x = getX(p.day);
    const y = getY(p.weight);

    // 글로우
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.3)';
    ctx.fill();

    // 점
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#10b981';
    ctx.fill();
    ctx.strokeStyle = '#0a0f1a';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 값 라벨
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.weight.toFixed(1), x, y - 10);
  });
}

// 창 리사이즈 시 차트 재렌더링
window.addEventListener('resize', () => {
  if (document.getElementById('tab-tracker').classList.contains('active')) {
    renderWeightChart();
  }
});

// ===== 수분 트래커 =====
function initWaterTracker() {
  const container = document.getElementById('water-tracker');
  container.innerHTML = '';

  const currentWater = appData.water[currentDay] || 0;

  for (let i = 1; i <= 10; i++) {
    const drop = document.createElement('div');
    drop.className = `water-drop ${i <= currentWater ? 'filled' : ''}`;
    drop.textContent = '💧';
    drop.addEventListener('click', () => {
      toggleWater(i);
    });
    container.appendChild(drop);
  }

  updateWaterBadge(currentWater);
}

function toggleWater(cup) {
  const currentWater = appData.water[currentDay] || 0;

  if (cup === currentWater) {
    // 같은 잔을 누르면 해제
    appData.water[currentDay] = cup - 1;
  } else {
    // 해당 잔까지 채우기
    appData.water[currentDay] = cup;
  }

  saveData(appData);
  initWaterTracker();

  const newWater = appData.water[currentDay];
  if (newWater >= 10) {
    showToast('💧 수분 2.5L 목표 달성! 완벽해요!');
  }
}

function updateWaterBadge(cups) {
  const liters = (cups * 0.25).toFixed(1);
  document.getElementById('water-badge').textContent = `${liters} / 2.5L`;
}

// ===== 주간 통계 =====
function renderWeeklyStats() {
  const container = document.getElementById('weekly-stats');

  // 평균 체중
  const weights = Object.values(appData.weights);
  const avgWeight = weights.length > 0 ? (weights.reduce((a, b) => a + b, 0) / weights.length).toFixed(1) : '-';

  // 체크리스트 전체 달성률
  let totalItems = 0, totalChecked = 0;
  const template = getActiveChecklistTemplate();
  for (let d = 1; d <= 14; d++) {
    const dayChecks = appData.checklist[d] || {};
    template.forEach(g => g.items.forEach(i => {
      totalItems++;
      if (dayChecks[i.id]) totalChecked++;
    }));
  }
  const totalPct = totalItems > 0 ? Math.round((totalChecked / totalItems) * 100) : 0;

  // 평균 수분
  const waterVals = Object.values(appData.water);
  const avgWater = waterVals.length > 0 ? (waterVals.reduce((a, b) => a + b, 0) / waterVals.length * 0.25).toFixed(1) : '-';

  // 기록 일수
  const recordedDays = Object.keys(appData.weights).length;

  container.innerHTML = `
    <div class="stat-card">
      <span class="stat-card-value">${avgWeight}</span>
      <span class="stat-card-label">평균 체중 (kg)</span>
    </div>
    <div class="stat-card">
      <span class="stat-card-value">${totalPct}%</span>
      <span class="stat-card-label">체크리스트 달성률</span>
    </div>
    <div class="stat-card">
      <span class="stat-card-value">${avgWater}L</span>
      <span class="stat-card-label">평균 수분 섭취</span>
    </div>
    <div class="stat-card">
      <span class="stat-card-value">${recordedDays}일</span>
      <span class="stat-card-label">체중 기록 일수</span>
    </div>
  `;
}

// ===== 9. 모달 =====
function initModal() {
  document.getElementById('modal-close-btn').addEventListener('click', () => {
    document.getElementById('modal-overlay').classList.remove('show');
  });

  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      document.getElementById('modal-overlay').classList.remove('show');
    }
  });
}
