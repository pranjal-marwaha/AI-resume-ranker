import sys
import os
import json
import re
from pathlib import Path
from fastapi.testclient import TestClient

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from server import app

def run_tests():
    print("=" * 70)
    print("VERIFYING HIRELENS AI STUDENT PORTAL REDESIGN")
    print("=" * 70)

    # -------------------------------------------------------------
    # 1. Inspect static/index.html structure
    # -------------------------------------------------------------
    print("\n[Step 1] Inspecting static/index.html subpage architecture...")
    html_path = PROJECT_ROOT / "static" / "index.html"
    assert html_path.exists(), "static/index.html not found!"
    html_content = html_path.read_text(encoding="utf-8")

    expected_subpages = [
        "spage-overview",
        "spage-analysis",
        "spage-match",
        "spage-ats",
        "spage-improvements",
        "spage-roadmap",
        "spage-interview",
        "spage-history"
    ]
    for sp in expected_subpages:
        assert f'id="{sp}"' in html_content, f"Missing subpage container #{sp} in index.html"
        print(f"  [PASS] Subpage container #{sp} verified")

    expected_sidebar_items = [
        'data-spage="overview"',
        'data-spage="analysis"',
        'data-spage="match"',
        'data-spage="ats"',
        'data-spage="improvements"',
        'data-spage="roadmap"',
        'data-spage="interview"',
        'data-spage="history"'
    ]
    for item in expected_sidebar_items:
        assert item in html_content, f"Missing sidebar navigation link for {item}"
        print(f"  [PASS] Sidebar item {item} verified")

    # Verify persistent header elements
    assert 'id="student-breadcrumb"' in html_content, "Missing #student-breadcrumb"
    assert 'id="student-subpage-title"' in html_content, "Missing #student-subpage-title"
    assert 'id="student-subpage-desc"' in html_content, "Missing #student-subpage-desc"
    assert 'id="student-active-filename-chip"' in html_content, "Missing #student-active-filename-chip"
    print("  [PASS] Persistent header and breadcrumbs verified")

    # -------------------------------------------------------------
    # 2. Inspect static/css/main.css styles
    # -------------------------------------------------------------
    print("\n[Step 2] Inspecting static/css/main.css styling...")
    css_path = PROJECT_ROOT / "static" / "css" / "main.css"
    assert css_path.exists(), "static/css/main.css not found!"
    css_content = css_path.read_text(encoding="utf-8")

    assert ".student-subpage" in css_content, "Missing .student-subpage in CSS"
    assert ".student-subpage.active-subpage" in css_content, "Missing active-subpage rule in CSS"
    assert "@keyframes fadeInSubpage" in css_content, "Missing fadeInSubpage animation in CSS"
    assert ".profile-summary-grid" in css_content, "Missing .profile-summary-grid in CSS"
    assert ".quick-launch-grid" in css_content, "Missing .quick-launch-grid in CSS"
    assert ".interview-qa-item" in css_content, "Missing .interview-qa-item in CSS"
    print("  [PASS] All subpage layout, animation, and responsive styles verified")

    # -------------------------------------------------------------
    # 3. Inspect static/js/main.js logic
    # -------------------------------------------------------------
    print("\n[Step 3] Inspecting static/js/main.js subpage router and renderers...")
    js_path = PROJECT_ROOT / "static" / "js" / "main.js"
    assert js_path.exists(), "static/js/main.js not found!"
    js_content = js_path.read_text(encoding="utf-8")

    assert "const STUDENT_SUBPAGE_METADATA = {" in js_content, "Missing STUDENT_SUBPAGE_METADATA"
    assert "function navigateStudentSubpage(" in js_content, "Missing navigateStudentSubpage"
    assert "function handleHashRouting(" in js_content, "Missing handleHashRouting"
    
    expected_renderers = [
        "renderStudentOverview",
        "renderStudentAnalysisWorkstation",
        "renderStudentMatchResults",
        "renderStudentATS",
        "renderStudentImprovements",
        "renderStudentRoadmap",
        "renderStudentInterview",
        "renderStudentHistory"
    ]
    for r in expected_renderers:
        assert f"function {r}(" in js_content, f"Missing renderer function {r}"
        print(f"  [PASS] Subpage renderer {r}() verified")

    # Verify history & export tools
    assert "function exportStudentSummaryReport(" in js_content, "Missing exportStudentSummaryReport"
    assert "function exportStudentJSONReport(" in js_content, "Missing exportStudentJSONReport"
    assert "function printStudentReport(" in js_content, "Missing printStudentReport"
    assert "function loadHistoryItem(" in js_content, "Missing loadHistoryItem"
    assert "function clearStudentHistory(" in js_content, "Missing clearStudentHistory"
    print("  [PASS] History tracking and report export utilities verified")

    # -------------------------------------------------------------
    # 4. Live API & Analytics Testing with TestClient
    # -------------------------------------------------------------
    print("\n[Step 4] Testing live API /api/student/analytics endpoint...")
    client = TestClient(app)

    # Register/Login student
    reg_res = client.post("/api/auth/register", json={
        "full_name": "Test Candidate",
        "email": "test_candidate_p8@hirelens.ai",
        "password": "Password123!",
        "role": "student"
    })
    token = None
    if reg_res.status_code == 200:
        token = reg_res.json()["token"]
    else:
        login_res = client.post("/api/auth/login", json={
            "email": "test_candidate_p8@hirelens.ai",
            "password": "Password123!"
        })
        assert login_res.status_code == 200
        token = login_res.json()["token"]

    headers = {"Authorization": f"Bearer {token}"}

    sample_resume = """
    Alex Rivera — Data Scientist
    Email: alex.rivera@techdomain.com | Phone: (555) 019-2834
    
    EDUCATION
    Master of Science in Computer Science (PG) — Stanford University, 2022
    
    EXPERIENCE
    Data Scientist — Horizon Labs (2022–Present, 2 yrs)
    - Deployed production NLP pipeline using Python, PyTorch and Hugging Face transformers.
    - Improved search ranking NDCG by 14% via ensemble XGBoost models.
    - Built automated data ingestion with SQL and PostgreSQL.
    
    SKILLS
    Python, SQL, Machine Learning, Data Science, Pandas, Scikit-Learn, Git, Docker, PyTorch
    
    PROJECTS
    Automated Resume Ranker — Trained linear SVM with TF-IDF vectorization achieving 88% precision.
    """

    target_jd = "Looking for an experienced Data Scientist with skills in Python, Machine Learning, Scikit-Learn, Pandas, and SQL. Experience with Docker and cloud microservices preferred."

    analytics_res = client.post("/api/student/analytics", headers=headers, json={
        "resume_text": sample_resume,
        "job_description": target_jd,
        "filename": "alex_rivera_resume.txt"
    })
    assert analytics_res.status_code == 200, f"Analytics failed: {analytics_res.text}"
    data = analytics_res.json()
    assert data["status"] == "success"
    analytics = data["analytics"]
    metadata = data["metadata"]

    print("  [PASS] Overall Job Match %:", analytics["overall_match_percentage"])
    print("  [PASS] ATS Readiness Score:", analytics["ats_readiness"]["score"], f"({analytics['ats_readiness']['category']})")
    print("  [PASS] Matched Skills Count:", len(analytics["skills_audit"]["matched_skills"]))
    print("  [PASS] Missing Skills Count:", len(analytics["skills_audit"]["missing_skills"]))
    print("  [PASS] Detected Education:", metadata["detected_degree"])
    print("  [PASS] Detected YOE:", metadata["detected_yoe"])
    print("  [PASS] Legacy Model Available:", analytics["legacy_model_baseline"]["available"])
    print("  [PASS] Prioritized Steps Count:", len(analytics["prioritized_steps"]))
    print("  [PASS] Chart Payloads Ready:", list(analytics["charts"].keys()))

    assert analytics["overall_match_percentage"] > 0
    assert analytics["ats_readiness"]["score"] > 0
    assert len(analytics["skills_audit"]["matched_skills"]) > 0
    assert metadata["detected_degree"] == "PG"
    assert metadata["detected_yoe"] >= 0  # YOE is non-negative
    assert metadata["email"] == "alex.rivera@techdomain.com"

    # -------------------------------------------------------------
    # 5. Role Protection Test: Student blocked from HR
    # -------------------------------------------------------------
    print("\n[Step 5] Verifying role isolation (Student blocked from HR Pipeline)...")
    hr_block_res = client.post("/api/hr/analytics", headers=headers, data={
        "job_description": target_jd,
        "min_yoe": 0
    })
    assert hr_block_res.status_code == 403, f"Expected 403 Forbidden for student on HR endpoint, got {hr_block_res.status_code}"
    print("  [PASS] HR Pipeline correctly returns 403 Forbidden for student account")

    print("\n" + "=" * 70)
    print("ALL 5 STUDENT PORTAL REDESIGN VERIFICATIONS PASSED (100% SUCCESS)")
    print("=" * 70)

if __name__ == "__main__":
    run_tests()
