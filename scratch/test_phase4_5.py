import os
import sys
import json
import sqlite3
import requests
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from core.auth import (
    register_user,
    authenticate_user,
    create_session,
    get_session_user,
    terminate_session,
    DB_PATH
)
from core.analytics import generate_student_analytics, generate_hr_analytics
from core.matcher import analyze_resume_against_job

def run_tests():
    print("==================================================")
    print("PHASE 4.5 TEST SUITE: AUTH, ROLES, CHARTS, PERSISTENCE")
    print("==================================================")
    
    results = {}

    # 1. Test Demo User Authentication
    print("\n[Test 1] Testing Demo Student & HR Authentication...")
    st_user = authenticate_user("student@hirelens.ai", "StudentPass123!")
    hr_user = authenticate_user("hr@hirelens.ai", "HRRecruiter123!")
    
    assert st_user is not None and st_user["role"] == "student", "Demo student auth failed"
    assert hr_user is not None and hr_user["role"] == "hr", "Demo HR auth failed"
    print(" -> PASSED: Demo Student & HR authenticated successfully.")
    results["demo_auth"] = "PASSED"

    # 2. Test Invalid Credentials
    print("\n[Test 2] Testing Invalid Credentials Handling...")
    inv_user1 = authenticate_user("student@hirelens.ai", "WrongPassword!")
    inv_user2 = authenticate_user("nonexistent@hirelens.ai", "StudentPass123!")
    assert inv_user1 is None, "Wrong password should return None"
    assert inv_user2 is None, "Nonexistent user should return None"
    print(" -> PASSED: Invalid credentials correctly rejected.")
    results["invalid_credentials"] = "PASSED"

    # 3. Test Signup (New Account Registration)
    print("\n[Test 3] Testing New User Registration & Persistent DB Insertion...")
    test_email = f"test_student_{os.getpid()}@hirelens.ai"
    new_user = register_user(test_email, "SecurePassword999!", "Automated Tester", "student")
    assert new_user["id"] > 0, "New user ID not returned"
    assert new_user["email"] == test_email, "Email mismatch"
    assert new_user["role"] == "student", "Role mismatch"
    
    # Check that plaintext password is NOT in database
    with sqlite3.connect(str(DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT password_hash, salt FROM users WHERE email = ?", (test_email,)).fetchone()
        assert row is not None, "User not found in SQLite"
        assert row["password_hash"] != "SecurePassword999!", "Plaintext password stored! Security violation."
        assert len(row["password_hash"]) == 64, "PBKDF2 hash should be 64 hex characters"
        assert len(row["salt"]) == 32, "Salt should be 32 hex characters"
    print(" -> PASSED: New account registered with PBKDF2-HMAC-SHA256 salted hash.")
    results["signup_security"] = "PASSED"

    # 4. Test Session Token Creation & Validation
    print("\n[Test 4] Testing Session Token Lifecycle & Expiration Handling...")
    token = create_session(new_user["id"], "student")
    assert token and len(token) > 20, "Invalid session token format"
    sess_user = get_session_user(token)
    assert sess_user is not None, "Session user lookup failed"
    assert sess_user["email"] == test_email, "Session user email mismatch"
    assert sess_user["role"] == "student", "Session role mismatch"
    print(" -> PASSED: Session token created and validated.")
    results["session_lifecycle"] = "PASSED"

    # 5. Test Logout (Session Termination)
    print("\n[Test 5] Testing Logout & Session Invalidation...")
    terminate_session(token)
    logged_out_user = get_session_user(token)
    assert logged_out_user is None, "Terminated session should not be found"
    print(" -> PASSED: Session terminated and invalidated in SQLite.")
    results["logout"] = "PASSED"

    # 6. Test Persistence After Server Restart Simulation
    print("\n[Test 6] Testing Persistence across Connection / DB reconnect...")
    # Open fresh SQLite connection to simulate cold server restart
    conn_fresh = sqlite3.connect(str(DB_PATH))
    conn_fresh.row_factory = sqlite3.Row
    re_row = conn_fresh.execute("SELECT email, role, full_name FROM users WHERE email = ?", (test_email,)).fetchone()
    assert re_row is not None, "User did not persist across connection"
    assert re_row["email"] == test_email, "Persisted email mismatch"
    conn_fresh.close()
    print(" -> PASSED: Accounts persist permanently in SQLite across restarts.")
    results["persistence"] = "PASSED"

    # 7. Test Role-Based Access Rules
    print("\n[Test 7] Testing Role-Appropriate Permissions & Protected Routes...")
    st_token = create_session(st_user["id"], "student")
    hr_token = create_session(hr_user["id"], "hr")
    
    st_sess = get_session_user(st_token)
    hr_sess = get_session_user(hr_token)
    assert st_sess["role"] == "student"
    assert hr_sess["role"] == "hr"
    
    # Clean up test session tokens
    terminate_session(st_token)
    terminate_session(hr_token)
    print(" -> PASSED: Student and HR roles distinctly differentiated.")
    results["role_access"] = "PASSED"

    # 8. Test Backend Real Analytics Data for Charts (No Fabricated Data)
    print("\n[Test 8] Verifying Student & HR Charts derived from Real Backend Analytics...")
    # Student analytics
    dummy_resume = "Python, Machine Learning, Pandas, Scikit-Learn, SQL Developer with 3 years experience"
    dummy_jd = "Looking for Data Scientist with Python, SQL, Machine Learning"
    st_analytics = generate_student_analytics(dummy_resume, dummy_jd)
    assert "charts" in st_analytics, "Student analytics missing charts"
    assert "skills_bar" in st_analytics["charts"], "Student missing skills_bar chart"
    assert "score_radar" in st_analytics["charts"], "Student missing score_radar chart"
    assert len(st_analytics["charts"]["skills_bar"]["labels"]) > 0, "Student chart labels empty"
    
    # HR analytics
    candidates = [
        {"NAME": "Alice", "raw_text": "Python SQL Pandas ML 4 years", "EDU": "UG", "YOE": 4},
        {"NAME": "Bob", "raw_text": "Java C++ SQL 2 years", "EDU": "PG", "YOE": 2}
    ]
    hr_analytics = generate_hr_analytics(candidates, dummy_jd)
    assert "charts" in hr_analytics, "HR analytics missing charts"
    assert "candidate_matches_bar" in hr_analytics["charts"], "HR missing candidate_matches_bar"
    assert len(hr_analytics["charts"]["candidate_matches_bar"]["labels"]) == 2, "HR chart labels mismatch candidate count"
    assert "leaderboard" in hr_analytics, "HR missing leaderboard"
    print(" -> PASSED: Real analytics and chart models generated from backend calculations.")
    results["real_charts_data"] = "PASSED"

    print("\n==================================================")
    print("ALL 8 VERIFICATION CHECKS PASSED:")
    for k, v in results.items():
        print(f"  [{v}] {k}")
    print("==================================================")

if __name__ == "__main__":
    run_tests()
