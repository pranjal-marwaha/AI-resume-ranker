import urllib.request
import json
import time

def test_live_server():
    print("==================================================")
    print("VERIFYING LIVE SERVER HTTP ENDPOINTS")
    print("==================================================")
    
    # 1. Test /api/health on localhost and 127.0.0.1
    for host in ["localhost", "127.0.0.1"]:
        url = f"http://{host}:8000/api/health"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as resp:
            assert resp.status == 200, f"Expected 200, got {resp.status}"
            data = json.loads(resp.read().decode("utf-8"))
            assert data["status"] == "ok", f"Expected ok status, got {data}"
            print(f" -> PASSED: {url} responded with 200 OK: {data}")

    # 2. Test root /
    url = "http://localhost:8000/"
    with urllib.request.urlopen(url, timeout=5) as resp:
        assert resp.status == 200
        content = resp.read().decode("utf-8")
        assert "HireLens AI" in content
        assert "auth-view" in content
        print(f" -> PASSED: {url} served HTML successfully ({len(content)} bytes).")

    # 3. Test Student Demo Login
    url_login = "http://localhost:8000/api/auth/login"
    login_payload = json.dumps({"email": "student@hirelens.ai", "password": "StudentPass123!"}).encode("utf-8")
    req_login = urllib.request.Request(url_login, data=login_payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req_login, timeout=5) as resp:
        assert resp.status == 200
        login_res = json.loads(resp.read().decode("utf-8"))
        assert login_res["status"] == "success"
        st_token = login_res["token"]
        print(f" -> PASSED: Student Demo Login succeeded, token received.")

    # 4. Test Student Protected Route with Token
    url_st_analytics = "http://localhost:8000/api/student/analytics"
    analytics_payload = json.dumps({
        "resume_text": "Experienced Python, Machine Learning, SQL, and Pandas Developer.",
        "job_description": "Data Scientist proficient in Python and SQL."
    }).encode("utf-8")
    req_st = urllib.request.Request(
        url_st_analytics,
        data=analytics_payload,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {st_token}"}
    )
    with urllib.request.urlopen(req_st, timeout=10) as resp:
        assert resp.status == 200
        st_data = json.loads(resp.read().decode("utf-8"))
        assert "analytics" in st_data
        print(f" -> PASSED: Student Analytics responded with 200 OK and match data.")

    # 5. Test HR Demo Login
    hr_payload = json.dumps({"email": "hr@hirelens.ai", "password": "HRRecruiter123!"}).encode("utf-8")
    req_hr_login = urllib.request.Request(url_login, data=hr_payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req_hr_login, timeout=5) as resp:
        assert resp.status == 200
        hr_login_res = json.loads(resp.read().decode("utf-8"))
        hr_token = hr_login_res["token"]
        print(f" -> PASSED: HR Demo Login succeeded, token received.")

    # 6. Test HR Protected Route with Token
    url_hr_analytics = "http://localhost:8000/api/hr/analytics"
    hr_ana_payload = json.dumps({
        "job_description": "Looking for Data Scientist with Python and SQL",
        "min_yoe": 1
    }).encode("utf-8")
    req_hr = urllib.request.Request(
        url_hr_analytics,
        data=hr_ana_payload,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {hr_token}"}
    )
    with urllib.request.urlopen(req_hr, timeout=10) as resp:
        assert resp.status == 200
        hr_data = json.loads(resp.read().decode("utf-8"))
        assert "analytics" in hr_data
        print(f" -> PASSED: HR Analytics responded with 200 OK and leaderboard.")

    # 7. Test Student trying to access HR (should fail with 403 Forbidden)
    req_forbidden = urllib.request.Request(
        url_hr_analytics,
        data=hr_ana_payload,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {st_token}"}
    )
    try:
        urllib.request.urlopen(req_forbidden, timeout=5)
        assert False, "Should have returned 403 Forbidden"
    except urllib.error.HTTPError as e:
        assert e.code == 403, f"Expected 403, got {e.code}"
        print(f" -> PASSED: Role Guard blocked Student from HR route with 403 Forbidden.")

    print("\n==================================================")
    print("ALL LIVE NETWORK HTTP TESTS PASSED!")
    print("==================================================")

if __name__ == "__main__":
    test_live_server()
