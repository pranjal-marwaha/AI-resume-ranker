// HireLens AI — Enterprise Portal Controller (Phase 5)
// Student Portal: Resume upload, JD input, real backend analytics, charts, action plan

let currentUser = null;
let currentSessionToken = null;
let chartInstances = {};
let _studentSelectedFile = null;
let latestStudentAnalysisData = null;
let latestStudentFilename = null;
let latestStudentMetadata = null;
let studentAnalysisHistory = [];
let currentStudentSubpage = "overview";

document.addEventListener("DOMContentLoaded", () => {
  initPortalNavigation();
  checkSystemHealth();
  checkAuthSession();
  initStudentPortal();
  initHRPortal();
});

// =========================================================================
// 1. AUTHENTICATION & SESSION MANAGEMENT
// =========================================================================

function getAuthHeaders(isJson = true) {
  const token = currentSessionToken || localStorage.getItem("hirelens_token");
  const headers = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    headers["x-session-token"] = token;
  }
  if (isJson) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

async function checkAuthSession() {
  const token = localStorage.getItem("hirelens_token");
  if (!token) {
    showAuthView("login");
    return;
  }

  currentSessionToken = token;
  try {
    const res = await fetch("/api/auth/me", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.authenticated && data.user) {
        setAuthenticatedUser(data.user, token);
      } else {
        localStorage.removeItem("hirelens_token");
        showAuthView("login");
      }
    } else {
      localStorage.removeItem("hirelens_token");
      showAuthView("login");
    }
  } catch (err) {
    console.error("Auth session check failed:", err);
    showAuthView("login");
  }
}

function setAuthenticatedUser(user, token) {
  currentUser = user;
  currentSessionToken = token;
  localStorage.setItem("hirelens_token", token);

  document.getElementById("auth-view").style.display = "none";
  document.getElementById("app-layout").style.display = "grid";
  document.getElementById("header-portal-switcher").style.display = "flex";
  document.getElementById("header-unauth-actions").style.display = "none";
  document.getElementById("header-user-chip").style.display = "flex";

  const initials = user.full_name
    ? user.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";
  document.getElementById("header-user-avatar").textContent = initials;
  document.getElementById("header-user-name").textContent = user.full_name || user.email;

  const roleBadge = document.getElementById("header-user-role-badge");
  roleBadge.textContent = user.role === "student" ? "Student" : "HR Recruiter";
  roleBadge.className = `user-role-badge ${user.role === "student" ? "role-student" : "role-hr"}`;

  document.getElementById("sidebar-user-avatar").textContent = initials;
  document.getElementById("sidebar-user-name").textContent = user.full_name || user.email;
  document.getElementById("sidebar-user-role-label").textContent =
    `${user.role === "student" ? "Student Account" : "HR Recruiter"} (Verified)`;

  if (user.role === "student") {
    switchPortal("student", true);
  } else {
    switchPortal("hr", true);
  }
}

function showAuthView(tab = "login") {
  document.getElementById("auth-view").style.display = "block";
  document.getElementById("app-layout").style.display = "none";
  document.getElementById("header-portal-switcher").style.display = "none";
  document.getElementById("header-user-chip").style.display = "none";
  document.getElementById("header-unauth-actions").style.display = "block";
  switchAuthTab(tab);
}

function switchAuthTab(tab) {
  const loginBtn = document.getElementById("btn-tab-login");
  const signupBtn = document.getElementById("btn-tab-signup");
  const loginForm = document.getElementById("login-form");
  const signupForm = document.getElementById("signup-form");
  const alertBox = document.getElementById("auth-alert");

  if (alertBox) alertBox.style.display = "none";

  if (tab === "login") {
    loginBtn.classList.add("active");
    signupBtn.classList.remove("active");
    loginForm.style.display = "flex";
    signupForm.style.display = "none";
  } else {
    signupBtn.classList.add("active");
    loginBtn.classList.remove("active");
    loginForm.style.display = "none";
    signupForm.style.display = "flex";
  }
}

function updateRoleCardSelection() {
  const studentRadio = document.querySelector('input[name="signup-role"][value="student"]');
  const studentCard = document.getElementById("role-card-student");
  const hrCard = document.getElementById("role-card-hr");
  if (studentRadio.checked) {
    studentCard.classList.add("active");
    hrCard.classList.remove("active");
  } else {
    studentCard.classList.remove("active");
    hrCard.classList.add("active");
  }
}

function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (input) {
    input.type = input.type === "password" ? "text" : "password";
  }
}

function showAuthAlert(message, type = "danger") {
  const alertBox = document.getElementById("auth-alert");
  if (!alertBox) return;
  alertBox.className = `alert-box alert-${type}`;
  alertBox.innerHTML = `<span>${type === "danger" ? "⚠️" : "✅"}</span> <div>${message}</div>`;
  alertBox.style.display = "flex";
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const submitBtn = document.getElementById("login-submit-btn");

  if (!email || !password) {
    showAuthAlert("Please provide both email and password.");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = `Authenticating...`;

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Authentication failed.");
    setAuthenticatedUser(data.user, data.token);
  } catch (err) {
    showAuthAlert(err.message, "danger");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `Sign In to Workspace`;
  }
}

async function handleSignupSubmit(e) {
  e.preventDefault();
  const fullName = document.getElementById("signup-fullname").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  const roleInput = document.querySelector('input[name="signup-role"]:checked');
  const role = roleInput ? roleInput.value : "student";
  const submitBtn = document.getElementById("signup-submit-btn");

  if (!fullName || !email || !password) {
    showAuthAlert("Please fill in all required fields.");
    return;
  }
  if (password.length < 6) {
    showAuthAlert("Password must be at least 6 characters.");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = `Creating Account...`;

  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: fullName, email, password, role })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Registration failed.");
    setAuthenticatedUser(data.user, data.token);
  } catch (err) {
    showAuthAlert(err.message, "danger");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `Create Verified Account`;
  }
}

async function loginDemo(role) {
  const emailInput = document.getElementById("login-email");
  const pwdInput = document.getElementById("login-password");
  switchAuthTab("login");
  if (role === "student") {
    emailInput.value = "student@hirelens.ai";
    pwdInput.value = "StudentPass123!";
  } else {
    emailInput.value = "hr@hirelens.ai";
    pwdInput.value = "HRRecruiter123!";
  }
  await handleLoginSubmit({ preventDefault: () => {} });
}

async function handleLogout() {
  const token = currentSessionToken || localStorage.getItem("hirelens_token");
  if (token) {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
    } catch (e) {
      console.warn("Logout ping failed", e);
    }
  }
  localStorage.removeItem("hirelens_token");
  currentUser = null;
  currentSessionToken = null;
  showAuthView("login");
  showAuthAlert("You have been signed out safely.", "success");
}

function navigateToHome() {
  if (currentUser) {
    switchPortal(currentUser.role === "student" ? "student" : "hr", true);
  } else {
    showAuthView("login");
  }
}

// =========================================================================
// 2. PORTAL NAVIGATION & ROLE-BASED ACCESS CONTROL
// =========================================================================

function initPortalNavigation() {
  document.querySelectorAll(".portal-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      switchPortal(btn.getAttribute("data-portal"));
    });
  });
}

function switchPortal(targetPortalId, force = false) {
  if (currentUser && !force) {
    if (currentUser.role === "student" && targetPortalId === "hr") {
      showRoleGuardBanner(
        "Role Guard Active: Student Account",
        "Your account is registered as a Student. Access to the HR Recruiter Pipeline is restricted to recruiter accounts. (Use the Demo Recruiter login to test HR features)."
      );
      return;
    }
    if (currentUser.role === "hr" && targetPortalId === "student") {
      showRoleGuardBanner(
        "Role Guard Active: HR Recruiter Account",
        "Your account is registered as an HR Recruiter. The Student Workspace is dedicated to candidate self-audits. (Use the Demo Student login to test Student features)."
      );
      return;
    }
  }

  dismissRoleGuardBanner();

  document.querySelectorAll(".portal-tab-btn").forEach(btn => {
    const isTarget = btn.getAttribute("data-portal") === targetPortalId;
    btn.classList.toggle("active", isTarget);
    btn.setAttribute("aria-selected", isTarget ? "true" : "false");
  });

  document.querySelectorAll(".portal-view").forEach(view => {
    view.classList.toggle("active-portal", view.id === `${targetPortalId}-portal`);
  });

  const studentSide = document.getElementById("sidebar-student-menu");
  const hrSide = document.getElementById("sidebar-hr-menu");
  if (studentSide) studentSide.style.display = targetPortalId === "student" ? "block" : "none";
  if (hrSide) hrSide.style.display = targetPortalId === "hr" ? "block" : "none";

  history.replaceState(null, null, `#${targetPortalId}`);
}

function showRoleGuardBanner(title, desc) {
  const banner = document.getElementById("role-guard-banner");
  const titleEl = document.getElementById("role-guard-title");
  const descEl = document.getElementById("role-guard-desc");
  if (banner && titleEl && descEl) {
    titleEl.textContent = title;
    descEl.textContent = desc;
    banner.style.display = "flex";
  }
}

function dismissRoleGuardBanner() {
  const banner = document.getElementById("role-guard-banner");
  if (banner) banner.style.display = "none";
}

async function checkSystemHealth() {
  const statusEl = document.getElementById("system-status-indicator");
  const dotEl = document.getElementById("system-health-dot");
  if (!statusEl) return;
  try {
    const res = await fetch("/api/health");
    if (res.ok) {
      const data = await res.json();
      statusEl.textContent = `Engine Online (v${data.version || "1.0"})`;
      if (dotEl) dotEl.style.backgroundColor = "var(--success)";
    } else {
      statusEl.textContent = "Engine Offline";
      if (dotEl) dotEl.style.backgroundColor = "var(--danger)";
    }
  } catch {
    statusEl.textContent = "Disconnected";
    if (dotEl) dotEl.style.backgroundColor = "var(--danger)";
  }
}

// =========================================================================
// 3. ANIMATED COUNTERS & LOADING SKELETONS
// =========================================================================

function animateCounter(element, targetValue, duration = 800, suffix = "") {
  if (!element) return;
  const target = parseFloat(targetValue);
  if (isNaN(target)) { element.textContent = targetValue; return; }

  const startTime = performance.now();
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeProgress = 1 - (1 - progress) * (1 - progress);
    const currentVal = target % 1 !== 0
      ? (target * easeProgress).toFixed(1)
      : Math.round(target * easeProgress);
    element.textContent = `${currentVal}${suffix}`;
    if (progress < 1) requestAnimationFrame(update);
    else element.textContent = `${target}${suffix}`;
  }
  requestAnimationFrame(update);
}

function renderStudentSkeleton() {
  const container = document.getElementById("overview-content-wrapper") || document.getElementById("student-results-container");
  if (!container) return;
  container.innerHTML = `
    <div class="skeleton-container">
      <div class="skeleton-loading-header">
        <div class="skeleton-shimmer" style="height:18px; width:200px; border-radius:6px;"></div>
        <div class="skeleton-shimmer" style="height:14px; width:140px; border-radius:6px;"></div>
      </div>
      <div class="skeleton-stat-grid">
        <div class="skeleton-shimmer skeleton-stat-box"></div>
        <div class="skeleton-shimmer skeleton-stat-box"></div>
        <div class="skeleton-shimmer skeleton-stat-box"></div>
        <div class="skeleton-shimmer skeleton-stat-box"></div>
      </div>
      <div class="skeleton-shimmer skeleton-line" style="height:52px; margin-top:1rem; border-radius:8px;"></div>
      <div class="skeleton-chart-grid" style="margin-top:1rem;">
        <div class="skeleton-shimmer skeleton-chart-box"></div>
        <div class="skeleton-shimmer skeleton-chart-box"></div>
        <div class="skeleton-shimmer skeleton-chart-box"></div>
      </div>
    </div>
  `;
}

function renderHRSkeleton() {
  const container = document.getElementById("hr-results-container");
  container.innerHTML = `
    <div class="skeleton-container">
      <div class="skeleton-stat-grid">
        <div class="skeleton-shimmer skeleton-stat-box"></div>
        <div class="skeleton-shimmer skeleton-stat-box"></div>
        <div class="skeleton-shimmer skeleton-stat-box"></div>
        <div class="skeleton-shimmer skeleton-stat-box"></div>
      </div>
      <div class="skeleton-chart-grid" style="margin-top:1rem;">
        <div class="skeleton-shimmer skeleton-chart-box"></div>
        <div class="skeleton-shimmer skeleton-chart-box"></div>
        <div class="skeleton-shimmer skeleton-chart-box"></div>
      </div>
      <div class="skeleton-shimmer skeleton-line" style="height:200px; margin-top:1.5rem;"></div>
    </div>
  `;
}

function showStudentError(message) {
  const errorBox = document.getElementById("student-input-error");
  if (errorBox) {
    errorBox.innerHTML = `⚠️ <strong>Analysis Error:</strong> ${escapeHtml(message)}`;
    errorBox.style.display = "flex";
  }
  const container = document.getElementById("overview-content-wrapper");
  if (container && !latestStudentAnalysisData) {
    container.innerHTML = `
      <div class="portal-error-state">
        <div class="portal-error-icon">⚠️</div>
        <h4 class="portal-error-title">Analysis Failed</h4>
        <p class="portal-error-desc">${escapeHtml(message)}</p>
        <button class="btn btn-secondary" style="margin-top:1rem; font-size:0.8rem;"
          onclick="navigateStudentSubpage('analysis')">
          ← Return to Ingestion Workstation
        </button>
      </div>
    `;
  }
}

function resetStudentResultsPanel() {
  latestStudentAnalysisData = null;
  latestStudentFilename = null;
  latestStudentMetadata = null;
  try {
    localStorage.removeItem("hirelens_latest_student_analysis");
  } catch (e) {}
  navigateStudentSubpage("analysis");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// =========================================================================
// 4. STUDENT PORTAL — INPUT HANDLING
// =========================================================================

function initStudentPortal() {
  const dropzone = document.getElementById("student-dropzone");
  const fileInput = document.getElementById("student-file-input");
  const analyzeBtn = document.getElementById("student-analyze-btn");

  if (dropzone && fileInput) {
    dropzone.addEventListener("click", () => fileInput.click());
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("drag-active");
    });
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-active"));
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("drag-active");
      const files = e.dataTransfer.files;
      if (files && files[0]) setStudentFile(files[0]);
    });

    fileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) setStudentFile(e.target.files[0]);
    });
  }

  if (analyzeBtn) {
    analyzeBtn.addEventListener("click", () => runStudentAnalysis());
  }

  // Restore cached student analysis if present
  try {
    const cached = localStorage.getItem("hirelens_latest_student_analysis");
    if (cached) {
      const parsed = JSON.parse(cached);
      latestStudentAnalysisData = parsed.data || null;
      latestStudentFilename = parsed.filename || null;
      latestStudentMetadata = parsed.metadata || null;
      const chip = document.getElementById("student-active-filename-chip");
      if (chip && latestStudentFilename) {
        chip.textContent = "📎 " + latestStudentFilename;
        chip.style.display = "inline-block";
      }
    }
    const hist = localStorage.getItem("hirelens_student_history");
    if (hist) {
      studentAnalysisHistory = JSON.parse(hist) || [];
    }
  } catch (e) {
    console.warn("Could not parse cached student data:", e);
  }

  // Bind hash routing and run initial router pass
  window.addEventListener("hashchange", handleHashRouting);
  setTimeout(() => handleHashRouting(), 50);
}

function setStudentFile(file) {
  _studentSelectedFile = file;
  const badge = document.getElementById("student-file-badge");
  const nameEl = document.getElementById("student-file-name");
  const sizeEl = document.getElementById("student-file-size");
  const dropzone = document.getElementById("student-dropzone");

  if (badge && nameEl && sizeEl) {
    nameEl.textContent = file.name;
    sizeEl.textContent = `${(file.size / 1024).toFixed(1)} KB · ${file.type || "document"}`;
    badge.style.display = "flex";
    dropzone.style.display = "none";
  }
}

function clearStudentFile(event) {
  if (event) event.stopPropagation();
  _studentSelectedFile = null;
  const badge = document.getElementById("student-file-badge");
  const dropzone = document.getElementById("student-dropzone");
  const fileInput = document.getElementById("student-file-input");
  if (badge) badge.style.display = "none";
  if (dropzone) dropzone.style.display = "block";
  if (fileInput) fileInput.value = "";
}

function switchStudentInputMode(mode) {
  const uploadPane = document.getElementById("pane-student-upload");
  const pastePane = document.getElementById("pane-student-paste");
  const uploadBtn = document.getElementById("tab-mode-upload");
  const pasteBtn = document.getElementById("tab-mode-paste");

  if (mode === "upload") {
    uploadPane.style.display = "block";
    pastePane.style.display = "none";
    uploadBtn.classList.add("active");
    pasteBtn.classList.remove("active");
  } else {
    uploadPane.style.display = "none";
    pastePane.style.display = "block";
    pasteBtn.classList.add("active");
    uploadBtn.classList.remove("active");
  }
}

function applyStudentPreset(type) {
  const jdEl = document.getElementById("student-jd-input");
  const presets = {
    ds: "Seeking a Data Scientist proficient in Python, Machine Learning, Pandas, Scikit-Learn, and SQL. Responsible for predictive modeling, exploratory data analysis, and building machine learning pipelines.",
    backend: "Looking for a Backend Python Engineer with expertise in FastAPI, PostgreSQL, Docker, REST APIs, and Git. Experience in microservice architectures and CI/CD pipelines required.",
    frontend: "Frontend Engineer needed with strong skills in JavaScript, TypeScript, React, HTML, CSS, and modern web application development. Knowledge of REST APIs and UI performance optimization preferred.",
    ml: "ML Engineer role requiring TensorFlow, PyTorch, Python, Scikit-Learn, deep learning, NLP, and cloud deployment experience. Familiarity with MLOps and Docker containers preferred.",
    fullstack: "Full Stack Engineer proficient in React, Node.js, Python, PostgreSQL, Docker, REST API design, TypeScript, and cloud platforms (AWS/GCP). CI/CD and Agile experience required."
  };
  if (presets[type]) jdEl.value = presets[type];
}

function loadStudentSampleData(autoRun = false) {
  const SAMPLE_RESUME = `Jane Smith — Data Scientist
Email: jane.smith@email.com | Phone: (555) 987-6543
LinkedIn: linkedin.com/in/janesmith

EDUCATION
B.Tech in Computer Science (UG) — State Technical University, 2021

EXPERIENCE
Data Analyst Intern — TechCorp Analytics (2022–2023, 1.5 yrs)
- Built ETL pipelines with Python and Pandas reducing reporting lag by 40%
- Developed dashboards in Tableau for 3 business units
- Delivered predictive churn model using Scikit-Learn; achieved 87% accuracy

Junior Data Scientist — DataVenture Ltd (2023–Present, 1 yr)
- Built end-to-end NLP text classification pipeline with Hugging Face transformers
- Deployed 4 machine learning models on AWS SageMaker; improved pipeline throughput by 22%
- Collaborated in Agile sprints using Git, Jira, and CI/CD workflows

SKILLS
Python, Pandas, NumPy, Scikit-Learn, Machine Learning, Deep Learning, NLP,
SQL, PostgreSQL, Tableau, AWS, Docker, Git, REST API, Data Science, Matplotlib

PROJECTS
Resume Intelligence Engine — Applied TF-IDF vectorization and SVC classification to rank 30+ resumes.
Predictive Revenue Model — Reduced forecasting RMSE by 18% using ensemble gradient boosting.`;

  const pasteInput = document.getElementById("student-resume-text-input");
  const jdInput = document.getElementById("student-jd-input");

  switchStudentInputMode("paste");
  if (pasteInput) pasteInput.value = SAMPLE_RESUME;
  if (jdInput) {
    jdInput.value = "Seeking a Data Scientist proficient in Python, Machine Learning, Scikit-Learn, Pandas, and SQL. Experience in predictive modeling, exploratory data analysis, NLP, and cloud deployment required.";
  }

  if (autoRun) {
    setTimeout(() => runStudentAnalysis(), 150);
  }
}

// =========================================================================
// 5. STUDENT PORTAL — INDEPENDENT SUBPAGE ROUTER & RENDERING
// =========================================================================

const STUDENT_SUBPAGE_METADATA = {
  overview: {
    breadcrumb: "Student Portal / Overview",
    title: "Candidate Diagnostic Overview",
    desc: "High-level candidate readiness, composite scoring, and key diagnostic indicators."
  },
  analysis: {
    breadcrumb: "Student Portal / Resume Analysis",
    title: "Resume Ingestion & Analysis Workstation",
    desc: "Ingest resume documents or raw text against target job descriptions and verify extracted metadata."
  },
  match: {
    breadcrumb: "Student Portal / Match Results",
    title: "Job Match & Semantic Diagnostics",
    desc: "Detailed algorithmic match percentage, legacy ML baseline comparison, and skill overlap."
  },
  ats: {
    breadcrumb: "Student Portal / ATS Readiness",
    title: "ATS Compatibility & Structural Audit",
    desc: "Section-by-section structural parsing health, deduction audit, and ATS formatting guidelines."
  },
  improvements: {
    breadcrumb: "Student Portal / Resume Improvements",
    title: "Actionable Resume Improvements",
    desc: "Clear recommendations on what to add, remove, and improve to maximize shortlist odds."
  },
  roadmap: {
    breadcrumb: "Student Portal / Skill Gap Roadmap",
    title: "Prioritized Skill Gap Roadmap",
    desc: "Ordered optimization steps and keyword integration checklist for missing competencies."
  },
  interview: {
    breadcrumb: "Student Portal / Interview Preparation",
    title: "Targeted Interview Preparation",
    desc: "Role-specific technical questions, skill gap defense strategies, and STAR method response blueprints."
  },
  history: {
    breadcrumb: "Student Portal / History & Reports",
    title: "Analysis History & Exportable Reports",
    desc: "Review previous resume evaluations, reload historical runs, and download or print audit reports."
  }
};

function navigateStudentSubpage(pageKey, updateHash = true) {
  const validKey = STUDENT_SUBPAGE_METADATA[pageKey] ? pageKey : "overview";
  currentStudentSubpage = validKey;

  if (updateHash) {
    window.location.hash = `#/student/${validKey}`;
  }

  // Update sidebar active state
  document.querySelectorAll("#sidebar-student-menu .sidebar-item").forEach(item => {
    const spage = item.getAttribute("data-spage");
    item.classList.toggle("active", spage === validKey);
  });

  // Switch visible subpage container
  document.querySelectorAll(".student-subpage").forEach(page => {
    const isTarget = page.id === `spage-${validKey}`;
    page.classList.toggle("active-subpage", isTarget);
  });

  // Update persistent header & breadcrumbs
  const meta = STUDENT_SUBPAGE_METADATA[validKey];
  const breadcrumbEl = document.getElementById("student-breadcrumb");
  const titleEl = document.getElementById("student-subpage-title");
  const descEl = document.getElementById("student-subpage-desc");
  const chipEl = document.getElementById("student-active-filename-chip");

  if (breadcrumbEl) breadcrumbEl.textContent = meta.breadcrumb;
  if (titleEl) titleEl.textContent = meta.title;
  if (descEl) descEl.textContent = meta.desc;

  if (chipEl) {
    if (latestStudentFilename) {
      chipEl.textContent = "📎 " + latestStudentFilename;
      chipEl.style.display = "inline-block";
    } else {
      chipEl.style.display = "none";
    }
  }

  // Scroll main view to top smoothly on page transition
  const mainEl = document.querySelector(".dashboard-main");
  if (mainEl) mainEl.scrollTop = 0;

  // Render the active subpage content
  switch (validKey) {
    case "overview":
      renderStudentOverview();
      break;
    case "analysis":
      renderStudentAnalysisWorkstation();
      break;
    case "match":
      renderStudentMatchResults();
      break;
    case "ats":
      renderStudentATS();
      break;
    case "improvements":
      renderStudentImprovements();
      break;
    case "roadmap":
      renderStudentRoadmap();
      break;
    case "interview":
      renderStudentInterview();
      break;
    case "history":
      renderStudentHistory();
      break;
  }
}

function handleHashRouting() {
  const hash = window.location.hash || "";
  if (hash.startsWith("#hr")) {
    switchPortal("hr", false);
    return;
  }
  if (hash.startsWith("#/student/") || hash.startsWith("#student/")) {
    const rawKey = hash.replace(/^#\/?student\//, "").split("?")[0].trim().toLowerCase();
    switchPortal("student", false);
    navigateStudentSubpage(rawKey || "overview", false);
    return;
  }
  if (hash === "#student" || hash === "#/student" || !hash) {
    if (currentUser && currentUser.role === "hr") {
      switchPortal("hr", false);
    } else {
      switchPortal("student", false);
      navigateStudentSubpage(currentStudentSubpage || "overview", false);
    }
  }
}

async function runStudentAnalysis() {
  const jdInput = document.getElementById("student-jd-input");
  const jdText = jdInput ? jdInput.value.trim() : "";
  const errorBox = document.getElementById("student-input-error");
  const analyzeBtn = document.getElementById("student-analyze-btn");

  if (!jdText) {
    if (errorBox) {
      errorBox.innerHTML = "⚠️ A target Job Description is required for analysis.";
      errorBox.style.display = "flex";
    }
    navigateStudentSubpage("analysis", true);
    if (jdInput) jdInput.focus();
    return;
  }
  if (errorBox) errorBox.style.display = "none";

  const pastePane = document.getElementById("pane-student-paste");
  const pasteInput = document.getElementById("student-resume-text-input");
  const isInPasteMode = pastePane && pastePane.style.display !== "none";

  if (isInPasteMode && !_studentSelectedFile) {
    const pasteText = pasteInput ? pasteInput.value.trim() : "";
    if (!pasteText) {
      if (errorBox) {
        errorBox.innerHTML = "⚠️ Please paste your resume text or switch to file upload mode.";
        errorBox.style.display = "flex";
      }
      navigateStudentSubpage("analysis", true);
      return;
    }
  }

  if (analyzeBtn) {
    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      Analyzing Resume & Skills…
    `;
  }
  renderStudentSkeleton();

  try {
    let response;
    const authHeaders = getAuthHeaders(false);

    if (_studentSelectedFile) {
      const formData = new FormData();
      formData.append("file", _studentSelectedFile);
      formData.append("job_description", jdText);
      response = await fetch("/api/student/analytics", {
        method: "POST",
        headers: authHeaders,
        body: formData
      });
    } else {
      const pasteText = pasteInput ? pasteInput.value.trim() : "";
      response = await fetch("/api/student/analytics", {
        method: "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          resume_text: pasteText,
          job_description: jdText,
          filename: "pasted_resume.txt"
        })
      });
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail || `Server error (${response.status})`);
    }

    const res = await response.json();
    renderStudentAnalytics(res.analytics, res.filename || "Resume", res.metadata);
    navigateStudentSubpage("overview", true);

  } catch (err) {
    console.error("Student analysis error:", err);
    showStudentError(err.message);
  } finally {
    if (analyzeBtn) {
      analyzeBtn.disabled = false;
      analyzeBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        Analyze Resume & Generate Roadmap
      `;
    }
  }
}

function renderStudentAnalytics(data, filename, metadata) {
  latestStudentAnalysisData = data;
  latestStudentFilename = filename || "Resume";
  latestStudentMetadata = metadata || (data && data.metadata) || null;

  try {
    localStorage.setItem("hirelens_latest_student_analysis", JSON.stringify({
      data: latestStudentAnalysisData,
      filename: latestStudentFilename,
      metadata: latestStudentMetadata
    }));

    const jdText = document.getElementById("student-jd-input")?.value || "";
    const histItem = {
      id: "run_" + Date.now(),
      timestamp: new Date().toLocaleString([], { dateStyle: "short", timeStyle: "short" }),
      filename: latestStudentFilename,
      roleSummary: jdText.slice(0, 50).trim() || "Target Role",
      matchScore: data.overall_match_percentage || 0,
      atsScore: data.ats_readiness?.score || 0,
      matchedCount: data.skills_audit?.matched_skills?.length || 0,
      missingCount: data.skills_audit?.missing_skills?.length || 0,
      data: data,
      metadata: latestStudentMetadata
    };
    studentAnalysisHistory.unshift(histItem);
    if (studentAnalysisHistory.length > 20) studentAnalysisHistory.pop();
    localStorage.setItem("hirelens_student_history", JSON.stringify(studentAnalysisHistory));
  } catch (e) {
    console.warn("Could not save to localStorage:", e);
  }
}

// -------------------------------------------------------------------------
// PAGE 1: OVERVIEW
// -------------------------------------------------------------------------
function renderStudentOverview() {
  const wrapper = document.getElementById("overview-content-wrapper");
  if (!wrapper) return;

  if (!latestStudentAnalysisData) {
    wrapper.innerHTML = `
      <div class="subpage-empty-card">
        <div class="subpage-empty-icon">📊</div>
        <h4>No Diagnostics Run Yet</h4>
        <p>Upload a resume and specify target job requirements to generate your candidate readiness profile and detailed diagnostics.</p>
        <div style="margin-top: 1.25rem; display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
          <button type="button" class="btn btn-primary" onclick="navigateStudentSubpage('analysis')">
            Go to Resume Analysis
          </button>
          <button type="button" class="btn btn-secondary" onclick="loadStudentSampleData(true)">
            ⚡ Test with Sample Resume
          </button>
        </div>
      </div>
    `;
    return;
  }

  const d = latestStudentAnalysisData;
  const overallMatch = d.overall_match_percentage || 0;
  const ats = d.ats_readiness || { score: 0, category: "Unknown", issues: [] };
  const skillsAudit = d.skills_audit || { matched_skills: [], missing_skills: [], additional_skills: [] };
  const meta = latestStudentMetadata || {};

  const matchColor = overallMatch >= 65 ? "var(--success)" : overallMatch >= 40 ? "var(--blue-primary)" : "var(--danger)";
  const atsColor = ats.score >= 80 ? "var(--success)" : ats.score >= 50 ? "var(--warning)" : "var(--danger)";

  wrapper.innerHTML = `
    <!-- Candidate Profile Banner -->
    <div class="profile-summary-grid">
      <div class="profile-metric">
        <div class="profile-metric-label">Analyzed Document</div>
        <div class="profile-metric-value" style="font-size:0.9rem;">📎 ${escapeHtml(latestStudentFilename || "Resume")}</div>
      </div>
      <div class="profile-metric">
        <div class="profile-metric-label">Candidate Contact</div>
        <div class="profile-metric-value">${escapeHtml(meta.email || "Email not detected")}</div>
      </div>
      <div class="profile-metric">
        <div class="profile-metric-label">Detected Education</div>
        <div class="profile-metric-value">${escapeHtml(meta.detected_degree || "UG Degree")}</div>
      </div>
      <div class="profile-metric">
        <div class="profile-metric-label">Detected Experience</div>
        <div class="profile-metric-value">${meta.detected_yoe !== undefined ? meta.detected_yoe + " Years" : "0 Years"}</div>
      </div>
    </div>

    <!-- 4 KPI Stat Cards -->
    <div class="stats-row" style="margin-bottom: 1.25rem;">
      <div class="stat-card stat-card-highlight" style="border-top: 3px solid ${matchColor}; cursor: pointer;" onclick="navigateStudentSubpage('match')">
        <div class="stat-label">Overall Job Match</div>
        <div class="stat-value" id="st-counter-match" style="color:${matchColor};">0%</div>
        <div class="stat-desc">60% Skills + 40% Semantic</div>
      </div>
      <div class="stat-card stat-card-highlight" style="border-top: 3px solid ${atsColor}; cursor: pointer;" onclick="navigateStudentSubpage('ats')">
        <div class="stat-label">ATS Readiness</div>
        <div class="stat-value" id="st-counter-ats" style="color:${atsColor};">0</div>
        <div class="stat-desc">Status: ${escapeHtml(ats.category)}</div>
      </div>
      <div class="stat-card stat-card-highlight" style="border-top: 3px solid var(--success); cursor: pointer;" onclick="navigateStudentSubpage('match')">
        <div class="stat-label">Skills Matched</div>
        <div class="stat-value" id="st-counter-matched" style="color:var(--success);">0</div>
        <div class="stat-desc">Target keywords found</div>
      </div>
      <div class="stat-card stat-card-highlight" style="border-top: 3px solid var(--danger); cursor: pointer;" onclick="navigateStudentSubpage('roadmap')">
        <div class="stat-label">Skills Missing</div>
        <div class="stat-value" id="st-counter-missing" style="color:var(--danger);">0</div>
        <div class="stat-desc">Critical gaps to fill</div>
      </div>
    </div>

    <!-- Match Formula Card -->
    <div class="formula-explainer" style="margin-bottom: 1.25rem;">
      <div class="formula-explainer-icon">📐</div>
      <div style="flex:1;">
        <div class="formula-explainer-title">Transparent Weighted Match Formulation</div>
        <div class="formula-explainer-body">${escapeHtml(d.match_calculation_explanation || "")}</div>
      </div>
      <button class="btn btn-secondary" style="font-size:0.75rem; padding: 0.35rem 0.65rem; align-self: center;" onclick="navigateStudentSubpage('match')">
        Inspect Match Breakdown →
      </button>
    </div>

    <!-- Charts & Diagnostic Radar -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; margin-bottom: 1.5rem;">
      <div class="chart-card">
        <h4>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          Multi-Metric Diagnostic Breakdown
        </h4>
        <div class="chart-container" style="height: 240px;"><canvas id="chart-student-radar"></canvas></div>
      </div>
      <div class="card-panel">
        <div class="card-header">
          <h3>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            Top Priority Recommendation
          </h3>
        </div>
        <div class="card-body" style="display:flex; flex-direction:column; justify-content:space-between;">
          ${d.prioritized_steps && d.prioritized_steps.length ? `
            <div>
              <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem;">
                <span class="action-plan-priority-badge priority-high">P1 High</span>
                <strong style="color:var(--navy-dark); font-size:0.95rem;">${escapeHtml(d.prioritized_steps[0].title)}</strong>
              </div>
              <p style="font-size:0.825rem; color:var(--text-muted); line-height:1.5;">${escapeHtml(d.prioritized_steps[0].description)}</p>
            </div>
          ` : `
            <p style="font-size:0.85rem; color:var(--text-muted);">Resume coverage looks well-balanced across target requirements.</p>
          `}
          <div style="margin-top:1rem; padding-top:0.75rem; border-top:1px solid var(--slate-border); display:flex; gap:0.5rem;">
            <button class="btn btn-primary" style="font-size:0.775rem; flex:1;" onclick="navigateStudentSubpage('roadmap')">
              View Complete Roadmap
            </button>
            <button class="btn btn-secondary" style="font-size:0.775rem; flex:1;" onclick="navigateStudentSubpage('improvements')">
              View Improvements
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Launch Hub -->
    <div style="margin-bottom: 0.5rem;">
      <h3 style="font-size: 1rem; color: var(--navy-dark); margin-bottom: 0.75rem;">Explore Diagnostic Modules</h3>
      <div class="quick-launch-grid">
        <div class="quick-launch-card" onclick="navigateStudentSubpage('match')">
          <div>
            <div class="quick-launch-icon">🎯</div>
            <div class="quick-launch-title">Match Results</div>
            <div class="quick-launch-desc">Semantic similarity score, ML baseline comparison, and matched keywords.</div>
          </div>
          <span style="font-size:0.75rem; color:var(--blue-primary); font-weight:600; margin-top:0.5rem;">Open Module →</span>
        </div>
        <div class="quick-launch-card" onclick="navigateStudentSubpage('ats')">
          <div>
            <div class="quick-launch-icon">🛡️</div>
            <div class="quick-launch-title">ATS Readiness</div>
            <div class="quick-launch-desc">Structural audit, section header validation, and point deductions.</div>
          </div>
          <span style="font-size:0.75rem; color:var(--blue-primary); font-weight:600; margin-top:0.5rem;">Open Module →</span>
        </div>
        <div class="quick-launch-card" onclick="navigateStudentSubpage('improvements')">
          <div>
            <div class="quick-launch-icon">⚡</div>
            <div class="quick-launch-title">Resume Improvements</div>
            <div class="quick-launch-desc">Actionable checklist of what to add, remove, and improve.</div>
          </div>
          <span style="font-size:0.75rem; color:var(--blue-primary); font-weight:600; margin-top:0.5rem;">Open Module →</span>
        </div>
        <div class="quick-launch-card" onclick="navigateStudentSubpage('roadmap')">
          <div>
            <div class="quick-launch-icon">🗺️</div>
            <div class="quick-launch-title">Skill Gap Roadmap</div>
            <div class="quick-launch-desc">Prioritized steps and missing keyword action checklist.</div>
          </div>
          <span style="font-size:0.75rem; color:var(--blue-primary); font-weight:600; margin-top:0.5rem;">Open Module →</span>
        </div>
        <div class="quick-launch-card" onclick="navigateStudentSubpage('interview')">
          <div>
            <div class="quick-launch-icon">🎙️</div>
            <div class="quick-launch-title">Interview Prep</div>
            <div class="quick-launch-desc">Targeted technical questions, skill gap defense, and STAR framework.</div>
          </div>
          <span style="font-size:0.75rem; color:var(--blue-primary); font-weight:600; margin-top:0.5rem;">Open Module →</span>
        </div>
        <div class="quick-launch-card" onclick="navigateStudentSubpage('history')">
          <div>
            <div class="quick-launch-icon">📁</div>
            <div class="quick-launch-title">History &amp; Reports</div>
            <div class="quick-launch-desc">Review previous evaluations, reload past runs, and download reports.</div>
          </div>
          <span style="font-size:0.75rem; color:var(--blue-primary); font-weight:600; margin-top:0.5rem;">Open Module →</span>
        </div>
      </div>
    </div>
  `;

  // Animate KPI counters
  animateCounter(document.getElementById("st-counter-match"), overallMatch, 850, "%");
  animateCounter(document.getElementById("st-counter-ats"), ats.score, 850, "/100");
  animateCounter(document.getElementById("st-counter-matched"), skillsAudit.matched_skills.length, 650);
  animateCounter(document.getElementById("st-counter-missing"), skillsAudit.missing_skills.length, 650);

  // Render Diagnostic Radar / Bar Chart
  const radarData = d.charts?.score_radar || { labels: [], values: [] };
  if (radarData.labels && radarData.labels.length) {
    renderChartSafely("chart-student-radar", "radar", {
      labels: radarData.labels,
      datasets: [{
        label: "Candidate Readiness Index (%)",
        data: radarData.values,
        backgroundColor: "rgba(37, 99, 235, 0.2)",
        borderColor: "rgba(37, 99, 235, 1)",
        pointBackgroundColor: "rgba(37, 99, 235, 1)",
        pointBorderColor: "#fff",
        pointHoverBackgroundColor: "#fff",
        pointHoverBorderColor: "rgba(37, 99, 235, 1)",
        borderWidth: 2
      }]
    }, {
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          ticks: { stepSize: 25, font: { size: 9 }, display: false },
          pointLabels: { font: { size: 10, weight: "bold" }, color: "#1e293b" }
        }
      },
      plugins: {
        legend: { display: false }
      }
    });
  }
}

// -------------------------------------------------------------------------
// PAGE 2: RESUME ANALYSIS (INGESTION WORKSTATION)
// -------------------------------------------------------------------------
function renderStudentAnalysisWorkstation() {
  const metaContainer = document.getElementById("analysis-metadata-container");
  if (!metaContainer) return;

  if (!latestStudentAnalysisData) {
    metaContainer.innerHTML = `
      <div class="subpage-empty-card" style="margin: 0; padding: 2.5rem 1rem;">
        <div class="subpage-empty-icon">📄</div>
        <h4>No Document Analyzed Yet</h4>
        <p>Submit your resume to view deterministic metadata extraction (Degree level, YOE, contact info, and word count).</p>
      </div>
    `;
    return;
  }

  const d = latestStudentAnalysisData;
  const meta = latestStudentMetadata || {};
  const ats = d.ats_readiness || {};
  const depthIssue = (ats.issues || []).find(i => i.component === "Content Depth");

  metaContainer.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:1rem;">
      <div class="profile-summary-grid" style="margin-bottom:0;">
        <div class="profile-metric">
          <div class="profile-metric-label">Parsed Filename</div>
          <div class="profile-metric-value" style="font-size:0.85rem;">📎 ${escapeHtml(latestStudentFilename || "pasted_resume.txt")}</div>
        </div>
        <div class="profile-metric">
          <div class="profile-metric-label">Detected Email</div>
          <div class="profile-metric-value">${escapeHtml(meta.email || "Not detected")}</div>
        </div>
        <div class="profile-metric">
          <div class="profile-metric-label">Detected Phone</div>
          <div class="profile-metric-value">${escapeHtml(meta.phone || "Not detected")}</div>
        </div>
        <div class="profile-metric">
          <div class="profile-metric-label">Education Qualification</div>
          <div class="profile-metric-value">${escapeHtml(meta.detected_degree || "UG")}</div>
        </div>
      </div>

      <div style="background:#f8fafc; border:1px solid var(--slate-border); border-radius:var(--radius-md); padding:1rem;">
        <h4 style="font-size:0.85rem; color:var(--navy-dark); margin-bottom:0.6rem;">Parsing &amp; Structural Health</h4>
        <div style="font-size:0.8rem; color:var(--text-muted); line-height:1.6;">
          <div>&bull; <strong>Detected Experience:</strong> ${meta.detected_yoe !== undefined ? meta.detected_yoe + " years" : "0 years"}</div>
          <div>&bull; <strong>Document Word Count:</strong> ${escapeHtml(depthIssue ? depthIssue.detail : "Adequate length")}</div>
          <div>&bull; <strong>Skills Identified:</strong> ${d.skills_audit?.matched_skills?.length || 0} matched &bull; ${d.skills_audit?.missing_skills?.length || 0} missing</div>
          <div>&bull; <strong>ATS Compliance:</strong> ${ats.score || 0}/100 (${escapeHtml(ats.category || "Moderate")})</div>
        </div>
      </div>

      <div style="display:flex; gap:0.75rem; justify-content:flex-end;">
        <button class="btn btn-secondary" style="font-size:0.775rem;" onclick="loadStudentSampleData(true)">
          ⚡ Reload Sample Resume
        </button>
        <button class="btn btn-primary" style="font-size:0.775rem;" onclick="navigateStudentSubpage('match')">
          View Match Results →
        </button>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------------------
// PAGE 3: MATCH RESULTS
// -------------------------------------------------------------------------
function renderStudentMatchResults() {
  const wrapper = document.getElementById("match-content-wrapper");
  if (!wrapper) return;

  if (!latestStudentAnalysisData) {
    wrapper.innerHTML = `
      <div class="subpage-empty-card">
        <div class="subpage-empty-icon">🎯</div>
        <h4>No Match Results Available</h4>
        <p>Run a resume evaluation to view detailed skill matching, semantic similarity, and ML baseline predictions.</p>
        <button class="btn btn-primary" style="margin-top:1rem;" onclick="navigateStudentSubpage('analysis')">
          Go to Resume Analysis
        </button>
      </div>
    `;
    return;
  }

  const d = latestStudentAnalysisData;
  const overallMatch = d.overall_match_percentage || 0;
  const skillsAudit = d.skills_audit || { matched_skills: [], missing_skills: [], additional_skills: [] };
  const legacy = d.legacy_model_baseline || {};
  const matchColor = overallMatch >= 65 ? "var(--success)" : overallMatch >= 40 ? "var(--blue-primary)" : "var(--danger)";

  wrapper.innerHTML = `
    <!-- Top Match Score Hero -->
    <div class="formula-explainer" style="border-left: 4px solid ${matchColor}; margin-bottom: 1.25rem;">
      <div class="formula-explainer-icon" style="font-size: 2rem;">🎯</div>
      <div style="flex:1;">
        <div style="display:flex; align-items:center; gap:0.75rem;">
          <span style="font-size:1.85rem; font-weight:800; color:${matchColor};">${overallMatch}%</span>
          <span style="font-size:0.9rem; font-weight:700; color:var(--navy-dark);">Overall Role Compatibility</span>
        </div>
        <div class="formula-explainer-body" style="margin-top:0.35rem;">${escapeHtml(d.match_calculation_explanation || "")}</div>
      </div>
    </div>

    <!-- Legacy Model Comparison Card -->
    ${legacy.available ? `
      <div style="background:#f8fafc; border:1px solid var(--slate-border); border-radius:var(--radius-md); padding:1rem; margin-bottom:1.25rem; display:flex; align-items:center; gap:0.75rem;">
        <div style="font-size:1.5rem;">🤖</div>
        <div style="flex:1;">
          <div style="font-size:0.85rem; font-weight:700; color:var(--navy-dark);">
            Legacy ML Model Baseline (TF-IDF + SVC)
            <span style="font-size:0.75rem; margin-left:0.5rem; color:${legacy.matched ? "var(--success)" : "var(--danger)"}; font-weight:600;">
              ${legacy.matched ? "✅ Confirmed Match" : "❌ Sub-threshold Baseline"}
            </span>
          </div>
          <div style="font-size:0.775rem; color:var(--text-muted); margin-top:0.2rem;">
            Vocabulary Overlap: <strong>${legacy.vocab_overlap_count || 0} tokens</strong>. ${escapeHtml(legacy.note || "")}
          </div>
        </div>
      </div>
    ` : ""}

    <!-- Visualizations Grid -->
    <div class="charts-grid" style="margin-bottom: 1.5rem;">
      <div class="chart-card">
        <h4>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          Skill Category Distribution
        </h4>
        <div class="chart-container" style="height:210px;"><canvas id="chart-student-skills-bar"></canvas></div>
      </div>
      <div class="chart-card">
        <h4>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>
          Matched vs Missing Ratio
        </h4>
        <div class="chart-container" style="height:210px;"><canvas id="chart-student-skills-doughnut"></canvas></div>
      </div>
    </div>

    <!-- Matched Skills Catalog -->
    <div class="results-section" style="margin-bottom: 1.25rem;">
      <div class="section-header-row">
        <h4 class="section-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
          Matched Target Skills (${skillsAudit.matched_skills.length})
        </h4>
      </div>
      <div class="skill-tag-group">
        ${skillsAudit.matched_skills.length
          ? skillsAudit.matched_skills.map(s => `<span class="skill-tag tag-matched">✓ ${escapeHtml(s)}</span>`).join("")
          : `<span style="font-size:0.8rem; color:var(--text-light);">No direct skill matches detected for this job specification.</span>`}
      </div>
    </div>

    <!-- Additional Skills Detected -->
    ${skillsAudit.additional_skills && skillsAudit.additional_skills.length ? `
      <div class="results-section" style="margin-bottom: 1.25rem;">
        <div class="section-header-row">
          <h4 class="section-title" style="color:var(--blue-primary);">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            Additional Candidate Skills Detected (${skillsAudit.additional_skills.length})
          </h4>
        </div>
        <div class="skill-tag-group">
          ${skillsAudit.additional_skills.map(s => `<span class="skill-tag" style="background:var(--blue-soft); color:var(--blue-primary); border:1px solid var(--blue-border);">+ ${escapeHtml(s)}</span>`).join("")}
        </div>
      </div>
    ` : ""}

    <div style="display:flex; justify-content:flex-end; margin-top:1.5rem;">
      <button class="btn btn-primary" onclick="navigateStudentSubpage('ats')">
        Proceed to ATS Readiness →
      </button>
    </div>
  `;

  // Render Charts
  const charts = d.charts || {};
  if (charts.skills_bar) {
    renderChartSafely("chart-student-skills-bar", "bar", {
      labels: charts.skills_bar.labels,
      datasets: [{
        label: "Count",
        data: charts.skills_bar.values,
        backgroundColor: charts.skills_bar.colors,
        borderRadius: 5
      }]
    }, {
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
    });
  }

  if (charts.skills_doughnut) {
    const matched = skillsAudit.matched_skills.length;
    const missing = skillsAudit.missing_skills.length;
    renderChartSafely("chart-student-skills-doughnut", "doughnut", {
      labels: ["Matched", "Missing"],
      datasets: [{
        data: [matched, missing],
        backgroundColor: ["#16a34a", "#dc2626"],
        borderWidth: 2,
        borderColor: "#ffffff"
      }]
    }, {
      cutout: "65%",
      plugins: { legend: { display: true, position: "bottom" } }
    });
  }
}

// -------------------------------------------------------------------------
// PAGE 4: ATS READINESS
// -------------------------------------------------------------------------
function renderStudentATS() {
  const wrapper = document.getElementById("ats-content-wrapper");
  if (!wrapper) return;

  if (!latestStudentAnalysisData) {
    wrapper.innerHTML = `
      <div class="subpage-empty-card">
        <div class="subpage-empty-icon">🛡️</div>
        <h4>No ATS Audit Available</h4>
        <p>Run a resume evaluation to review structural parsing health and point deduction analysis.</p>
        <button class="btn btn-primary" style="margin-top:1rem;" onclick="navigateStudentSubpage('analysis')">
          Go to Resume Analysis
        </button>
      </div>
    `;
    return;
  }

  const d = latestStudentAnalysisData;
  const ats = d.ats_readiness || { score: 0, category: "Unknown", issues: [] };
  const atsBadgeStyle = ats.score >= 80
    ? "background:var(--success-bg); color:var(--success); border-color:var(--success-border);"
    : ats.score >= 50
    ? "background:var(--warning-bg); color:var(--warning); border-color:var(--warning-border);"
    : "background:var(--danger-bg); color:var(--danger); border-color:var(--danger-border);";

  wrapper.innerHTML = `
    <!-- ATS Score Header Card -->
    <div class="section-header-row" style="background:#ffffff; border:1px solid var(--slate-border); padding:1rem 1.25rem; border-radius:var(--radius-md); margin-bottom:1.25rem;">
      <div>
        <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">Overall ATS Parser Compatibility</div>
        <div style="font-size:1.75rem; font-weight:800; color:var(--navy-dark);">${ats.score}/100</div>
      </div>
      <span class="section-score-badge" style="font-size:0.85rem; padding:0.35rem 0.85rem; ${atsBadgeStyle}">
        ${escapeHtml(ats.category)} Compatibility Tier
      </span>
    </div>

    <!-- Component-by-Component Structural Audit -->
    <div class="results-section" style="margin-bottom:1.5rem;">
      <div class="section-header-row">
        <h4 class="section-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          Structural Parsing Checklist &amp; Deduction Breakdown
        </h4>
      </div>
      <div class="ats-issue-list">
        ${ats.issues.map(iss => `
          <div class="ats-issue-item ${iss.deduction === 0 ? "passed" : "failed"}">
            <span style="font-size:1.25rem; flex-shrink:0;">${iss.deduction === 0 ? "✅" : "⚠️"}</span>
            <div style="flex:1;">
              <div style="font-weight:600; color:var(--navy-dark); font-size:0.85rem;">
                ${escapeHtml(iss.component)}
                <span style="font-size:0.75rem; margin-left:0.5rem; color:${iss.deduction === 0 ? "var(--success)" : "var(--danger)"}; font-weight:700;">
                  ${iss.status} (${iss.deduction === 0 ? "+Full Credit" : "-" + iss.deduction + " pts"})
                </span>
              </div>
              <div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.25rem;">${escapeHtml(iss.detail)}</div>
            </div>
          </div>
        `).join("")}
      </div>
    </div>

    <!-- ATS Best Practice Guidance -->
    <div style="background:#f8fafc; border:1px solid var(--slate-border); border-radius:var(--radius-md); padding:1.25rem;">
      <h4 style="font-size:0.875rem; color:var(--navy-dark); margin-bottom:0.75rem;">ATS Optimization Best Practices</h4>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; font-size:0.8rem; color:var(--text-muted);">
        <div>
          <strong style="color:var(--navy-dark);">&bull; Section Labeling:</strong> Use canonical headers such as <em>Education</em>, <em>Work Experience</em>, <em>Technical Skills</em>, and <em>Projects</em> so parsers index entries accurately.
        </div>
        <div>
          <strong style="color:var(--navy-dark);">&bull; Metric Impact:</strong> ATS scoring filters favor bullet points containing percentages (%), cost savings ($), or latency metrics.
        </div>
      </div>
    </div>

    <div style="display:flex; justify-content:flex-end; margin-top:1.5rem;">
      <button class="btn btn-primary" onclick="navigateStudentSubpage('improvements')">
        See Actionable Improvements →
      </button>
    </div>
  `;
}

// -------------------------------------------------------------------------
// PAGE 5: RESUME IMPROVEMENTS
// -------------------------------------------------------------------------
function renderStudentImprovements() {
  const wrapper = document.getElementById("improvements-content-wrapper");
  if (!wrapper) return;

  if (!latestStudentAnalysisData) {
    wrapper.innerHTML = `
      <div class="subpage-empty-card">
        <div class="subpage-empty-icon">⚡</div>
        <h4>No Improvement Plan Available</h4>
        <p>Run a resume evaluation to generate targeted additions, removals, and enhancements.</p>
        <button class="btn btn-primary" style="margin-top:1rem;" onclick="navigateStudentSubpage('analysis')">
          Go to Resume Analysis
        </button>
      </div>
    `;
    return;
  }

  const improvements = latestStudentAnalysisData.resume_improvements || { add: [], remove: [], improve: [] };

  wrapper.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
      <p style="font-size:0.85rem; color:var(--text-muted); margin:0;">Targeted adjustments to improve keyword overlap and ATS parser readability.</p>
      <button class="btn btn-secondary" style="font-size:0.75rem; padding:0.35rem 0.7rem;" onclick="copyImprovementsToClipboard()">
        📋 Copy Action List
      </button>
    </div>

    <div class="recommendations-grid" style="margin-bottom:1.5rem;">
      <!-- ADD -->
      <div class="rec-card rec-add">
        <div class="rec-card-header">
          <span class="rec-icon">➕</span>
          <span class="rec-title">What to Add</span>
        </div>
        ${improvements.add && improvements.add.length
          ? improvements.add.map(item => `
            <div class="rec-item">
              <div class="rec-action">${escapeHtml(item.action)}</div>
              <div class="rec-items-list">${(item.items || []).map(i => `<span class="rec-chip">${escapeHtml(i)}</span>`).join("")}</div>
              <div class="rec-reason">${escapeHtml(item.reason)}</div>
            </div>`).join("")
          : `<p class="rec-empty">No critical missing additions detected.</p>`}
      </div>

      <!-- REMOVE -->
      <div class="rec-card rec-remove">
        <div class="rec-card-header">
          <span class="rec-icon">➖</span>
          <span class="rec-title">What to Remove</span>
        </div>
        ${improvements.remove && improvements.remove.length
          ? improvements.remove.map(item => `
            <div class="rec-item">
              <div class="rec-action">${escapeHtml(item.action)}</div>
              <div class="rec-items-list">${(item.items || []).map(i => `<span class="rec-chip rec-chip-danger">${escapeHtml(i)}</span>`).join("")}</div>
              <div class="rec-reason">${escapeHtml(item.reason)}</div>
            </div>`).join("")
          : `<p class="rec-empty">No redundant fluff or buzzwords flagged.</p>`}
      </div>

      <!-- IMPROVE -->
      <div class="rec-card rec-improve">
        <div class="rec-card-header">
          <span class="rec-icon">⚡</span>
          <span class="rec-title">What to Improve</span>
        </div>
        ${improvements.improve && improvements.improve.length
          ? improvements.improve.map(item => `
            <div class="rec-item">
              <div class="rec-action">${escapeHtml(item.action)}</div>
              <div class="rec-items-list">${(item.items || []).map(i => `<span class="rec-chip rec-chip-blue">${escapeHtml(i)}</span>`).join("")}</div>
              <div class="rec-reason">${escapeHtml(item.reason)}</div>
            </div>`).join("")
          : `<p class="rec-empty">Resume structure meets standard formatting guidelines.</p>`}
      </div>
    </div>

    <div style="display:flex; justify-content:flex-end;">
      <button class="btn btn-primary" onclick="navigateStudentSubpage('roadmap')">
        View Skill Gap Roadmap →
      </button>
    </div>
  `;
}

function copyImprovementsToClipboard() {
  if (!latestStudentAnalysisData) return;
  const imp = latestStudentAnalysisData.resume_improvements || {};
  let text = "HIRELENS AI — RESUME IMPROVEMENT CHECKLIST\n\n";

  text += "WHAT TO ADD:\n";
  (imp.add || []).forEach(a => { text += `• ${a.action}: ${a.items.join(', ')} (${a.reason})\n`; });
  text += "\nWHAT TO REMOVE:\n";
  (imp.remove || []).forEach(r => { text += `• ${r.action}: ${r.items.join(', ')} (${r.reason})\n`; });
  text += "\nWHAT TO IMPROVE:\n";
  (imp.improve || []).forEach(i => { text += `• ${i.action}: ${i.items.join(', ')} (${i.reason})\n`; });

  navigator.clipboard.writeText(text).then(() => {
    alert("Improvement checklist copied to clipboard!");
  }).catch(() => {
    prompt("Copy checklist below:", text);
  });
}

// -------------------------------------------------------------------------
// PAGE 6: SKILL GAP ROADMAP
// -------------------------------------------------------------------------
function renderStudentRoadmap() {
  const wrapper = document.getElementById("roadmap-content-wrapper");
  if (!wrapper) return;

  if (!latestStudentAnalysisData) {
    wrapper.innerHTML = `
      <div class="subpage-empty-card">
        <div class="subpage-empty-icon">🗺️</div>
        <h4>No Roadmap Available</h4>
        <p>Run a resume evaluation to view prioritized steps and keyword integration recommendations.</p>
        <button class="btn btn-primary" style="margin-top:1rem;" onclick="navigateStudentSubpage('analysis')">
          Go to Resume Analysis
        </button>
      </div>
    `;
    return;
  }

  const d = latestStudentAnalysisData;
  const steps = d.prioritized_steps || [];
  const skillsAudit = d.skills_audit || { missing_checklist: [] };

  wrapper.innerHTML = `
    <!-- Prioritized Optimization Action Plan -->
    <div class="results-section" style="margin-bottom:1.5rem;">
      <div class="section-header-row">
        <h4 class="section-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          Ordered Optimization Sequence
        </h4>
      </div>
      <div class="action-plan-list">
        ${steps.map((step, i) => `
          <div class="action-plan-item" style="animation-delay:${i * 80}ms;">
            <div class="action-plan-num">${step.priority}</div>
            <div class="action-plan-body">
              <div class="action-plan-title">${escapeHtml(step.title)}</div>
              <div class="action-plan-desc">${escapeHtml(step.description)}</div>
            </div>
            <div class="action-plan-priority-badge priority-${step.priority === 1 ? "high" : step.priority === 2 ? "mid" : "low"}">
              P${step.priority}
            </div>
          </div>
        `).join("")}
      </div>
    </div>

    <!-- Missing Keywords Checklist with Recommendations -->
    <div class="results-section" style="margin-bottom:1.5rem;">
      <div class="section-header-row">
        <h4 class="section-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Missing Target Keywords Checklist (${skillsAudit.missing_checklist?.length || 0})
        </h4>
      </div>
      ${skillsAudit.missing_checklist && skillsAudit.missing_checklist.length ? `
        <div class="missing-checklist">
          ${skillsAudit.missing_checklist.map(item => `
            <div class="checklist-item">
              <span class="checklist-badge ${item.importance === 'High' ? 'badge-high' : 'badge-medium'}">${item.importance}</span>
              <div class="checklist-content">
                <span class="checklist-skill">${escapeHtml(item.skill)}</span>
                <span class="checklist-tip">${escapeHtml(item.recommendation)}</span>
              </div>
            </div>
          `).join("")}
        </div>
      ` : `
        <p style="font-size:0.85rem; color:var(--success); padding:0.5rem 0;">🎉 All required keywords are present in your resume!</p>
      `}
    </div>

    <div style="display:flex; justify-content:flex-end;">
      <button class="btn btn-primary" onclick="navigateStudentSubpage('interview')">
        Prepare for Interview →
      </button>
    </div>
  `;
}

// -------------------------------------------------------------------------
// PAGE 7: INTERVIEW PREPARATION
// -------------------------------------------------------------------------
function renderStudentInterview() {
  const wrapper = document.getElementById("interview-content-wrapper");
  if (!wrapper) return;

  if (!latestStudentAnalysisData) {
    wrapper.innerHTML = `
      <div class="subpage-empty-card">
        <div class="subpage-empty-icon">🎙️</div>
        <h4>No Interview Prep Generated</h4>
        <p>Evaluate your resume against a target job to generate tailored technical and behavioral interview preparation.</p>
        <button class="btn btn-primary" style="margin-top:1rem;" onclick="navigateStudentSubpage('analysis')">
          Go to Resume Analysis
        </button>
      </div>
    `;
    return;
  }

  const d = latestStudentAnalysisData;
  const skillsAudit = d.skills_audit || { matched_skills: [], missing_skills: [] };
  const matched = skillsAudit.matched_skills || [];
  const missing = skillsAudit.missing_skills || [];

  // Generate tailored questions based on matched skills
  const technicalQuestions = matched.slice(0, 4).map(skill => ({
    skill: skill,
    question: `Can you explain how you utilized ${skill} in your recent projects, and describe a challenging edge-case or performance hurdle you solved?`,
    strategy: `Structure your answer with: 1) The business objective, 2) The architecture and role of ${skill}, 3) Specific libraries/methods used, and 4) Measured outcome.`
  }));

  // Generate defense strategies for missing skills
  const gapDefenses = missing.slice(0, 3).map(skill => ({
    skill: skill,
    question: `The job description emphasizes hands-on experience with ${skill}. How would you get up to speed quickly in this area?`,
    strategy: `Acknowledge that while ${skill} is not the central highlight of your past tenure, highlight closely related foundations, self-driven learning milestones, and your track record of mastering new tools in production.`
  }));

  wrapper.innerHTML = `
    <!-- Intro Banner -->
    <div style="background:#ffffff; border:1px solid var(--slate-border); padding:1rem 1.25rem; border-radius:var(--radius-md); margin-bottom:1.25rem;">
      <h3 style="font-size:1rem; color:var(--navy-dark); margin-bottom:0.25rem;">Targeted Interview Strategy</h3>
      <p style="font-size:0.8rem; color:var(--text-muted); margin:0;">
        These questions and defense talking points are derived from your resume's verified competencies (${matched.length} matched) and identified gaps (${missing.length} missing).
      </p>
    </div>

    <!-- Section 1: Technical Deep Dive Questions -->
    <div class="results-section" style="margin-bottom:1.5rem;">
      <div class="section-header-row">
        <h4 class="section-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          Technical Deep Dive Questions (Verified Skills)
        </h4>
      </div>
      ${technicalQuestions.length ? technicalQuestions.map(item => `
        <div class="interview-qa-item">
          <div class="interview-q-header">
            <span class="interview-badge">${escapeHtml(item.skill)}</span>
            <span class="interview-q-text">${escapeHtml(item.question)}</span>
          </div>
          <div class="interview-strategy-box">
            <strong>Recommended Strategy:</strong> ${escapeHtml(item.strategy)}
          </div>
        </div>
      `).join("") : `
        <p style="font-size:0.85rem; color:var(--text-muted);">No technical skills matched yet.</p>
      `}
    </div>

    <!-- Section 2: Skill Gap Defense Strategy -->
    ${gapDefenses.length ? `
      <div class="results-section" style="margin-bottom:1.5rem;">
        <div class="section-header-row">
          <h4 class="section-title" style="color:var(--danger);">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Skill Gap Defense Talking Points
          </h4>
        </div>
        ${gapDefenses.map(item => `
          <div class="interview-qa-item" style="border-left: 3px solid var(--danger);">
            <div class="interview-q-header">
              <span class="interview-badge" style="background:var(--danger-bg); color:var(--danger);">${escapeHtml(item.skill)} Gap</span>
              <span class="interview-q-text">${escapeHtml(item.question)}</span>
            </div>
            <div class="interview-strategy-box" style="border-left-color:var(--danger);">
              <strong>Defense Blueprint:</strong> ${escapeHtml(item.strategy)}
            </div>
          </div>
        `).join("")}
      </div>
    ` : ""}

    <!-- Section 3: STAR Framework Blueprint -->
    <div class="results-section" style="margin-bottom:1.5rem;">
      <div class="section-header-row">
        <h4 class="section-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          STAR Behavioral Framework Template
        </h4>
      </div>
      <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:0.75rem; font-size:0.8rem;">
        <div style="background:#ffffff; border:1px solid var(--slate-border); padding:0.75rem; border-radius:var(--radius-sm);">
          <strong style="color:var(--blue-primary); display:block; margin-bottom:0.25rem;">[S] Situation</strong>
          Set the context, team size, and business stakes concisely.
        </div>
        <div style="background:#ffffff; border:1px solid var(--slate-border); padding:0.75rem; border-radius:var(--radius-sm);">
          <strong style="color:var(--blue-primary); display:block; margin-bottom:0.25rem;">[T] Task</strong>
          Define your specific ownership and deliverable responsibility.
        </div>
        <div style="background:#ffffff; border:1px solid var(--slate-border); padding:0.75rem; border-radius:var(--radius-sm);">
          <strong style="color:var(--blue-primary); display:block; margin-bottom:0.25rem;">[A] Action</strong>
          Explain your execution, architectural decisions, and tool usage.
        </div>
        <div style="background:#ffffff; border:1px solid var(--slate-border); padding:0.75rem; border-radius:var(--radius-sm);">
          <strong style="color:var(--success); display:block; margin-bottom:0.25rem;">[R] Result</strong>
          Share quantifiable metric outcomes (% speedup, accuracy, revenue).
        </div>
      </div>
    </div>

    <div style="display:flex; justify-content:flex-end;">
      <button class="btn btn-primary" onclick="navigateStudentSubpage('history')">
        View History &amp; Reports →
      </button>
    </div>
  `;
}

// -------------------------------------------------------------------------
// PAGE 8: HISTORY & REPORTS
// -------------------------------------------------------------------------
function renderStudentHistory() {
  const wrapper = document.getElementById("history-content-wrapper");
  if (!wrapper) return;

  const historyList = studentAnalysisHistory || [];

  wrapper.innerHTML = `
    <!-- Report Action Bar -->
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem; margin-bottom:1.25rem;">
      <div>
        <h3 style="font-size:1rem; color:var(--navy-dark); margin:0;">Analysis History &amp; Document Exports</h3>
        <p style="font-size:0.8rem; color:var(--text-muted); margin:0.2rem 0 0;">Historical evaluations stored safely in local browser storage.</p>
      </div>
      <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
        <button class="btn btn-secondary" style="font-size:0.75rem; padding:0.35rem 0.65rem;" onclick="exportStudentSummaryReport()">
          📄 Export Summary (.txt)
        </button>
        <button class="btn btn-secondary" style="font-size:0.75rem; padding:0.35rem 0.65rem;" onclick="exportStudentJSONReport()">
          💾 Export Full JSON
        </button>
        <button class="btn btn-secondary" style="font-size:0.75rem; padding:0.35rem 0.65rem;" onclick="printStudentReport()">
          🖨️ Print / Save PDF
        </button>
        ${historyList.length ? `
          <button class="btn btn-danger" style="font-size:0.75rem; padding:0.35rem 0.65rem;" onclick="clearStudentHistory()">
            Clear History
          </button>
        ` : ""}
      </div>
    </div>

    <!-- History Table -->
    <div class="card-panel">
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Resume File</th>
              <th>Target Role Summary</th>
              <th>Match Score</th>
              <th>ATS Score</th>
              <th>Skills Overlap</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${historyList.length ? historyList.map(item => `
              <tr>
                <td style="font-size:0.775rem; color:var(--text-muted);">${escapeHtml(item.timestamp)}</td>
                <td style="font-weight:600; color:var(--navy-dark);">📎 ${escapeHtml(item.filename)}</td>
                <td style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(item.roleSummary)}</td>
                <td>
                  <span style="font-weight:700; color:${item.matchScore >= 65 ? 'var(--success)' : item.matchScore >= 40 ? 'var(--blue-primary)' : 'var(--danger)'};">
                    ${item.matchScore}%
                  </span>
                </td>
                <td>
                  <span style="font-weight:600; color:${item.atsScore >= 80 ? 'var(--success)' : item.atsScore >= 50 ? 'var(--warning)' : 'var(--danger)'};">
                    ${item.atsScore}/100
                  </span>
                </td>
                <td style="font-size:0.8rem;">
                  <span style="color:var(--success);">✓ ${item.matchedCount}</span> &bull; 
                  <span style="color:var(--danger);">✕ ${item.missingCount}</span>
                </td>
                <td>
                  <button class="btn btn-secondary" style="font-size:0.725rem; padding:0.25rem 0.55rem;" onclick="loadHistoryItem('${item.id}')">
                    Inspect
                  </button>
                </td>
              </tr>
            `).join("") : `
              <tr>
                <td colspan="7" style="text-align:center; padding:2.5rem; color:var(--text-muted);">
                  No historical analyses recorded yet. Run a candidate evaluation from the Ingestion Workstation to populate this log.
                </td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function loadHistoryItem(id) {
  const item = (studentAnalysisHistory || []).find(h => h.id === id);
  if (!item) return;

  latestStudentAnalysisData = item.data;
  latestStudentFilename = item.filename;
  latestStudentMetadata = item.metadata || null;

  try {
    localStorage.setItem("hirelens_latest_student_analysis", JSON.stringify({
      data: latestStudentAnalysisData,
      filename: latestStudentFilename,
      metadata: latestStudentMetadata
    }));
  } catch (e) {}

  navigateStudentSubpage("overview", true);
}

function clearStudentHistory() {
  if (confirm("Are you sure you want to clear your local evaluation history?")) {
    studentAnalysisHistory = [];
    try {
      localStorage.removeItem("hirelens_student_history");
    } catch (e) {}
    renderStudentHistory();
  }
}

function exportStudentSummaryReport() {
  if (!latestStudentAnalysisData) {
    alert("Please run an evaluation first to generate an exportable report.");
    return;
  }
  const d = latestStudentAnalysisData;
  const ats = d.ats_readiness || {};
  const skills = d.skills_audit || {};
  const meta = latestStudentMetadata || {};

  let text = `=================================================================\n`;
  text += `HIRELENS AI — CANDIDATE DIAGNOSTIC & ATS READINESS AUDIT REPORT\n`;
  text += `=================================================================\n\n`;
  text += `Document: ${latestStudentFilename || "Resume"}\n`;
  text += `Generated: ${new Date().toLocaleString()}\n`;
  text += `Candidate Email: ${meta.email || "Not detected"}\n`;
  text += `Education Level: ${meta.detected_degree || "UG"}\n`;
  text += `Experience: ${meta.detected_yoe || 0} years\n\n`;
  text += `-----------------------------------------------------------------\n`;
  text += `SCORES & METRICS:\n`;
  text += `• Overall Role Match: ${d.overall_match_percentage}%\n`;
  text += `• Transparent Formula: ${d.match_calculation_explanation}\n`;
  text += `• ATS Readiness Score: ${ats.score}/100 (${ats.category})\n`;
  text += `• Matched Skills (${skills.matched_skills?.length || 0}): ${(skills.matched_skills || []).join(", ")}\n`;
  text += `• Missing Critical Skills (${skills.missing_skills?.length || 0}): ${(skills.missing_skills || []).join(", ")}\n\n`;
  text += `-----------------------------------------------------------------\n`;
  text += `ACTIONABLE IMPROVEMENTS:\n`;
  (d.resume_improvements?.add || []).forEach(a => { text += `[ADD] ${a.action}: ${a.items.join(", ")} (${a.reason})\n`; });
  (d.resume_improvements?.remove || []).forEach(r => { text += `[REMOVE] ${r.action}: ${r.items.join(", ")} (${r.reason})\n`; });
  (d.resume_improvements?.improve || []).forEach(i => { text += `[IMPROVE] ${i.action}: ${i.items.join(", ")} (${i.reason})\n`; });
  text += `\n-----------------------------------------------------------------\n`;
  text += `PRIORITIZED ACTION PLAN:\n`;
  (d.prioritized_steps || []).forEach(s => { text += `P${s.priority}. ${s.title}: ${s.description}\n`; });

  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `hirelens_audit_${(latestStudentFilename || "resume").replace(/\.[^/.]+$/, "")}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportStudentJSONReport() {
  if (!latestStudentAnalysisData) {
    alert("Please run an evaluation first to generate an exportable report.");
    return;
  }
  const payload = {
    report_type: "HireLens AI Student Diagnostic",
    filename: latestStudentFilename,
    metadata: latestStudentMetadata,
    analytics: latestStudentAnalysisData,
    exported_at: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `hirelens_analytics_${(latestStudentFilename || "resume").replace(/\.[^/.]+$/, "")}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function printStudentReport() {
  window.print();
}

// =========================================================================
// 6. HR RECRUITER PORTAL (PIPELINE RANKING, SEARCH, FILTERS, COMPARISON, EXPORT)
// =========================================================================

let currentHRLeaderboard = [];
let currentHRFilteredLeaderboard = [];
let hrSelectedCandidateIds = new Set();
let hrActiveSummary = null;
let hrActiveCharts = null;
let _hrSelectedFiles = [];

const HR_JOB_PRESETS = {
  ds: {
    role: "Senior Data Scientist",
    min_yoe: 2,
    jd: "Looking for an experienced Data Scientist with skills in Python, Machine Learning, Data Science, Pandas, and Scikit-Learn. Prior experience in predictive modeling, exploratory data analysis, and SQL required."
  },
  ml: {
    role: "Machine Learning Engineer",
    min_yoe: 2,
    jd: "Seeking Machine Learning Engineer proficient in Python, PyTorch/TensorFlow, Scikit-Learn, Deep Learning, MLOps, Docker, and REST APIs for scalable model deployment."
  },
  backend: {
    role: "Python Backend Architect",
    min_yoe: 3,
    jd: "Senior Backend Developer specializing in Python, FastAPI/Django, PostgreSQL, Redis, Microservices, and REST API architectural patterns."
  },
  fullstack: {
    role: "Full Stack Engineer",
    min_yoe: 2,
    jd: "Full Stack Developer proficient in JavaScript/TypeScript, React/Vue, Node.js or Python backend, HTML5, CSS3, REST APIs, and database management."
  },
  devops: {
    role: "Cloud DevOps Engineer",
    min_yoe: 3,
    jd: "Cloud Infrastructure Engineer skilled in AWS/Azure/GCP, Docker, Kubernetes, CI/CD pipelines, Terraform, Linux administration, and network security."
  }
};

function applyHRPreset(key) {
  const p = HR_JOB_PRESETS[key];
  if (!p) return;
  const roleInput = document.getElementById("hr-role-title");
  const jdInput = document.getElementById("hr-jd-input");
  const yoeInput = document.getElementById("hr-min-yoe-input");
  if (roleInput) roleInput.value = p.role;
  if (jdInput) jdInput.value = p.jd;
  if (yoeInput) yoeInput.value = String(p.min_yoe);
}

function loadHRSampleData(autoRun = false) {
  applyHRPreset("ds");
  clearHRFiles();
  if (autoRun) {
    const rankBtn = document.getElementById("hr-rank-btn");
    if (rankBtn) rankBtn.click();
  }
}

function clearHRFiles(e) {
  if (e) e.stopPropagation();
  _hrSelectedFiles = [];
  const fileInput = document.getElementById("hr-file-input");
  const fileBadge = document.getElementById("hr-file-badge");
  const fileText = document.getElementById("hr-file-text");
  if (fileInput) fileInput.value = "";
  if (fileBadge) fileBadge.style.display = "none";
  if (fileText) fileText.textContent = "";
}

function initHRPortal() {
  const dropzone = document.getElementById("hr-dropzone");
  const fileInput = document.getElementById("hr-file-input");
  const fileBadge = document.getElementById("hr-file-badge");
  const fileText = document.getElementById("hr-file-text");
  const rankBtn = document.getElementById("hr-rank-btn");
  const exportBtn = document.getElementById("hr-export-btn");

  if (dropzone && fileInput) {
    dropzone.addEventListener("click", () => fileInput.click());
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("drag-active");
    });
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-active"));
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("drag-active");
      if (e.dataTransfer.files && e.dataTransfer.files.length) {
        _hrSelectedFiles = Array.from(e.dataTransfer.files);
        updateHRFileBadge();
      }
    });

    fileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length) {
        _hrSelectedFiles = Array.from(e.target.files);
        updateHRFileBadge();
      }
    });
  }

  function updateHRFileBadge() {
    if (_hrSelectedFiles.length && fileBadge && fileText) {
      fileBadge.style.display = "flex";
      fileText.textContent = `${_hrSelectedFiles.length} file(s) selected: ${_hrSelectedFiles.map(f => f.name).slice(0, 2).join(", ")}${_hrSelectedFiles.length > 2 ? "…" : ""}`;
    }
  }

  if (rankBtn) {
    rankBtn.addEventListener("click", runHRRanking);
  }

  if (exportBtn) {
    exportBtn.addEventListener("click", exportHRCsv);
  }
}

async function runHRRanking() {
  const rankBtn = document.getElementById("hr-rank-btn");
  const exportBtn = document.getElementById("hr-export-btn");
  const jdInput = document.getElementById("hr-jd-input");
  const yoeSelect = document.getElementById("hr-min-yoe-input");

  const jdText = jdInput ? jdInput.value.trim() : "";
  const minYoe = yoeSelect ? (parseInt(yoeSelect.value, 10) || 0) : 0;

  rankBtn.disabled = true;
  rankBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
    Processing & Ranking Pipeline…
  `;
  renderHRSkeleton();

  try {
    let response;
    const authHeaders = getAuthHeaders(false);

    if (_hrSelectedFiles.length > 0) {
      const formData = new FormData();
      _hrSelectedFiles.forEach(f => formData.append("files", f));
      formData.append("job_description", jdText);
      formData.append("min_yoe", String(minYoe));
      response = await fetch("/api/hr/analytics", {
        method: "POST",
        headers: authHeaders,
        body: formData
      });
    } else {
      response = await fetch("/api/hr/analytics", {
        method: "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          job_description: jdText,
          min_yoe: minYoe
        })
      });
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail || `Server error (${response.status})`);
    }

    const res = await response.json();
    currentHRLeaderboard = res.analytics.leaderboard || [];
    hrActiveSummary = res.analytics.summary || {};
    hrActiveCharts = res.analytics.charts || {};
    hrSelectedCandidateIds.clear();

    if (exportBtn) exportBtn.disabled = false;

    applyHRFiltersAndRender();
  } catch (err) {
    document.getElementById("hr-results-container").innerHTML = `
      <div class="portal-error-state">
        <div class="portal-error-icon">⚠️</div>
        <h4 class="portal-error-title">Pipeline Processing Error</h4>
        <p class="portal-error-desc">${escapeHtml(err.message)}</p>
      </div>
    `;
  } finally {
    rankBtn.disabled = false;
    rankBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
        <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
        <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
      </svg>
      Process & Rank Candidate Pipeline
    `;
  }
}

function applyHRFiltersAndRender() {
  const searchInput = document.getElementById("hr-search-input");
  const statusFilter = document.getElementById("hr-filter-status");
  const yoeFilter = document.getElementById("hr-filter-yoe");
  const matchFilter = document.getElementById("hr-filter-match");
  const sortSelect = document.getElementById("hr-sort-select");

  const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
  const selectedStatus = statusFilter ? statusFilter.value : "ALL";
  const selectedMinYoe = yoeFilter ? parseFloat(yoeFilter.value) || 0 : 0;
  const selectedMinMatch = matchFilter ? parseFloat(matchFilter.value) || 0 : 0;
  const sortBy = sortSelect ? sortSelect.value : "rank_asc";

  let filtered = currentHRLeaderboard.filter(cand => {
    // Search query filter
    if (query) {
      const nameMatch = String(cand.name).toLowerCase().includes(query);
      const eduMatch = String(cand.education).toLowerCase().includes(query);
      const skillsMatch = (cand.matched_skills || []).some(s => s.toLowerCase().includes(query)) ||
                          (cand.missing_skills || []).some(s => s.toLowerCase().includes(query));
      const techMatch = String(cand.tech_knowledge || "").toLowerCase().includes(query);
      if (!nameMatch && !eduMatch && !skillsMatch && !techMatch) {
        return false;
      }
    }

    // Status filter
    if (selectedStatus !== "ALL" && cand.status !== selectedStatus) {
      return false;
    }

    // Experience filter
    if (selectedMinYoe > 0) {
      const yoe = typeof cand.years_of_experience === "number" ? cand.years_of_experience : 0;
      if (yoe < selectedMinYoe) {
        return false;
      }
    }

    // Match % filter
    if (selectedMinMatch > 0) {
      if (cand.job_match_percentage < selectedMinMatch) {
        return false;
      }
    }

    return true;
  });

  // Sorting
  filtered.sort((a, b) => {
    switch (sortBy) {
      case "match_desc":
        return b.job_match_percentage - a.job_match_percentage;
      case "match_asc":
        return a.job_match_percentage - b.job_match_percentage;
      case "composite_desc":
        return b.composite_rank_score - a.composite_rank_score;
      case "yoe_desc": {
        const yA = typeof a.years_of_experience === "number" ? a.years_of_experience : -1;
        const yB = typeof b.years_of_experience === "number" ? b.years_of_experience : -1;
        return yB - yA;
      }
      case "name_asc":
        return String(a.name).localeCompare(String(b.name));
      case "rank_asc":
      default:
        return a.rank - b.rank;
    }
  });

  currentHRFilteredLeaderboard = filtered;
  renderHRAnalyticsDOM();
}

function renderHRAnalyticsDOM() {
  const container = document.getElementById("hr-results-container");
  if (!container) return;

  const summary = hrActiveSummary || {};
  const charts = hrActiveCharts || {};
  const filtered = currentHRFilteredLeaderboard;

  // Live count of shortlisted candidates across entire pool
  const liveShortlistedCount = currentHRLeaderboard.filter(c => c.status === "Shortlisted").length;

  container.innerHTML = `
    <!-- Top Summary Metrics Row -->
    <div class="stats-row">
      <div class="stat-card stat-card-highlight" style="border-top:3px solid var(--navy-dark);">
        <div class="stat-label">Candidates Analysed</div>
        <div class="stat-value" id="hr-counter-total">0</div>
        <div class="stat-desc">Ingested candidate records</div>
      </div>
      <div class="stat-card stat-card-highlight" style="border-top:3px solid var(--success);">
        <div class="stat-label">Shortlisted Candidates</div>
        <div class="stat-value" id="hr-counter-shortlisted" style="color:var(--success);">0</div>
        <div class="stat-desc" id="hr-shortlist-pct-desc">Qualified for next round</div>
      </div>
      <div class="stat-card stat-card-highlight" style="border-top:3px solid var(--blue-primary);">
        <div class="stat-label">Avg Pipeline Match</div>
        <div class="stat-value" id="hr-counter-avg-match" style="color:var(--blue-primary);">0%</div>
        <div class="stat-desc">Mean JD semantic alignment</div>
      </div>
      <div class="stat-card stat-card-highlight" style="border-top:3px solid var(--warning);">
        <div class="stat-label">Pool Skill Coverage</div>
        <div class="stat-value" id="hr-counter-coverage" style="color:var(--warning);">0%</div>
        <div class="stat-desc">Target skill presence</div>
      </div>
    </div>

    <!-- Interactive Visualizations Grid -->
    <div class="charts-grid" style="margin-top:1.25rem;">
      <div class="chart-card">
        <h4 style="display:flex;justify-content:space-between;align-items:center;">
          <span>Candidate Match Scores (%)</span>
          <span style="font-size:0.7rem;color:var(--text-muted);font-weight:normal;">Top 10 Ranked</span>
        </h4>
        <div class="chart-container"><canvas id="chart-hr-matches-bar"></canvas></div>
      </div>
      <div class="chart-card">
        <h4 style="display:flex;justify-content:space-between;align-items:center;">
          <span>Talent Pool Skills Coverage (%)</span>
          <span style="font-size:0.7rem;color:var(--text-muted);font-weight:normal;">Target Requirements</span>
        </h4>
        <div class="chart-container"><canvas id="chart-hr-skills-coverage"></canvas></div>
      </div>
      <div class="chart-card">
        <h4 style="display:flex;justify-content:space-between;align-items:center;">
          <span>Score Distribution</span>
          <span style="font-size:0.7rem;color:var(--text-muted);font-weight:normal;">Talent Brackets</span>
        </h4>
        <div class="chart-container"><canvas id="chart-hr-score-dist"></canvas></div>
      </div>
    </div>

    <!-- Candidate Leaderboard Section -->
    <div id="hr-leaderboard-anchor" style="margin-top:1.5rem;">
      
      <!-- Toolbar: Search, Filters, Sorting, Comparison, and Export -->
      <div class="hr-toolbar">
        <div class="hr-toolbar-left">
          <input
            type="text"
            id="hr-search-input"
            class="hr-search-input"
            placeholder="🔍 Search name, skills, degree…"
            oninput="applyHRFiltersAndRender()"
          >
          <select id="hr-filter-status" class="hr-select" onchange="applyHRFiltersAndRender()">
            <option value="ALL">All Statuses</option>
            <option value="Shortlisted">Shortlisted</option>
            <option value="Review">Under Review</option>
            <option value="Rejected">Rejected</option>
          </select>
          <select id="hr-filter-yoe" class="hr-select" onchange="applyHRFiltersAndRender()">
            <option value="0">All Experience</option>
            <option value="1">1+ YOE</option>
            <option value="2">2+ YOE</option>
            <option value="3">3+ YOE</option>
            <option value="5">5+ YOE</option>
          </select>
          <select id="hr-filter-match" class="hr-select" onchange="applyHRFiltersAndRender()">
            <option value="0">All Match %</option>
            <option value="50">&ge; 50% Match</option>
            <option value="70">&ge; 70% Match</option>
            <option value="85">&ge; 85% Match</option>
          </select>
          <select id="hr-sort-select" class="hr-select" onchange="applyHRFiltersAndRender()">
            <option value="rank_asc">Sort: Rank (Default)</option>
            <option value="match_desc">Sort: Match % (High-Low)</option>
            <option value="composite_desc">Sort: Composite Score</option>
            <option value="yoe_desc">Sort: Experience (High-Low)</option>
            <option value="name_asc">Sort: Name (A-Z)</option>
          </select>
        </div>

        <div class="hr-toolbar-right">
          <button
            type="button"
            id="hr-compare-btn"
            class="btn btn-secondary"
            style="padding: 0.4rem 0.8rem; font-size: 0.775rem;"
            onclick="openCandidateCompareModal()"
            ${hrSelectedCandidateIds.size < 2 ? "disabled" : ""}
          >
            👥 Compare Selected (<span id="hr-compare-count">${hrSelectedCandidateIds.size}</span>)
          </button>
          <button
            type="button"
            class="btn btn-primary"
            style="padding: 0.4rem 0.8rem; font-size: 0.775rem;"
            onclick="exportHRCsv()"
          >
            📥 Export CSV
          </button>
        </div>
      </div>

      <!-- Leaderboard Data Table -->
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 38px; text-align: center;">
                <input
                  type="checkbox"
                  id="hr-select-all-cands"
                  class="cand-checkbox"
                  title="Select all"
                  onchange="toggleSelectAllCandidates(this.checked)"
                >
              </th>
              <th style="width: 50px;">Rank</th>
              <th>Candidate Name</th>
              <th>Job Match %</th>
              <th>Skill Match</th>
              <th>Composite</th>
              <th>Education</th>
              <th>Experience</th>
              <th>Eligibility</th>
              <th>Matched Skills</th>
              <th>Missing Skills</th>
              <th>Shortlist Status</th>
              <th style="text-align: center;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length === 0 ? `
              <tr>
                <td colspan="13" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                  No candidates match the selected filters or search query.
                </td>
              </tr>
            ` : filtered.map(cand => {
              const isChecked = hrSelectedCandidateIds.has(cand.candidate_id);
              const matchColor = cand.job_match_percentage >= 70 ? "var(--success)" : (cand.job_match_percentage >= 40 ? "var(--blue-primary)" : "var(--danger)");
              const isEligible = String(cand.eligibility_indicator).startsWith("Eligible");
              const isUnderExp = String(cand.eligibility_indicator).toLowerCase().includes("under");

              return `
                <tr id="row-${cand.candidate_id}" class="${isChecked ? "row-selected" : ""}">
                  <td style="text-align: center;">
                    <input
                      type="checkbox"
                      class="cand-checkbox cand-row-checkbox"
                      value="${cand.candidate_id}"
                      ${isChecked ? "checked" : ""}
                      onchange="toggleCandidateCompareSelection('${cand.candidate_id}', this.checked)"
                    >
                  </td>
                  <td>
                    <span class="badge-rank ${cand.rank <= 3 ? "top-rank" : ""}">
                      ${cand.rank === 1 ? "🥇" : (cand.rank === 2 ? "🥈" : (cand.rank === 3 ? "🥉" : cand.rank))}
                    </span>
                  </td>
                  <td>
                    <div style="font-weight: 600; color: var(--navy-dark);">${escapeHtml(cand.name)}</div>
                    <div style="font-size: 0.7rem; color: var(--text-muted);">${escapeHtml(String(cand.tech_knowledge || "Standard Profile"))}</div>
                  </td>
                  <td>
                    <div class="match-cell-wrapper">
                      <div class="match-bar-bg">
                        <div class="match-bar-fill" style="width: ${cand.job_match_percentage}%; background: ${matchColor};"></div>
                      </div>
                      <span style="font-weight: 700; color: ${matchColor}; font-size: 0.85rem;">${cand.job_match_percentage}%</span>
                    </div>
                  </td>
                  <td>
                    <span style="font-weight: 600; color: var(--text-main);">${cand.skill_match_percentage}%</span>
                  </td>
                  <td>
                    <span style="font-weight: 700; color: var(--navy-dark);" title="${escapeHtml(cand.score_breakdown?.formula || '')}">
                      ${cand.composite_rank_score}
                    </span>
                  </td>
                  <td>
                    <span style="font-size: 0.775rem;">${escapeHtml(String(cand.education))}</span>
                  </td>
                  <td>
                    <span style="font-weight: 500;">
                      ${cand.years_of_experience !== "Unavailable" && cand.years_of_experience !== null ? cand.years_of_experience + " yrs" : "N/A"}
                    </span>
                  </td>
                  <td>
                    <span class="eligibility-pill ${isEligible ? "pill-eligible" : (isUnderExp ? "pill-warning" : "pill-muted")}">
                      ${escapeHtml(cand.eligibility_indicator)}
                    </span>
                  </td>
                  <td>
                    <div style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${cand.matched_skills.join(", ")}">
                      ${cand.matched_skills && cand.matched_skills.length
                        ? cand.matched_skills.slice(0, 2).map(s => `<span class="skill-tag tag-matched" style="font-size:0.65rem;padding:1px 4px;">${escapeHtml(s)}</span>`).join(" ")
                        : `<span style="color:var(--text-light);font-size:0.75rem;">None</span>`}
                      ${cand.matched_skills && cand.matched_skills.length > 2 ? `<span style="font-size:0.7rem;color:var(--text-muted);">+${cand.matched_skills.length - 2}</span>` : ""}
                    </div>
                  </td>
                  <td>
                    <div style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${cand.missing_skills.join(", ")}">
                      ${cand.missing_skills && cand.missing_skills.length
                        ? cand.missing_skills.slice(0, 2).map(s => `<span class="skill-tag tag-missing" style="font-size:0.65rem;padding:1px 4px;">${escapeHtml(s)}</span>`).join(" ")
                        : `<span style="color:var(--success);font-size:0.75rem;">0 gaps</span>`}
                      ${cand.missing_skills && cand.missing_skills.length > 2 ? `<span style="font-size:0.7rem;color:var(--text-muted);">+${cand.missing_skills.length - 2}</span>` : ""}
                    </div>
                  </td>
                  <td>
                    <select
                      class="status-dropdown status-${cand.status.toLowerCase()}"
                      onchange="updateCandidateStatus('${cand.candidate_id}', this.value)"
                    >
                      <option value="Shortlisted" ${cand.status === "Shortlisted" ? "selected" : ""}>✓ Shortlisted</option>
                      <option value="Review" ${cand.status === "Review" ? "selected" : ""}>⏳ Under Review</option>
                      <option value="Rejected" ${cand.status === "Rejected" ? "selected" : ""}>✕ Rejected</option>
                    </select>
                  </td>
                  <td style="text-align: center;">
                    <button
                      onclick="openCandidateModal('${cand.candidate_id}')"
                      class="btn btn-secondary"
                      style="padding: 0.2rem 0.55rem; font-size: 0.725rem;"
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Animate summary counters
  animateCounter(document.getElementById("hr-counter-total"), summary.total_candidates_analyzed || 0, 700);
  animateCounter(document.getElementById("hr-counter-shortlisted"), liveShortlistedCount, 700);
  animateCounter(document.getElementById("hr-counter-avg-match"), summary.average_job_match || 0, 800, "%");
  animateCounter(document.getElementById("hr-counter-coverage"), summary.average_pool_skill_coverage || 0, 800, "%");

  // Render Charts safely with real computed data
  if (charts.candidate_matches_bar) {
    renderChartSafely("chart-hr-matches-bar", "bar", {
      labels: charts.candidate_matches_bar.labels,
      datasets: [{
        label: "Job Match %",
        data: charts.candidate_matches_bar.values,
        backgroundColor: "#2563eb",
        borderRadius: 4
      }]
    }, {
      scales: {
        y: { beginAtZero: true, max: 100, ticks: { callback: v => `${v}%`, font: { size: 10 } } },
        x: { ticks: { font: { size: 10 }, maxRotation: 45 } }
      },
      plugins: { legend: { display: false } }
    });
  }

  if (charts.skills_coverage_bar) {
    renderChartSafely("chart-hr-skills-coverage", "bar", {
      labels: charts.skills_coverage_bar.labels,
      datasets: [{
        label: "Talent Pool Skill Coverage %",
        data: charts.skills_coverage_bar.values,
        backgroundColor: "#16a34a",
        borderRadius: 4
      }]
    }, {
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, max: 100, ticks: { callback: v => `${v}%`, font: { size: 10 } } },
        y: { ticks: { font: { size: 10 } } }
      }
    });
  }

  if (charts.score_distribution) {
    renderChartSafely("chart-hr-score-dist", "bar", {
      labels: charts.score_distribution.labels,
      datasets: [{
        label: "Candidate Count",
        data: charts.score_distribution.values,
        backgroundColor: ["#dc2626", "#d97706", "#2563eb", "#16a34a"],
        borderRadius: 4
      }]
    }, {
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } } },
        x: { ticks: { font: { size: 10 } } }
      }
    });
  }
}

function updateCandidateStatus(candId, newStatus) {
  const cand = currentHRLeaderboard.find(c => c.candidate_id === candId);
  if (!cand) return;
  cand.status = newStatus;

  // Live update shortlisted counter in UI
  const liveShortlistedCount = currentHRLeaderboard.filter(c => c.status === "Shortlisted").length;
  const counterEl = document.getElementById("hr-counter-shortlisted");
  if (counterEl) {
    counterEl.textContent = liveShortlistedCount;
  }

  // Update status dropdown styling in table
  const row = document.getElementById(`row-${candId}`);
  if (row) {
    const select = row.querySelector(".status-dropdown");
    if (select) {
      select.className = `status-dropdown status-${newStatus.toLowerCase()}`;
    }
  }
}

function toggleCandidateCompareSelection(candId, isChecked) {
  if (isChecked) {
    hrSelectedCandidateIds.add(candId);
  } else {
    hrSelectedCandidateIds.delete(candId);
  }

  const countBadge = document.getElementById("hr-compare-count");
  if (countBadge) countBadge.textContent = hrSelectedCandidateIds.size;

  const compareBtn = document.getElementById("hr-compare-btn");
  if (compareBtn) {
    compareBtn.disabled = hrSelectedCandidateIds.size < 2;
  }

  const row = document.getElementById(`row-${candId}`);
  if (row) {
    if (isChecked) row.classList.add("row-selected");
    else row.classList.remove("row-selected");
  }
}

function toggleSelectAllCandidates(isChecked) {
  const checkboxes = document.querySelectorAll(".cand-row-checkbox");
  checkboxes.forEach(cb => {
    cb.checked = isChecked;
    const candId = cb.value;
    if (isChecked) {
      hrSelectedCandidateIds.add(candId);
    } else {
      hrSelectedCandidateIds.delete(candId);
    }
  });

  const countBadge = document.getElementById("hr-compare-count");
  if (countBadge) countBadge.textContent = hrSelectedCandidateIds.size;

  const compareBtn = document.getElementById("hr-compare-btn");
  if (compareBtn) {
    compareBtn.disabled = hrSelectedCandidateIds.size < 2;
  }
}

function openCandidateCompareModal() {
  if (hrSelectedCandidateIds.size < 2) {
    alert("Please select at least 2 candidates using the checkboxes to compare.");
    return;
  }

  const selectedCands = currentHRLeaderboard.filter(c => hrSelectedCandidateIds.has(c.candidate_id));
  const modal = document.getElementById("candidate-compare-modal");
  const title = document.getElementById("modal-compare-title");
  const body = document.getElementById("modal-compare-body-content");

  if (!modal || !body) return;

  title.textContent = `Candidate Comparison (${selectedCands.length} Candidates Selected)`;

  body.innerHTML = `
    <div class="compare-table-container">
      <table class="compare-table">
        <thead>
          <tr>
            <th class="compare-metric-col">Evaluation Metric</th>
            ${selectedCands.map(c => `
              <th class="compare-candidate-col">
                <div style="font-weight: 700; color: var(--navy-dark); font-size: 0.95rem;">
                  ${escapeHtml(c.name)}
                </div>
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
                  Rank #${c.rank} &bull; ${escapeHtml(c.status)}
                </div>
              </th>
            `).join("")}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="compare-metric-col">Overall Job Match</td>
            ${selectedCands.map(c => `
              <td>
                <span style="font-size: 1.15rem; font-weight: 700; color: ${c.job_match_percentage >= 70 ? "var(--success)" : "var(--blue-primary)"};">
                  ${c.job_match_percentage}%
                </span>
              </td>
            `).join("")}
          </tr>
          <tr>
            <td class="compare-metric-col">Skill Coverage</td>
            ${selectedCands.map(c => `
              <td><strong>${c.skill_match_percentage}%</strong></td>
            `).join("")}
          </tr>
          <tr>
            <td class="compare-metric-col">Semantic Relevance</td>
            ${selectedCands.map(c => `
              <td>${c.semantic_similarity}%</td>
            `).join("")}
          </tr>
          <tr>
            <td class="compare-metric-col">Composite Rank Score</td>
            ${selectedCands.map(c => `
              <td>
                <div style="font-weight: 700; font-size: 1.05rem; color: var(--navy-dark);">${c.composite_rank_score}</div>
                <div style="font-size: 0.7rem; color: var(--text-muted);">${escapeHtml(c.score_breakdown?.formula || "")}</div>
              </td>
            `).join("")}
          </tr>
          <tr>
            <td class="compare-metric-col">Experience (YOE)</td>
            ${selectedCands.map(c => `
              <td>${c.years_of_experience !== "Unavailable" ? c.years_of_experience + " yrs" : "N/A"}</td>
            `).join("")}
          </tr>
          <tr>
            <td class="compare-metric-col">Education Level</td>
            ${selectedCands.map(c => `
              <td>${escapeHtml(String(c.education))}</td>
            `).join("")}
          </tr>
          <tr>
            <td class="compare-metric-col">Eligibility Indicator</td>
            ${selectedCands.map(c => `
              <td>
                <span class="eligibility-pill ${String(c.eligibility_indicator).startsWith("Eligible") ? "pill-eligible" : "pill-warning"}">
                  ${escapeHtml(c.eligibility_indicator)}
                </span>
              </td>
            `).join("")}
          </tr>
          <tr>
            <td class="compare-metric-col">ATS Readiness Score</td>
            ${selectedCands.map(c => `
              <td><strong>${c.ats_readiness_score}/100</strong></td>
            `).join("")}
          </tr>
          <tr>
            <td class="compare-metric-col">Legacy ML Prediction</td>
            ${selectedCands.map(c => `
              <td>${c.legacy_ml_match ? "✅ Relevant Candidate" : "❌ Sub-threshold"}</td>
            `).join("")}
          </tr>
          <tr>
            <td class="compare-metric-col">Matched Skills</td>
            ${selectedCands.map(c => `
              <td>
                <div class="skill-tag-group">
                  ${c.matched_skills && c.matched_skills.length
                    ? c.matched_skills.map(s => `<span class="skill-tag tag-matched">✓ ${escapeHtml(s)}</span>`).join(" ")
                    : `<span style="color:var(--text-light);font-size:0.75rem;">None</span>`}
                </div>
              </td>
            `).join("")}
          </tr>
          <tr>
            <td class="compare-metric-col">Missing Skills</td>
            ${selectedCands.map(c => `
              <td>
                <div class="skill-tag-group">
                  ${c.missing_skills && c.missing_skills.length
                    ? c.missing_skills.map(s => `<span class="skill-tag tag-missing">✕ ${escapeHtml(s)}</span>`).join(" ")
                    : `<span style="color:var(--success);font-size:0.75rem;">Complete Coverage</span>`}
                </div>
              </td>
            `).join("")}
          </tr>
          <tr>
            <td class="compare-metric-col">Project Experience</td>
            ${selectedCands.map(c => `
              <div style="font-size: 0.75rem; color: var(--navy-dark);">${escapeHtml(String(c.project_highlight || "Standard Domain Work"))}</div>
            `).join("")}
          </tr>
        </tbody>
      </table>
    </div>
  `;

  modal.style.display = "flex";
}

function closeCandidateCompareModal() {
  const modal = document.getElementById("candidate-compare-modal");
  if (modal) modal.style.display = "none";
}

async function exportHRCsv() {
  const candidatesToExport = currentHRFilteredLeaderboard.length
    ? currentHRFilteredLeaderboard
    : currentHRLeaderboard;

  if (!candidatesToExport.length) {
    alert("No candidates available to export.");
    return;
  }

  try {
    const res = await fetch("/api/hr/export-csv", {
      method: "POST",
      headers: getAuthHeaders(true),
      body: JSON.stringify({ leaderboard: candidatesToExport })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "CSV export failed on server.");
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hirelens_candidates_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    alert("Export failed: " + err.message);
  }
}

function renderHRSkeleton() {
  const container = document.getElementById("hr-results-container");
  if (!container) return;
  container.innerHTML = `
    <div style="padding: 1rem 0;">
      <div class="skeleton skeleton-title" style="width: 45%; margin-bottom: 1.5rem;"></div>
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
        <div class="skeleton" style="height: 90px; border-radius: 8px;"></div>
        <div class="skeleton" style="height: 90px; border-radius: 8px;"></div>
        <div class="skeleton" style="height: 90px; border-radius: 8px;"></div>
        <div class="skeleton" style="height: 90px; border-radius: 8px;"></div>
      </div>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
        <div class="skeleton" style="height: 220px; border-radius: 8px;"></div>
        <div class="skeleton" style="height: 220px; border-radius: 8px;"></div>
        <div class="skeleton" style="height: 220px; border-radius: 8px;"></div>
      </div>
      <div class="skeleton" style="height: 300px; border-radius: 8px;"></div>
    </div>
  `;
}


function openCandidateModal(candId) {
  const cand = currentHRLeaderboard.find(c => c.candidate_id === candId);
  if (!cand) return;
  const modal = document.getElementById("candidate-modal");
  const title = document.getElementById("modal-candidate-name");
  const body = document.getElementById("modal-body-content");

  title.textContent = `${cand.name} (Rank #${cand.rank})`;
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.25rem;">
      <div style="background:#f8fafc;border:1px solid var(--slate-border);padding:0.85rem;border-radius:6px;">
        <div style="font-size:0.75rem;color:var(--text-muted);">Composite Rank Score</div>
        <div style="font-size:1.5rem;font-weight:700;color:var(--navy-dark);">${cand.composite_rank_score}</div>
        <div style="font-size:0.75rem;color:var(--text-light);margin-top:0.25rem;">${escapeHtml(cand.score_breakdown.formula)}</div>
      </div>
      <div style="background:#f8fafc;border:1px solid var(--slate-border);padding:0.85rem;border-radius:6px;">
        <div style="font-size:0.75rem;color:var(--text-muted);">Job Match & Semantic Relevance</div>
        <div style="font-size:1.5rem;font-weight:700;color:var(--blue-primary);">${cand.job_match_percentage}%</div>
        <div style="font-size:0.75rem;color:var(--text-light);margin-top:0.25rem;">Skill Coverage: ${cand.skill_match_percentage}% | Semantic TF-IDF: ${cand.semantic_similarity}%</div>
      </div>
    </div>
    <div style="margin-bottom:1rem;font-size:0.85rem;">
      <strong>Education:</strong> ${escapeHtml(String(cand.education))} &bull;
      <strong>Experience:</strong> ${cand.years_of_experience} yrs &bull;
      <strong>ATS Score:</strong> ${cand.ats_readiness_score}/100
    </div>
    <div style="margin-bottom:0.75rem;">
      <div style="font-size:0.8rem;font-weight:600;color:var(--success);margin-bottom:0.25rem;">Matched Skills:</div>
      <div class="skill-tag-group">${cand.matched_skills.map(s => `<span class="skill-tag tag-matched">✓ ${escapeHtml(s)}</span>`).join("")}</div>
    </div>
    <div style="margin-bottom:0.75rem;">
      <div style="font-size:0.8rem;font-weight:600;color:var(--danger);margin-bottom:0.25rem;">Missing Skills:</div>
      <div class="skill-tag-group">${cand.missing_skills.map(s => `<span class="skill-tag tag-missing">✕ ${escapeHtml(s)}</span>`).join("")}</div>
    </div>
    <div style="background:#f8fafc;border:1px solid var(--slate-border);border-radius:6px;padding:0.85rem;margin-top:1rem;font-size:0.8rem;">
      <div><strong>Project Highlight:</strong> ${escapeHtml(String(cand.project_highlight || "Unavailable"))}</div>
      <div style="margin-top:0.35rem;"><strong>Certifications:</strong> ${escapeHtml(String(cand.certifications || "Unavailable"))}</div>
      <div style="margin-top:0.35rem;"><strong>Legacy ML Model Predict:</strong> ${cand.legacy_ml_match ? "✅ Matched (Relevance Confirmed)" : "❌ Unmatched"}</div>
    </div>
  `;
  modal.style.display = "flex";
}

function closeCandidateModal() {
  const modal = document.getElementById("candidate-modal");
  if (modal) modal.style.display = "none";
}

// =========================================================================
// 7. CHART RENDERING — Resilient, animated, supports extra options
// =========================================================================

function renderChartSafely(canvasId, type, chartData, extraOptions = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
    delete chartInstances[canvasId];
  }

  if (!window.Chart) {
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#334155";
      ctx.font = "12px sans-serif";
      ctx.fillText("Chart.js not loaded — please refresh", 10, 40);
    }
    return;
  }

  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 850, easing: "easeOutQuart" },
    plugins: {
      legend: { display: type === "doughnut" || type === "radar", position: "bottom", labels: { font: { size: 11 }, padding: 10 } }
    }
  };

  const mergedOptions = deepMerge(defaultOptions, extraOptions);

  try {
    chartInstances[canvasId] = new Chart(canvas, {
      type: type,
      data: chartData,
      options: mergedOptions
    });
  } catch (e) {
    console.warn(`Chart.js failed for #${canvasId}:`, e);
  }
}

function deepMerge(target, source) {
  const result = Object.assign({}, target);
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// Expose scroll helper
function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}
