/* ═══════════════════════════════════════════════════
   AI Finance Buddy — script.js
   SPA Router · Chat · SMS Parser · Goals · Toasts
   ═══════════════════════════════════════════════════ */

// ────────────────── Config ──────────────────────
const API_BASE = '';

// ────────────────── Auth Helper ───────────────────
async function fetchWithAuth(url, options = {}) {
  const token = localStorage.getItem('token');
  if (!token) {
    $('#auth-overlay').classList.remove('hidden');
    return Promise.reject('No token');
  }
  options.headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`
  };
  const res = await fetch(url, options);
  if (res.status === 401) {
    localStorage.removeItem('token');
    $('#auth-overlay').classList.remove('hidden');
  }
  return res;
}


// ────────────────── App State ───────────────────
let SCORE = 0;
let transactions = [];
let goals = [];

const chatHistory = [
  { role: 'ai', text: "Hey there! 👋 I'm your AI Finance Buddy. Ask me about your spending, set goals, or paste an SMS to log a transaction." },
];

// ────────────────── DOM Refs ────────────────────
const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];

const loadingScreen  = $('#loading-screen');
const sidebar        = $('#sidebar');
const hamburger      = $('#hamburger');
const sidebarClose   = $('#sidebar-close');
const navItems       = $$('.nav-item');
const pageTitle      = $('#page-title');
const pages          = $$('.page');
const toastContainer = $('#toast-container');


// Auth
const authOverlay = $('#auth-overlay');
const authForm = $('#auth-form');
const authUsername = $('#auth-username');
const authPassword = $('#auth-password');
const authError = $('#auth-error');
const authSwitchLink = $('#auth-switch-link');
const authSwitchText = $('#auth-switch-text');
const authTitle = $('#auth-title');
const logoutBtn = $('#logout-btn');

let isSignup = false;

// Dashboard
const scoreRingFill = $('#score-ring-fill');
const scoreValue    = $('#score-value');
const scoreLabel    = $('#score-label');
const txnBody       = $('#txn-body');
const txnBodyFull   = $('#txn-body-full');
const barChart      = $('#bar-chart');

// Chat
const chatMessages = $('#chat-messages');
const chatForm     = $('#chat-form');
const chatInput    = $('#chat-input');

// Goals
const goalsGrid  = $('#goals-grid');
const addGoalBtn = $('#add-goal-btn');
const goalModal  = $('#goal-modal');
const modalClose = $('#modal-close');
const goalForm   = $('#goal-form');

// Topbar
const topbarDate = $('#topbar-date');
const notifBtn   = $('#notif-btn');

// ────────────────── Init ────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setTimeout(() => loadingScreen.classList.add('hidden'), 1100);
  bindAuth();
  bindNav();
  bindChat();
  bindSMS();
  bindGoalModal();
  bindTxnModal();
  bindMisc();

  const token = localStorage.getItem('token');
  if (!token) {
    authOverlay.classList.remove('hidden');
    return;
  } else {
    authOverlay.classList.add('hidden');
    await loadInitialData();
  }
});

async function loadInitialData() {
  updateUserProfileUI();
  // Fetch live transactions from Backend
  try {
    const res = await fetchWithAuth(`${API_BASE}/api/transactions`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    transactions = await res.json();
  } catch (error) {
    console.error("Failed to load transactions:", error);
    toast('⚠️ Could not load transactions from server');
  }

  // Fetch goals from Backend
  try {
    const res = await fetchWithAuth(`${API_BASE}/api/goals`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    goals = await res.json();
  } catch (error) {
    console.error("Failed to load goals:", error);
    toast('⚠️ Could not load goals from server');
  }

  setTopbarDate();
  renderSummary();
  renderTransactions();
  renderBarChart();
  renderGoals();
  renderChatHistory();
  await updateHealthScore();
}


// ────────────────── Auth Logic ────────────────────
function bindAuth() {
  authSwitchLink.addEventListener('click', (e) => {
    e.preventDefault();
    isSignup = !isSignup;
    authTitle.textContent = isSignup ? 'Create Account' : 'Welcome Back';
    authSwitchText.textContent = isSignup ? "Already have an account?" : "Don't have an account?";
    authSwitchLink.textContent = isSignup ? 'Log In' : 'Sign Up';
    $('#auth-submit-btn').textContent = isSignup ? 'Sign Up' : 'Log In';
    authError.style.display = 'none';
  });

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = authUsername.value.trim();
    const password = authPassword.value.trim();
    if(!username || !password) return;

    try {
      const endpoint = isSignup ? '/api/auth/signup' : '/api/auth/login';
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      
      if(data.success) {
        if(isSignup) {
          toast(data.message);
          authSwitchLink.click(); // Switch to login
        } else {
          localStorage.setItem('token', data.token);
          authOverlay.classList.add('hidden');
          toast('Logged in successfully');
          loadInitialData(); // Load user data
        }
      } else {
        authError.textContent = data.message;
        authError.style.display = 'block';
      }
    } catch(err) {
      authError.textContent = 'Server error. Try again.';
      authError.style.display = 'block';
    }
  });

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('token');
      transactions = [];
      goals = [];
      authOverlay.classList.remove('hidden');
      toast('Logged out successfully');
      
      // Clear UI
      renderTransactions();
      renderSummary();
      renderBarChart();
      renderGoals();
    });
  }
}

// ────────────────── SPA Router ──────────────────
function bindNav() {
  navItems.forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(item.dataset.page);
    });
  });

  // "View All" link on dashboard → transactions
  $$('.view-all').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(link.dataset.page);
    });
  });
}

function navigateTo(target) {
  navItems.forEach(n => n.classList.toggle('active', n.dataset.page === target));

  pages.forEach(p => {
    p.classList.remove('active');
    if (p.id === `page-${target}`) p.classList.add('active');
  });

  const titles = { dashboard:'Dashboard', chat:'Chat Assistant', transactions:'Transactions', goals:'Goals', settings:'Settings' };
  pageTitle.textContent = titles[target] || target;

  // Close mobile sidebar
  sidebar.classList.remove('open');
}

// ────────────────── Topbar Date ─────────────────
function setTopbarDate() {
  const d = new Date();
  topbarDate.textContent = d.toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}

// ────────────────── Score Ring ───────────────────
function renderScore() {
  const circumference = 2 * Math.PI * 70;
  const offset = circumference - (SCORE / 100) * circumference;

  setTimeout(() => {
    scoreRingFill.style.strokeDashoffset = offset;
  }, 400);

  animateCount(scoreValue, 0, SCORE, 1400);

  let label = 'Needs Improvement';
  if (SCORE >= 80) label = 'Excellent!';
  else if (SCORE >= 60) label = 'Good – Keep it up!';
  else if (SCORE >= 40) label = 'Fair – Room to grow';
  setTimeout(() => { scoreLabel.textContent = label; }, 600);
}

function animateCount(el, from, to, duration) {
  const start = performance.now();
  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const value = Math.round(from + (to - from) * easeOutCubic(progress));
    el.textContent = value;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

// ────────────────── Summary Cards ───────────────
function renderSummary() {
  const totalBalance = transactions.reduce((acc, t) => acc + t.amount, 0);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const monthlySpend = transactions
    .filter(t => {
      const d = new Date(t.date);
      return t.amount < 0 && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    })
    .reduce((acc, t) => acc + Math.abs(t.amount), 0);

  const savings = totalBalance > 0 ? totalBalance : 0;

  // Update DOM
  $('#total-balance').textContent = formatCurrency(totalBalance);
  $('#monthly-spending').textContent = formatCurrency(monthlySpend);
  $('#total-savings').textContent = formatCurrency(savings);
  $('#active-goals').textContent = goals.length;

  // Active Goals trend — dynamic
  const goalsEl = document.getElementById('trend-goals');
  if (goalsEl) {
    if (goals.length === 0) {
      goalsEl.textContent = '— No goals set';
      goalsEl.className = 'summary-trend neutral';
    } else {
      goalsEl.textContent = `${goals.length} active`;
      goalsEl.className = 'summary-trend up';
    }
  }

  // Dynamic trend indicators (compare to a simple baseline)
  const trendBalance = document.getElementById('trend-balance');
  const trendSpending = document.getElementById('trend-spending');
  const trendSavings = document.getElementById('trend-savings');

  if (trendBalance) {
    if (totalBalance > 0) {
      trendBalance.textContent = '↑ Positive';
      trendBalance.className = 'summary-trend up';
    } else if (totalBalance < 0) {
      trendBalance.textContent = '↓ Deficit';
      trendBalance.className = 'summary-trend down';
    } else {
      trendBalance.textContent = '— No data';
      trendBalance.className = 'summary-trend neutral';
    }
  }

  if (trendSpending) {
    if (monthlySpend > 0) {
      trendSpending.textContent = `₹${monthlySpend.toLocaleString('en-IN')} this month`;
      trendSpending.className = 'summary-trend down';
    } else {
      trendSpending.textContent = '— No spending';
      trendSpending.className = 'summary-trend neutral';
    }
  }

  if (trendSavings) {
    if (savings > 0) {
      trendSavings.textContent = '↑ Healthy';
      trendSavings.className = 'summary-trend up';
    } else {
      trendSavings.textContent = '— Build savings';
      trendSavings.className = 'summary-trend neutral';
    }
  }
}

function formatCurrency(n) {
  const prefix = n < 0 ? '-₹' : '₹';
  return prefix + Math.abs(n).toLocaleString('en-IN');
}

// ────────────────── Transactions Table ──────────
function renderTransactions() {
  if (transactions.length === 0) {
    txnBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-dim);padding:24px;">No transactions yet</td></tr>';
    txnBodyFull.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:24px;">No transactions yet</td></tr>';
    return;
  }
  // Dashboard (last 5) — no action buttons
  txnBody.innerHTML = transactions.slice(0, 5).map((t, i) => txnRow(t, i, false)).join('');
  // Full page — with action buttons
  txnBodyFull.innerHTML = transactions.map((t, i) => txnRow(t, i, true)).join('');
  bindTxnActions();
}

function txnRow(t, index, showActions) {
  const cls   = t.amount < 0 ? 'debit' : 'credit';
  const sign  = t.amount < 0 ? '−' : '+';
  const category = t.category || 'other';
  const catCls = `cat-${category}`;
  const catLabel = category.charAt(0).toUpperCase() + category.slice(1);
  const date = new Date(t.date).toLocaleDateString('en-IN', { day:'numeric', month:'short' });
  const actionsCol = showActions
    ? `<td class="txn-actions">
        <button class="txn-action-btn edit-txn-btn" data-index="${index}" title="Edit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="txn-action-btn delete-txn-btn" data-index="${index}" title="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        </button>
      </td>`
    : '';
  return `<tr>
    <td>${t.merchant}</td>
    <td class="txn-amount ${cls}">${sign} ₹${Math.abs(t.amount).toLocaleString('en-IN')}</td>
    <td><span class="cat-tag ${catCls}">${catLabel}</span></td>
    <td>${date}</td>${actionsCol}
  </tr>`;
}

// ────────────────── Bar Chart ───────────────────
function renderBarChart() {
  // Aggregate spending from real transaction data by category
  const categories = {
    Food: 0, Travel: 0, Bills: 0, Shopping: 0, Entertainment: 0, Health: 0
  };

  transactions.forEach(t => {
    if (t.amount < 0) {
      const cat = (t.category || 'other').charAt(0).toUpperCase() + (t.category || 'other').slice(1);
      if (categories.hasOwnProperty(cat)) {
        categories[cat] += Math.abs(t.amount);
      }
    }
  });

  // Dynamic scaling: highest value sets 100% height
  const maxVal = Math.max(...Object.values(categories), 1);

  barChart.innerHTML = Object.entries(categories).map(([name, total]) => {
    const heightPx = Math.round((total / maxVal) * 180);
    return `
      <div class="bar-col">
        <div class="bar" style="height: 0px" data-height="${heightPx}" data-value="₹${total.toLocaleString('en-IN')}"></div>
        <span class="bar-label">${name}</span>
      </div>
    `;
  }).join('');

  // Trigger CSS growth animation
  setTimeout(() => {
    $$('.bar', barChart).forEach(bar => {
      bar.style.height = bar.dataset.height + 'px';
    });
  }, 400);
}

// ────────────────── Chat ────────────────────────
function bindChat() {
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    // Disable input during AI request to prevent double-sends
    input.disabled = true;
    form.querySelector('.send-btn').disabled = true;

    addChatBubble('user', text);
    input.value = '';
    showTyping();

    try {
      const response = await fetchWithAuth(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });

      // Handle rate-limit from server
      if (response.status === 429) {
        removeTyping();
        addChatBubble('ai', "⏳ I'm being rate-limited right now. Please wait a moment and try again.");
        return;
      }

      const data = await response.json();
      removeTyping();

      if (data.success) {
        const aiCommand = data.data;

        // Show AI response text
        addChatBubble('ai', aiCommand.reply);

        // Handle AI actions
       // Handle AI actions
        if (aiCommand.action === 'setGoal') {
          // ... (keep your existing setGoal code here)
          goals.push({
            _id: aiCommand.goalId,
            name: aiCommand.name,
            target: aiCommand.amount,
            saved: 0,
            deadline: aiCommand.deadline || null
          });
          renderGoals();
          renderSummary();
          toast(`🎯 AI created a goal: ${aiCommand.name}`);
          
        } else if (aiCommand.action === 'addExpenses') {
          
          // Loop through the array of saved transactions sent from the backend
          if (aiCommand.savedTxns && aiCommand.savedTxns.length > 0) {
            aiCommand.savedTxns.forEach(txn => {
              transactions.unshift(txn);
            });
          }
          
          renderTransactions();
          renderSummary();
          renderBarChart();
          updateHealthScore();
          toast(`💸 Multiple expenses logged!`);
          
        } else if (aiCommand.action === 'addIncome') {
          const newTxn = {
            amount: Math.abs(aiCommand.amount),
            merchant: aiCommand.merchant || 'Deposit',
            category: 'income',
            date: new Date().toISOString().slice(0, 10)
          };

          transactions.unshift(newTxn);
          renderTransactions();
          renderSummary();
          renderBarChart();
          updateHealthScore();
          toast(`💰 Added ₹${Math.abs(aiCommand.amount).toLocaleString('en-IN')} as income!`);
        }
      } else {
        addChatBubble('ai', data.message || "Oops, something went wrong on my end.");
      }

    } catch (error) {
      removeTyping();
      console.error("Chat error:", error);
      addChatBubble('ai', "I can't reach the server right now. Make sure it's running!");
    } finally {
      // Re-enable input
      input.disabled = false;
      form.querySelector('.send-btn').disabled = false;
      input.focus();
    }
  });
}

function renderChatHistory() {
  chatMessages.innerHTML = '';
  chatHistory.forEach(m => addChatBubble(m.role, m.text, false));
}

function addChatBubble(role, text, scroll = true) {
  const time = new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
  const div = document.createElement('div');
  div.className = `chat-bubble ${role}`;
  // Sanitize user input to prevent XSS, but allow HTML in AI responses
  if (role === 'user') {
    const safeText = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    div.innerHTML = `${safeText}<span class="bubble-time">${time}</span>`;
  } else {
    div.innerHTML = `${text}<span class="bubble-time">${time}</span>`;
  }
  chatMessages.appendChild(div);
  if (scroll) chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTyping() {
  const div = document.createElement('div');
  div.className = 'chat-typing';
  div.id = 'typing-indicator';
  div.innerHTML = '<span></span><span></span><span></span>';
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTyping() {
  const el = $('#typing-indicator');
  if (el) el.remove();
}

// ────────────────── SMS Parser ──────────────────
function bindSMS() {
  const parseBtn = document.getElementById('parse-sms-btn');
  const smsIn = document.getElementById('sms-input');
  const smsRes = document.getElementById('sms-result');

  parseBtn.addEventListener('click', async () => {
    const raw = smsIn.value.trim();
    if (!raw) { toast('⚠️ Please paste an SMS first'); return; }

    // Hide previous result
    smsRes.classList.remove('show');

    parseBtn.disabled = true;
    parseBtn.textContent = 'Parsing…';

    try {
      const response = await fetchWithAuth(`${API_BASE}/api/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: raw })
      });

      // Handle rate-limit
      if (response.status === 429) {
        toast('⏳ AI rate-limited. Please wait and try again.');
        return;
      }

      const data = await response.json();

      if (data.success) {
        const result = data.transaction;

        smsRes.innerHTML = `
          <strong>✅ AI Categorized: ${result.category}</strong><br>
          <strong>Amount:</strong> ₹${Math.abs(result.amount).toLocaleString('en-IN')}<br>
          <strong>Merchant:</strong> ${result.merchant}
        `;
        smsRes.classList.add('show');

        // Update UI immediately
        transactions.unshift(result);
        renderTransactions();
        renderSummary();
        renderBarChart();
        updateHealthScore();
        toast(`✅ Added to ${result.category}!`);
        smsIn.value = '';
      } else {
        smsRes.innerHTML = `<strong style="color:var(--accent-red);">❌ ${data.message}</strong>`;
        smsRes.classList.add('show');
      }
    } catch (error) {
      console.error("Server error:", error);
      toast('❌ Could not connect to backend');
    } finally {
      parseBtn.disabled = false;
      parseBtn.textContent = 'Parse Transaction';
    }
  });
}

// ────────────────── Transaction Edit / Delete ───
function bindTxnActions() {
  $$('.edit-txn-btn', txnBodyFull).forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      openEditTxnModal(idx);
    });
  });

  $$('.delete-txn-btn', txnBodyFull).forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      deleteTransaction(idx);
    });
  });
}

function openEditTxnModal(index) {
  const t = transactions[index];
  if (!t) return;

  const txnModal = $('#txn-modal');
  $('#txn-edit-id').value = t._id || '';
  $('#txn-edit-index').value = index;
  $('#txn-edit-merchant').value = t.merchant;
  $('#txn-edit-amount').value = Math.abs(t.amount);
  $('#txn-edit-type').value = t.amount >= 0 ? 'income' : 'expense';
  $('#txn-edit-category').value = t.category || 'other';
  $('#txn-edit-date').value = t.date || new Date().toISOString().slice(0, 10);

  txnModal.classList.add('show');
}

async function deleteTransaction(index) {
  const t = transactions[index];
  if (!t) return;

  if (!confirm(`Delete transaction "${t.merchant} — ₹${Math.abs(t.amount).toLocaleString('en-IN')}"?`)) return;

  if (t._id) {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/transactions/${t._id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
    } catch (error) {
      console.error('Failed to delete transaction:', error);
      toast('❌ Could not delete transaction from server');
      return;
    }
  }

  transactions.splice(index, 1);
  renderTransactions();
  renderSummary();
  renderBarChart();
  updateHealthScore();
  toast('🗑️ Transaction deleted!');
}

function bindTxnModal() {
  const txnModal = $('#txn-modal');
  const txnModalClose = $('#txn-modal-close');
  const txnEditForm = $('#txn-edit-form');

  txnModalClose.addEventListener('click', () => txnModal.classList.remove('show'));
  txnModal.addEventListener('click', e => { if (e.target === txnModal) txnModal.classList.remove('show'); });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && txnModal.classList.contains('show')) {
      txnModal.classList.remove('show');
    }
  });

  txnEditForm.addEventListener('submit', async e => {
    e.preventDefault();
    const index = parseInt($('#txn-edit-index').value);
    const txnId = $('#txn-edit-id').value;
    const merchant = $('#txn-edit-merchant').value.trim();
    const rawAmount = parseInt($('#txn-edit-amount').value);
    const type = $('#txn-edit-type').value;
    const category = $('#txn-edit-category').value;
    const date = $('#txn-edit-date').value;

    if (!merchant || !rawAmount) return;

    const amount = type === 'income' ? Math.abs(rawAmount) : -Math.abs(rawAmount);

    // Update backend
    if (txnId) {
      try {
        const res = await fetchWithAuth(`${API_BASE}/api/transactions/${txnId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount, merchant, category, date })
        });
        if (!res.ok) throw new Error('Failed to update');
        const data = await res.json();
        if (data.success) {
          transactions[index] = data.transaction;
        }
      } catch (error) {
        console.error('Failed to update transaction:', error);
        toast('❌ Could not update transaction on server');
        return;
      }
    } else {
      // Local-only update
      transactions[index] = { ...transactions[index], amount, merchant, category, date };
    }

    renderTransactions();
    renderSummary();
    renderBarChart();
    updateHealthScore();
    txnModal.classList.remove('show');
    toast('✅ Transaction updated!');
  });
}

// ────────────────── Goals ───────────────────────
function renderGoals() {
  if (goals.length === 0) {
    goalsGrid.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:40px;">No goals yet. Add one with the button above or ask your AI assistant!</p>';
    return;
  }

  goalsGrid.innerHTML = goals.map((g, i) => {
    const saved = g.saved || 0;
    const pct = g.target > 0 ? Math.min(Math.round((saved / g.target) * 100), 100) : 0;
    const goalId = g._id || i;
    const remaining = Math.max(g.target - saved, 0);

    // Deadline info
    let deadlineHTML = '';
    let statusHTML = '';
    if (g.deadline) {
      const deadlineDate = new Date(g.deadline);
      const now = new Date();
      const daysLeft = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));
      const monthsLeft = Math.max(daysLeft / 30, 0.5);
      const monthlyNeeded = remaining > 0 ? Math.round(remaining / monthsLeft) : 0;

      const deadlineFmt = deadlineDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      deadlineHTML = `<div class="goal-deadline">📅 ${deadlineFmt}</div>`;

      if (pct >= 100) {
        statusHTML = '<div class="goal-status goal-status-complete">✅ Goal completed!</div>';
      } else if (daysLeft < 0) {
        statusHTML = '<div class="goal-status goal-status-overdue">⚠️ Overdue — ₹' + remaining.toLocaleString('en-IN') + ' remaining</div>';
      } else if (daysLeft <= 30) {
        statusHTML = `<div class="goal-status goal-status-urgent">⏳ ${daysLeft} days left — save ₹${monthlyNeeded.toLocaleString('en-IN')}/mo</div>`;
      } else {
        statusHTML = `<div class="goal-status goal-status-ontrack">₹${monthlyNeeded.toLocaleString('en-IN')}/mo needed — ${daysLeft} days left</div>`;
      }
    }

    return `<div class="goal-card" style="--delay:${i * .1}s" data-goal-id="${goalId}">
      <div class="goal-card-header">
        <div class="goal-name">${g.name}</div>
        <div class="goal-actions">
          <button class="goal-action-btn edit-goal-btn" data-index="${i}" title="Edit goal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="goal-action-btn delete-goal-btn" data-index="${i}" title="Delete goal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
      </div>
      ${deadlineHTML}
      <div class="goal-amounts">
        <span>₹${saved.toLocaleString('en-IN')} saved</span>
        <span>₹${g.target.toLocaleString('en-IN')} target</span>
      </div>
      <div class="goal-bar-wrap">
        <div class="goal-bar" style="width:0%" data-width="${pct}%"></div>
      </div>
      <div class="goal-percent">${pct}%</div>
      ${statusHTML}
    </div>`;
  }).join('');

  // Animate progress bars
  setTimeout(() => {
    $$('.goal-bar', goalsGrid).forEach(bar => {
      bar.style.width = bar.dataset.width;
    });
  }, 300);

  // Bind edit buttons
  $$('.edit-goal-btn', goalsGrid).forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      editGoal(idx);
    });
  });

  // Bind delete buttons
  $$('.delete-goal-btn', goalsGrid).forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      deleteGoal(idx);
    });
  });
}

// ────────────────── Edit Goal ───────────────────
async function editGoal(index) {
  const goal = goals[index];
  if (!goal) return;

  const newName = prompt('Goal Name:', goal.name);
  if (newName === null) return;
  const newTarget = prompt('Target Amount (₹):', goal.target);
  if (newTarget === null) return;
  const newDeadline = prompt('Target Date (YYYY-MM-DD):', goal.deadline || '');
  if (newDeadline === null) return;

  const updatedName = newName.trim() || goal.name;
  const updatedTarget = parseInt(newTarget) || goal.target;
  const updatedDeadline = newDeadline.trim() || null;

  // Update in backend if we have an _id
  if (goal._id) {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/goals/${goal._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: updatedName, target: updatedTarget, deadline: updatedDeadline })
      });
      if (!res.ok) throw new Error('Failed to update');
    } catch (error) {
      console.error('Failed to update goal:', error);
      toast('❌ Could not update goal on server');
      return;
    }
  }

  goals[index] = { ...goal, name: updatedName, target: updatedTarget, deadline: updatedDeadline };
  renderGoals();
  renderSummary();
  toast('✅ Goal updated!');
}

// ────────────────── Delete Goal ─────────────────
async function deleteGoal(index) {
  const goal = goals[index];
  if (!goal) return;

  if (!confirm(`Delete goal "${goal.name}"?`)) return;

  // Delete from backend if we have an _id
  if (goal._id) {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/goals/${goal._id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
    } catch (error) {
      console.error('Failed to delete goal:', error);
      toast('❌ Could not delete goal from server');
      return;
    }
  }

  goals.splice(index, 1);
  renderGoals();
  renderSummary();
  toast('🗑️ Goal deleted!');
}

function bindGoalModal() {
  addGoalBtn.addEventListener('click', () => goalModal.classList.add('show'));
  modalClose.addEventListener('click', () => goalModal.classList.remove('show'));
  goalModal.addEventListener('click', e => { if (e.target === goalModal) goalModal.classList.remove('show'); });

  // Escape key closes modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && goalModal.classList.contains('show')) {
      goalModal.classList.remove('show');
    }
  });

  goalForm.addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#goal-name').value.trim();
    const amount = parseInt($('#goal-amount').value);
    const deadline = $('#goal-deadline').value || null;
    if (!name || !amount) return;

    // Save to backend
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, target: amount, saved: 0, deadline })
      });
      const data = await res.json();
      if (data.success) {
        goals.push(data.goal);
      } else {
        goals.push({ name, target: amount, saved: 0, deadline });
      }
    } catch (error) {
      console.error('Failed to save goal:', error);
      goals.push({ name, target: amount, saved: 0, deadline });
      toast('⚠️ Goal saved locally but not to server');
    }

    renderGoals();
    renderSummary();
    goalForm.reset();
    goalModal.classList.remove('show');
    toast('🎯 Goal added successfully!');
  });
}

// ────────────────── Misc Bindings ───────────────
function bindMisc() {
  hamburger.addEventListener('click', () => sidebar.classList.add('open'));
  sidebarClose.addEventListener('click', () => sidebar.classList.remove('open'));

  // Click outside sidebar on mobile to close it
  document.addEventListener('click', e => {
    if (sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) &&
        e.target !== hamburger &&
        !hamburger.contains(e.target)) {
      sidebar.classList.remove('open');
    }
  });

  notifBtn.addEventListener('click', () => toast('🔔 No new notifications'));

  // Hide the misleading red dot — no real notification system
  const dot = document.querySelector('.notif-dot');
  if (dot) dot.style.display = 'none';

  // Wire up Settings page
  bindSettings();
}

// ────────────────── Settings ────────────────────
function bindSettings() {
  // --- Load saved preferences from localStorage ---
  const savedName = localStorage.getItem('fb_name');
  const savedEmail = localStorage.getItem('fb_email');
  const darkMode = localStorage.getItem('fb_darkmode');

  const nameInput = document.getElementById('setting-name');
  const emailInput = document.getElementById('setting-email');
  const darkToggle = document.getElementById('toggle-darkmode');
  const notifToggle = document.getElementById('toggle-notif');
  const reportToggle = document.getElementById('toggle-report');
  const currencySelect = document.getElementById('select-currency');
  const saveBtn = document.getElementById('save-settings-btn');
  const logoutBtn = document.getElementById('logout-btn');

 if (savedName) {
    nameInput.value = savedName;
    // Also update the sidebar avatar and name
    const userNameEl = document.querySelector('.user-name');
    const avatarEl = document.querySelector('.avatar');
    if (userNameEl) userNameEl.textContent = savedName;
    if (avatarEl) {
      const initials = savedName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      avatarEl.textContent = initials;
    }
  }
  if (savedEmail) emailInput.value = savedEmail;

  // Dark mode: restore state
  if (darkMode === 'off') {
    darkToggle.checked = false;
    document.body.classList.add('light-theme');
  }

  // --- Dark Mode Toggle ---
  darkToggle.addEventListener('change', () => {
    if (darkToggle.checked) {
      document.body.classList.remove('light-theme');
      localStorage.setItem('fb_darkmode', 'on');
      toast('🌙 Dark mode enabled');
    } else {
      document.body.classList.add('light-theme');
      localStorage.setItem('fb_darkmode', 'off');
      toast('☀️ Light mode enabled');
    }
  });

  // --- Push Notifications Toggle ---
  notifToggle.addEventListener('change', () => {
    if (notifToggle.checked) {
      toast('🔔 Push notifications enabled');
    } else {
      toast('🔕 Push notifications disabled');
    }
    localStorage.setItem('fb_notif', notifToggle.checked ? 'on' : 'off');
  });

  // --- Monthly Report Toggle ---
  reportToggle.addEventListener('change', () => {
    if (reportToggle.checked) {
      toast('📧 Monthly report emails enabled');
    } else {
      toast('📧 Monthly report emails disabled');
    }
    localStorage.setItem('fb_report', reportToggle.checked ? 'on' : 'off');
  });

  // --- Currency Selector ---
  const savedCurrency = localStorage.getItem('fb_currency');
  if (savedCurrency) currencySelect.value = savedCurrency;

  currencySelect.addEventListener('change', () => {
    localStorage.setItem('fb_currency', currencySelect.value);
    toast(`💱 Currency changed to ${currencySelect.value}`);
  });

  // --- Save Button ---
  saveBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();

    if (!name) { toast('⚠️ Name cannot be empty'); return; }
    if (!email || !email.includes('@')) { toast('⚠️ Please enter a valid email'); return; }

    localStorage.setItem('fb_name', name);
    localStorage.setItem('fb_email', email);

    // Update sidebar
    const userNameEl = document.querySelector('.user-name');
    const avatarEl = document.querySelector('.avatar');
    if (userNameEl) userNameEl.textContent = name;
    if (avatarEl) {
      const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      avatarEl.textContent = initials;
    }

    toast('✅ Settings saved!');
  });

  // --- Log Out ---
  logoutBtn.addEventListener('click', () => {
    localStorage.clear();
    transactions = [];
    goals = [];
    SCORE = 0;

    renderSummary();
    renderTransactions();
    renderBarChart();
    renderGoals();
    renderScore();
    navigateTo('dashboard');
    toast('👋 Logged out successfully');
  });
}

// ────────────────── Toast System ────────────────
function toast(message, duration = 3000) {
  const div = document.createElement('div');
  div.className = 'toast';
  div.innerHTML = `<span class="toast-icon"></span><span>${message}</span>`;
  toastContainer.appendChild(div);

  setTimeout(() => {
    div.classList.add('out');
    div.addEventListener('animationend', () => div.remove());
  }, duration);
}

// ────────────────── Health Score ─────────────────
async function updateHealthScore() {
  try {
    const response = await fetchWithAuth(`${API_BASE}/api/score`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    if (data.success) {
      SCORE = data.score;
      renderScore();

      // Color coding based on score
      const scoreEl = document.getElementById('score-value');
      if (scoreEl) {
        if (SCORE >= 75) scoreEl.style.color = '#00ff9d';
        else if (SCORE >= 40) scoreEl.style.color = '#ffb703';
        else scoreEl.style.color = '#ff0055';
      }
    }
  } catch (error) {
    console.error("Failed to load health score:", error);
  }
}
// ────────────────── User Profile UI Updater ───────────────
function updateUserProfileUI() {
  const token = localStorage.getItem('token');
  if (!token) return;
  
  try {
    // 1. Decode the secure JWT token to get the real username
    const payload = JSON.parse(atob(token.split('.')[1]));
    const rawUsername = payload.username || 'User';
    
    // 2. Format the name nicely (e.g., "daksh" -> "Daksh")
    const formattedName = rawUsername.charAt(0).toUpperCase() + rawUsername.slice(1);
    const initials = formattedName.substring(0, 2).toUpperCase();
    
    // 3. Update the Sidebar
    const userNameEl = document.querySelector('.user-name');
    const avatarEl = document.querySelector('.avatar');
    if (userNameEl) userNameEl.textContent = formattedName;
    if (avatarEl) avatarEl.textContent = initials;
    
    // 4. Update the Settings Page
    const settingName = document.getElementById('setting-name');
    const settingEmail = document.getElementById('setting-email');
    if (settingName) settingName.value = formattedName;
    
    // Auto-generate a dummy email based on the username so it isn't always nihaal@example.com
    if (settingEmail) settingEmail.value = `${rawUsername.toLowerCase()}@financebuddy.com`;
    
  } catch (e) {
    console.error("Could not parse user token", e);
  }
}