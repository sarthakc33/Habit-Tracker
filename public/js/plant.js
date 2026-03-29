// =============================================
// PLANT JS – forest and gamified timer
// =============================================

let timerInterval = null;
let durationSeconds = 0;
let remainingSeconds = 0;
let isPlanting = false;
let forestData = [];
let chartInstance = null;

let currentTimeline = 'year';

async function loadForest() {
  try {
    const res = await authFetch(BASE + '/plant');
    if (res.ok) {
      forestData = await res.json();
    }
  } catch (e) {
    console.error('Failed to load forest', e);
  }
}

function switchView(view) {
  document.getElementById('btn-timer').classList.toggle('active', view === 'timer');
  document.getElementById('btn-overview').classList.toggle('active', view === 'overview');
  document.getElementById('view-timer').style.display = view === 'timer' ? 'block' : 'none';
  document.getElementById('view-overview').style.display = view === 'overview' ? 'block' : 'none';

  if (view === 'overview') {
    setTimeline(currentTimeline);
  }
}

function formatTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function updateTimerUI() {
  document.getElementById('plant-timer-display').textContent = formatTime(remainingSeconds);
  if (durationSeconds > 0) {
    const pct = ((durationSeconds - remainingSeconds) / durationSeconds) * 100;
    // Update conic gradient percentage using CSS variable
    document.getElementById('timer-circle').style.setProperty('--p', `${pct}%`);
    // Scale the tree from 0.1 to 1.0 based on progress
    const scale = 0.1 + (0.9 * (pct / 100));
    document.getElementById('planted-tree').style.transform = `scale(${scale})`;
  }
}

function startPlanting() {
  const mins = parseInt(document.getElementById('timer-duration').value, 10);
  durationSeconds = mins * 60;
  remainingSeconds = durationSeconds;
  isPlanting = true;
  
  document.getElementById('btn-plant').style.display = 'none';
  document.getElementById('timer-duration').style.display = 'none';
  document.getElementById('btn-giveup').style.display = 'inline-block';
  document.getElementById('timer-circle').style.setProperty('--p', '0%');
  document.getElementById('planted-tree').style.transform = 'scale(0.1)';
  
  updateTimerUI();

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    remainingSeconds--;
    updateTimerUI();
    if (remainingSeconds <= 0) {
      finishPlanting();
    }
  }, 1000);
}

function giveUp() {
  if (confirm("Are you sure you want to give up? Your tree will wither.")) {
    clearInterval(timerInterval);
    isPlanting = false;
    resetPlantUI();
    document.getElementById('planted-tree').style.transform = 'scale(0) rotate(90deg)';
    if(typeof showToast === 'function') showToast('Given up. The tree withered.', 'warning');
  }
}

async function finishPlanting() {
  clearInterval(timerInterval);
  isPlanting = false;
  resetPlantUI();
  document.getElementById('planted-tree').style.transform = 'scale(1.1)'; // flourish
  setTimeout(() => { document.getElementById('planted-tree').style.transform = 'scale(0)'; }, 2000);
  if(typeof showToast === 'function') showToast('🎉 You grew a tree!', 'success');

  try {
    const durationMins = parseInt(document.getElementById('timer-duration').value, 10);
    const res = await authFetch(BASE + '/plant', {
      method: 'POST',
      body: JSON.stringify({ duration: durationMins, score: 'Basic Tree' })
    });
    if (res.ok) {
      const newPlant = await res.json();
      forestData.push(newPlant);
      if (document.getElementById('view-overview').style.display === 'block') {
         setTimeline(currentTimeline);
      }
    }
  } catch(e) { console.error('Error saving plant', e); }
}

function resetPlantUI() {
  document.getElementById('btn-plant').style.display = 'inline-block';
  document.getElementById('timer-duration').style.display = 'inline-block';
  document.getElementById('btn-giveup').style.display = 'none';
  document.getElementById('timer-circle').style.setProperty('--p', '0%');
  document.getElementById('plant-timer-display').textContent = formatTime(parseInt(document.getElementById('timer-duration').value, 10) * 60);
}

// Ensure the initial display correctly shows the selected duration
document.getElementById('timer-duration')?.addEventListener('change', (e) => {
  if (!isPlanting) {
    document.getElementById('plant-timer-display').textContent = formatTime(parseInt(e.target.value, 10) * 60);
  }
});


function setTimeline(type) {
  currentTimeline = type;
  document.querySelectorAll('.timeline-tab').forEach(b => b.classList.toggle('active', b.dataset.timeline === type));
  
  const now = new Date();
  let filtered = [];
  let subtitle = '';

  if (type === 'day') {
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    filtered = forestData.filter(p => new Date(p.createdAt).getTime() >= dayStart);
    subtitle = "Today";
  } else if (type === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    filtered = forestData.filter(p => new Date(p.createdAt).getTime() >= d.getTime());
    subtitle = "Past 7 Days";
  } else if (type === 'month') {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    filtered = forestData.filter(p => new Date(p.createdAt).getTime() >= monthStart);
    subtitle = "This Month";
  } else {
    const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
    filtered = forestData.filter(p => new Date(p.createdAt).getTime() >= yearStart);
    subtitle = now.getFullYear().toString();
  }
  
  const subtitleEl = document.getElementById('timeline-subtitle');
  if(subtitleEl) subtitleEl.textContent = subtitle;

  renderForestGrid(filtered);
  renderChart(filtered, type);
}

function renderForestGrid(dataToRender = forestData) {
  const grid = document.getElementById('forest-grid');
  grid.innerHTML = '';
  document.getElementById('total-trees').textContent = dataToRender.length;

  for (let i = 0; i < 36; i++) {
    const cell = document.createElement('div');
    if (i < dataToRender.length) {
      cell.className = 'grid-cell grass';
      cell.innerHTML = `
        <div class="grid-tree">
          <div class="gt-trunk"></div>
          <div class="gt-leaves"></div>
        </div>
      `;
    } else {
      cell.className = 'grid-cell dirt';
    }
    grid.appendChild(cell);
  }
}

function renderChart(dataToRender = forestData, type = 'year') {
  const ctx = document.getElementById('forest-chart');
  if (!ctx) return;
  
  let totalTime = dataToRender.reduce((acc, p) => acc + (p.duration || 0), 0);
  document.getElementById('total-focus-time').textContent = totalTime;

  let labels = [];
  let chartData = [];
  const now = new Date();

  if (type === 'day') {
    labels = Array.from({length: 24}, (_, i) => `${i}:00`);
    chartData = new Array(24).fill(0);
    dataToRender.forEach(p => {
      const d = new Date(p.createdAt);
      if (d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
        chartData[d.getHours()] += p.duration || 0;
      }
    });
  } else if (type === 'week') {
    labels = [];
    chartData = new Array(7).fill(0);
    for(let i=6; i>=0; i--) {
      let d = new Date(); d.setDate(d.getDate() - i);
      labels.push(d.toLocaleDateString('en-US', {weekday:'short'}));
    }
    dataToRender.forEach(p => {
      const pDate = new Date(p.createdAt);
      const diffTime = now.getTime() - pDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays < 7) {
        chartData[6 - diffDays] += p.duration || 0;
      }
    });
  } else if (type === 'month') {
    labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
    chartData = new Array(4).fill(0);
    dataToRender.forEach(p => {
      const d = new Date(p.createdAt);
      if(d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
         const week = Math.min(Math.floor((d.getDate() - 1) / 7.5), 3);
         chartData[week] += p.duration || 0;
      }
    });
  } else {
    labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    chartData = new Array(12).fill(0);
    dataToRender.forEach(p => {
      const d = new Date(p.createdAt);
      if(d.getFullYear() === now.getFullYear()) {
        chartData[d.getMonth()] += p.duration || 0;
      }
    });
  }

  if (chartInstance) chartInstance.destroy();
  
  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Minutes',
        data: chartData,
        backgroundColor: '#4caf50',
        borderRadius: 4,
        barPercentage: 0.6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#8ba3c7' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8ba3c7' }, beginAtZero: true }
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadForest();
  
  // Initialize from Focus Mode URL params (e.g. redirected from tracker)
  const urlParams = new URLSearchParams(window.location.search);
  const estMins = urlParams.get('est');
  if (estMins) {
    document.getElementById('timer-duration').value = estMins;
    const sub = document.getElementById('plant-mode-subtitle');
    if(sub) sub.innerHTML = '<span style="color:var(--neon-green)">🎯 Focus Mode active!</span>';
    
    // Optionally clean URL
    window.history.replaceState({}, document.title, "/plant");
  }

  const mins = parseInt(document.getElementById('timer-duration').value, 10);
  document.getElementById('plant-timer-display').textContent = formatTime(mins * 60);
});
