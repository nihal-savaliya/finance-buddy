const fs = require('fs');
const path = require('path');

const scriptFile = path.join(__dirname, 'script.js');
let content = fs.readFileSync(scriptFile, 'utf8');

// 1. Add fetchWithAuth
const fetchAuthStr = `
// ────────────────── Auth Helper ───────────────────
async function fetchWithAuth(url, options = {}) {
  const token = localStorage.getItem('token');
  if (!token) {
    $('#auth-overlay').classList.remove('hidden');
    return Promise.reject('No token');
  }
  options.headers = {
    ...options.headers,
    'Authorization': \`Bearer \${token}\`
  };
  const res = await fetch(url, options);
  if (res.status === 401) {
    localStorage.removeItem('token');
    $('#auth-overlay').classList.remove('hidden');
  }
  return res;
}
`;

content = content.replace("// ────────────────── Config ──────────────────────\nconst API_BASE = 'http://localhost:5000';", "// ────────────────── Config ──────────────────────\nconst API_BASE = 'http://localhost:5000';\n" + fetchAuthStr);

// 2. Add auth DOM Refs
const domRefs = `
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
`;

content = content.replace("// Dashboard", domRefs + "\n// Dashboard");

// 3. Update DOMContentLoaded logic to handle Auth check and bind auth
const initTarget = `// ────────────────── Init ────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setTimeout(() => loadingScreen.classList.add('hidden'), 1100);

  // Fetch live transactions from Backend
  try {
    const res = await fetch(\`\${API_BASE}/api/transactions\`);`;

const initReplace = `// ────────────────── Init ────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setTimeout(() => loadingScreen.classList.add('hidden'), 1100);
  bindAuth();

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
  // Fetch live transactions from Backend
  try {
    const res = await fetchWithAuth(\`\${API_BASE}/api/transactions\`);`;

content = content.replace(initTarget, initReplace);

// Find the end of DOMContentLoaded:
const initEnd = `  bindMisc();
});

// ────────────────── SPA Router ──────────────────`;

const initEndReplace = `  bindMisc();
}

// ────────────────── SPA Router ──────────────────`;
content = content.replace(initEnd, initEndReplace);

// 4. Auth Bindings
const authCode = `
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
      const res = await fetch(\`\${API_BASE}\${endpoint}\`, {
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
`;

content = content.replace("// ────────────────── SPA Router ──────────────────", authCode + "\n// ────────────────── SPA Router ──────────────────");

// 5. Replace `fetch(` with `fetchWithAuth(` for all API calls except auth
content = content.replace(/await fetch\(`\$\{API_BASE\}\/api\/goals`/g, "await fetchWithAuth(`${API_BASE}/api/goals`");
content = content.replace(/await fetch\(`\$\{API_BASE\}\/api\/score`/g, "await fetchWithAuth(`${API_BASE}/api/score`");
content = content.replace(/await fetch\(`\$\{API_BASE\}\/api\/chat`/g, "await fetchWithAuth(`${API_BASE}/api/chat`");
content = content.replace(/await fetch\(`\$\{API_BASE\}\/api\/sms`/g, "await fetchWithAuth(`${API_BASE}/api/sms`");
content = content.replace(/await fetch\(`\$\{API_BASE\}\/api\/transactions/g, "await fetchWithAuth(`${API_BASE}/api/transactions");
content = content.replace(/await fetch\(`\$\{API_BASE\}\/api\/goals/g, "await fetchWithAuth(`${API_BASE}/api/goals");

fs.writeFileSync(scriptFile, content, 'utf8');
console.log("script.js updated successfully.");
