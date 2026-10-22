import sys
from pathlib import Path
from fastapi.testclient import TestClient

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from server import app
from core.auth import create_session, authenticate_user

client = TestClient(app)

def test_api():
    print("Testing API Route Protection...")
    
    # 1. Unauthenticated request to /api/student/analytics -> 401
    r_unauth_st = client.post("/api/student/analytics", json={"resume_text": "sample", "job_description": "sample"})
    assert r_unauth_st.status_code == 401, f"Expected 401, got {r_unauth_st.status_code}"
    print(" -> PASSED: Unauthenticated student access returned 401.")

    # 2. Unauthenticated request to /api/hr/analytics -> 401
    r_unauth_hr = client.post("/api/hr/analytics", json={"job_description": "sample"})
    assert r_unauth_hr.status_code == 401, f"Expected 401, got {r_unauth_hr.status_code}"
    print(" -> PASSED: Unauthenticated HR access returned 401.")

    # 3. Authenticate demo users and create sessions
    st_user = authenticate_user("student@hirelens.ai", "StudentPass123!")
    hr_user = authenticate_user("hr@hirelens.ai", "HRRecruiter123!")
    st_token = create_session(st_user["id"], "student")
    hr_token = create_session(hr_user["id"], "hr")

    # 4. Student token on HR endpoint -> 403 Forbidden
    r_st_to_hr = client.post(
        "/api/hr/analytics",
        headers={"Authorization": f"Bearer {st_token}"},
        json={"job_description": "Data Scientist with Python and SQL"}
    )
    assert r_st_to_hr.status_code == 403, f"Expected 403, got {r_st_to_hr.status_code}: {r_st_to_hr.text}"
    print(" -> PASSED: Student blocked from HR analytics with 403 Forbidden.")

    # 5. HR token on Student endpoint -> 403 Forbidden
    r_hr_to_st = client.post(
        "/api/student/analytics",
        headers={"Authorization": f"Bearer {hr_token}"},
        json={"resume_text": "sample resume", "job_description": "sample jd"}
    )
    assert r_hr_to_st.status_code == 403, f"Expected 403, got {r_hr_to_st.status_code}: {r_hr_to_st.text}"
    print(" -> PASSED: HR blocked from Student analytics with 403 Forbidden.")

    # 6. Valid Student request -> 200 OK
    r_st_valid = client.post(
        "/api/student/analytics",
        headers={"Authorization": f"Bearer {st_token}"},
        json={
            "resume_text": "Experienced Python and SQL developer with Machine Learning skills.",
            "job_description": "Seeking Python Machine Learning engineer with SQL."
        }
    )
    assert r_st_valid.status_code == 200, f"Expected 200, got {r_st_valid.status_code}: {r_st_valid.text}"
    st_data = r_st_valid.json()
    assert "analytics" in st_data and "charts" in st_data["analytics"]
    print(" -> PASSED: Authenticated Student access succeeded with 200 and real analytics.")

    # 7. Valid HR request -> 200 OK
    r_hr_valid = client.post(
        "/api/hr/analytics",
        headers={"Authorization": f"Bearer {hr_token}"},
        json={
            "job_description": "Seeking Data Scientist skilled in Python, Machine Learning, Data Science, and SQL.",
            "min_yoe": 1
        }
    )
    assert r_hr_valid.status_code == 200, f"Expected 200, got {r_hr_valid.status_code}: {r_hr_valid.text}"
    hr_data = r_hr_valid.json()
    assert "analytics" in hr_data and "leaderboard" in hr_data["analytics"]
    print(" -> PASSED: Authenticated HR access succeeded with 200 and real analytics.")

    print("\nALL API SECURITY CHECKS PASSED!")

if __name__ == "__main__":
    test_api()
