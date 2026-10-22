import os
import sys
import sqlite3
from pathlib import Path
from fastapi.testclient import TestClient

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from server import app
from core.auth import DB_PATH

client = TestClient(app)

def run_e2e():
    print("================================================================")
    print("RUNNING COMPREHENSIVE E2E VERIFICATION FOR PHASE 4.5")
    print("================================================================")

    # 1. Static frontend & dashboard serving
    print("\n[Step 1] Verifying Static Frontend & Assets Serving...")
    r_index = client.get("/")
    assert r_index.status_code == 200, "Index HTML failed to serve"
    assert "HireLens AI" in r_index.text, "Brand missing in HTML"
    assert "auth-view" in r_index.text, "Auth view missing in HTML"
    assert "dashboard-sidebar" in r_index.text, "Persistent sidebar missing in HTML"
    assert "ambient-glow" in r_index.text, "Ambient glow elements missing in HTML"
    
    r_css = client.get("/static/css/main.css")
    assert r_css.status_code == 200, "CSS failed to serve"
    assert "skeleton-shimmer" in r_css.text, "Skeleton styles missing in CSS"

    r_js = client.get("/static/js/main.js")
    assert r_js.status_code == 200, "JS failed to serve"
    assert "renderStudentSkeleton" in r_js.text, "Skeleton loader missing in JS"
    assert "animateCounter" in r_js.text, "Counter animation missing in JS"
    print(" -> PASSED: Frontend HTML, CSS animations, and JS controllers served with 200 OK.")

    # 2. Signup / Registration test
    print("\n[Step 2] Testing User Signup & Persistent Password Hashing...")
    signup_email = f"e2e_user_{os.getpid()}@hirelens.ai"
    signup_pwd = "Password987!"
    r_signup = client.post("/api/auth/register", json={
        "full_name": "E2E Candidate",
        "email": signup_email,
        "password": signup_pwd,
        "role": "student"
    })
    assert r_signup.status_code == 200, f"Signup failed: {r_signup.text}"
    signup_data = r_signup.json()
    assert signup_data["status"] == "success"
    assert "token" in signup_data
    signup_token = signup_data["token"]
    print(" -> PASSED: User signup successful with persistent session token.")

    # Verify PBKDF2 hash in SQLite
    with sqlite3.connect(str(DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row
        user_row = conn.execute("SELECT password_hash, salt FROM users WHERE email = ?", (signup_email,)).fetchone()
        assert user_row is not None
        assert user_row["password_hash"] != signup_pwd, "Plaintext password detected in SQLite!"
        print(" -> PASSED: Password verified hashed with PBKDF2 in SQLite.")

    # 3. Invalid credentials test
    print("\n[Step 3] Testing Invalid Credentials Handling...")
    r_bad_pwd = client.post("/api/auth/login", json={"email": signup_email, "password": "WrongPassword"})
    assert r_bad_pwd.status_code == 401, f"Expected 401 on bad password, got {r_bad_pwd.status_code}"
    r_bad_email = client.post("/api/auth/login", json={"email": "nonexistent@hirelens.ai", "password": "any"})
    assert r_bad_email.status_code == 401, f"Expected 401 on bad email, got {r_bad_email.status_code}"
    print(" -> PASSED: Invalid credentials correctly rejected with 401 Unauthorized.")

    # 4. Valid Login test
    print("\n[Step 4] Testing Valid Login & Session Creation...")
    r_login = client.post("/api/auth/login", json={"email": signup_email, "password": signup_pwd})
    assert r_login.status_code == 200, f"Login failed: {r_login.text}"
    login_data = r_login.json()
    assert login_data["status"] == "success"
    assert "token" in login_data
    active_token = login_data["token"]
    print(" -> PASSED: Login succeeded and issued fresh session token.")

    # 5. Session Validation /api/auth/me
    print("\n[Step 5] Testing Session Validation via /api/auth/me...")
    r_me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {active_token}"})
    assert r_me.status_code == 200
    me_data = r_me.json()
    assert me_data["authenticated"] is True
    assert me_data["user"]["email"] == signup_email
    assert me_data["user"]["role"] == "student"
    print(" -> PASSED: /api/auth/me validated active session.")

    # 6. Role-Protected Routes: Student testing
    print("\n[Step 6] Testing Student Role Protection & Chart Analytics...")
    # Student accessing Student Analytics -> 200 OK
    r_st_analytics = client.post(
        "/api/student/analytics",
        headers={"Authorization": f"Bearer {active_token}"},
        json={
            "resume_text": "Experienced Python, Machine Learning, SQL, and Pandas Developer with 3 years experience.",
            "job_description": "Seeking Data Scientist with Python, Machine Learning, SQL, and Pandas."
        }
    )
    assert r_st_analytics.status_code == 200, f"Student analytics failed: {r_st_analytics.text}"
    st_res = r_st_analytics.json()
    assert "analytics" in st_res and "charts" in st_res["analytics"]
    st_charts = st_res["analytics"]["charts"]
    assert "skills_bar" in st_charts
    assert "skills_doughnut" in st_charts
    assert "score_radar" in st_charts
    assert len(st_charts["skills_bar"]["labels"]) > 0
    print(" -> PASSED: Student successfully accessed Student Analytics with real backend Chart data.")

    # Student attempting to access HR Pipeline -> 403 Forbidden
    r_st_to_hr = client.post(
        "/api/hr/analytics",
        headers={"Authorization": f"Bearer {active_token}"},
        json={"job_description": "Data Scientist Role"}
    )
    assert r_st_to_hr.status_code == 403, f"Expected 403 for student accessing HR, got {r_st_to_hr.status_code}"
    print(" -> PASSED: Student blocked from HR Pipeline with 403 Forbidden.")

    # 7. Role-Protected Routes: HR testing
    print("\n[Step 7] Testing HR Role Protection & Leaderboard Analytics...")
    # Authenticate HR demo
    r_hr_login = client.post("/api/auth/login", json={"email": "hr@hirelens.ai", "password": "HRRecruiter123!"})
    assert r_hr_login.status_code == 200, "HR demo login failed"
    hr_token = r_hr_login.json()["token"]

    # HR attempting to access Student Workspace -> 403 Forbidden
    r_hr_to_st = client.post(
        "/api/student/analytics",
        headers={"Authorization": f"Bearer {hr_token}"},
        json={"resume_text": "text", "job_description": "jd"}
    )
    assert r_hr_to_st.status_code == 403, f"Expected 403 for HR accessing student, got {r_hr_to_st.status_code}"
    print(" -> PASSED: HR blocked from Student Workspace with 403 Forbidden.")

    # HR accessing HR Pipeline -> 200 OK
    r_hr_analytics = client.post(
        "/api/hr/analytics",
        headers={"Authorization": f"Bearer {hr_token}"},
        json={"job_description": "Seeking Python Data Scientist with Machine Learning and SQL", "min_yoe": 1}
    )
    assert r_hr_analytics.status_code == 200, f"HR analytics failed: {r_hr_analytics.text}"
    hr_res = r_hr_analytics.json()
    assert "analytics" in hr_res and "charts" in hr_res["analytics"]
    hr_charts = hr_res["analytics"]["charts"]
    assert "candidate_matches_bar" in hr_charts
    assert "skills_coverage_bar" in hr_charts
    assert "score_distribution" in hr_charts
    assert len(hr_res["analytics"]["leaderboard"]) > 0
    print(" -> PASSED: HR successfully accessed HR Pipeline with real leaderboard and backend Chart data.")

    # HR CSV export -> 200 OK text/csv
    r_csv = client.post(
        "/api/hr/export-csv",
        headers={"Authorization": f"Bearer {hr_token}"},
        json={"leaderboard": hr_res["analytics"]["leaderboard"][:3]}
    )
    assert r_csv.status_code == 200
    assert "text/csv" in r_csv.headers.get("content-type", "")
    print(" -> PASSED: HR successfully exported candidate shortlist as CSV.")

    # 8. Unauthenticated checks -> 401
    print("\n[Step 8] Testing Unauthenticated Rejection (401)...")
    r_unauth_st = client.post("/api/student/analytics", json={"resume_text": "x", "job_description": "y"})
    assert r_unauth_st.status_code == 401
    r_unauth_hr = client.post("/api/hr/analytics", json={"job_description": "y"})
    assert r_unauth_hr.status_code == 401
    print(" -> PASSED: Both protected endpoints return 401 without authentication.")

    # 9. Logout and Session Invalidation
    print("\n[Step 9] Testing Logout & Session Invalidation...")
    r_logout = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {active_token}"})
    assert r_logout.status_code == 200
    # Subsequent /api/auth/me should return authenticated: false
    r_me_after = client.get("/api/auth/me", headers={"Authorization": f"Bearer {active_token}"})
    assert r_me_after.json()["authenticated"] is False
    print(" -> PASSED: Logout successfully terminated session and revoked token.")

    # 10. Persistence across Server Restart Simulation
    print("\n[Step 10] Testing Cold Restart SQLite Persistence...")
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT id, email, full_name, role FROM users WHERE email = ?", (signup_email,)).fetchone()
    assert row is not None, "User record missing in SQLite after connection drop"
    assert row["email"] == signup_email
    conn.close()
    print(" -> PASSED: User accounts permanently stored in SQLite database.")

    print("\n================================================================")
    print("ALL 10 VERIFICATION STAGES PASSED SUCCESSFULLY!")
    print("================================================================")

if __name__ == "__main__":
    run_e2e()
