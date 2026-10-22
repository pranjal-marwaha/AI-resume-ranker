from io import StringIO
from pathlib import Path
from typing import Optional, List
import pandas as pd
from fastapi import FastAPI, UploadFile, File, Form, Request, HTTPException
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from core.parser import parse_resume_content, extract_candidate_metadata
from core.matcher import analyze_resume_against_job
from core.analytics import generate_student_analytics, generate_hr_analytics
from core.auth import (
    register_user,
    authenticate_user,
    create_session,
    get_session_user,
    terminate_session
)

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
STATIC_DIR.mkdir(exist_ok=True)

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="HireLens AI", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

def extract_token_from_request(request: Request) -> Optional[str]:
    """Extracts session token from Authorization header or Cookie."""
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header.split(" ", 1)[1].strip()
    custom_header = request.headers.get("x-session-token", "")
    if custom_header:
        return custom_header.strip()
    return request.cookies.get("hirelens_session")

def get_current_user(request: Request) -> Optional[dict]:
    token = extract_token_from_request(request)
    if not token:
        return None
    return get_session_user(token)

@app.get("/")
def get_index():
    index_file = STATIC_DIR / "index.html"
    return FileResponse(index_file)

@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "app": "HireLens AI",
        "version": "1.0.0"
    }

# -------------------------------------------------------------
# AUTHENTICATION ENDPOINTS
# -------------------------------------------------------------
@app.post("/api/auth/register")
async def register_endpoint(request: Request):
    """Registers a new user and creates an active session."""
    body = await request.json()
    email = body.get("email", "")
    password = body.get("password", "")
    full_name = body.get("full_name", "")
    role = body.get("role", "student")

    try:
        user = register_user(email, password, full_name, role)
        token = create_session(user["id"], user["role"])
        return {
            "status": "success",
            "message": "Account created successfully.",
            "token": token,
            "user": user
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/auth/login")
async def login_endpoint(request: Request):
    """Authenticates email & password, returning user & session token."""
    body = await request.json()
    email = body.get("email", "")
    password = body.get("password", "")

    user = authenticate_user(email, password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = create_session(user["id"], user["role"])
    return {
        "status": "success",
        "message": "Login successful.",
        "token": token,
        "user": user
    }

@app.post("/api/auth/logout")
async def logout_endpoint(request: Request):
    """Terminates active session."""
    token = extract_token_from_request(request)
    if token:
        terminate_session(token)
    return {"status": "success", "message": "Logged out successfully."}

@app.get("/api/auth/me")
async def current_user_endpoint(request: Request):
    """Returns the authenticated user or null."""
    user = get_current_user(request)
    if not user:
        return {"authenticated": False, "user": None}
    return {
        "authenticated": True,
        "user": {
            "id": user["user_id"],
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"]
        }
    }

# -------------------------------------------------------------
# STUDENT ANALYTICS ENDPOINT
# -------------------------------------------------------------
@app.post("/api/student/analytics")
async def student_analytics_endpoint(
    request: Request,
    file: Optional[UploadFile] = File(None),
    resume_text: Optional[str] = Form(None),
    job_description: Optional[str] = Form(None)
):
    """
    Computes rigorous, transparent Student Analytics:
    Protected route: Validates that if a session is present, it is permitted.
    """
    user = get_current_user(request)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Please log in to access the Student Workspace."
        )
    if user["role"] != "student":
        raise HTTPException(
            status_code=403,
            detail="Access forbidden: HR accounts cannot submit student resume diagnostics. Please use the HR Recruiter portal."
        )

    content_type = request.headers.get("content-type", "")
    r_text = ""
    jd_text = ""
    filename = "pasted_text.txt"

    if "application/json" in content_type:
        try:
            body = await request.json()
            r_text = body.get("resume_text", "")
            jd_text = body.get("job_description", "")
            filename = body.get("filename", "pasted_text.txt")
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON payload.")
    else:
        r_text = resume_text or ""
        jd_text = job_description or ""
        if file and file.filename:
            filename = file.filename
            ext = Path(filename).suffix.lower()
            valid_exts = {".pdf", ".docx", ".txt", ".xlsx"}
            if ext not in valid_exts:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported file format '{ext}'. Supported formats are: PDF, DOCX, TXT, and XLSX."
                )
            content = await file.read()
            if len(content) == 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"Uploaded resume '{filename}' is empty (0 bytes). Please upload a valid document."
                )
            parsed = parse_resume_content(content, filename)
            r_text = parsed.get("raw_text", "")
            if r_text.startswith("[PDF Extraction Error") or r_text.startswith("[DOCX Extraction Error"):
                raise HTTPException(
                    status_code=400,
                    detail=f"Could not extract readable text from '{filename}'. The file may be corrupted, image-only, or encrypted."
                )

    if not r_text.strip():
        raise HTTPException(
            status_code=400,
            detail="No resume text provided. Please upload a file (PDF/DOCX/TXT/XLSX) or provide resume text."
        )
    if not jd_text.strip():
        raise HTTPException(
            status_code=400,
            detail="Job description is required for job-specific match calculation."
        )

    metadata = extract_candidate_metadata(r_text)
    analytics = generate_student_analytics(r_text, jd_text, metadata)

    return {
        "status": "success",
        "filename": filename,
        "metadata": metadata,
        "analytics": analytics,
        "user": user
    }

# -------------------------------------------------------------
# HR PIPELINE ANALYTICS ENDPOINT (ROLE PROTECTED)
# -------------------------------------------------------------
@app.post("/api/hr/analytics")
async def hr_analytics_endpoint(
    request: Request,
    files: Optional[List[UploadFile]] = File(None),
    job_description: Optional[str] = Form(None),
    min_yoe: Optional[int] = Form(0)
):
    """
    Role Protected: Requires HR credentials (401 unauthenticated, 403 for students).
    """
    user = get_current_user(request)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Please log in to access the HR Recruiter Pipeline."
        )
    if user["role"] != "hr":
        raise HTTPException(
            status_code=403,
            detail="Access forbidden: Student accounts cannot access the HR recruiter pipeline."
        )

    content_type = request.headers.get("content-type", "")
    candidates_list: List[dict] = []
    jd_text = job_description or ""
    threshold_yoe = min_yoe or 0

    if "application/json" in content_type:
        try:
            body = await request.json()
            jd_text = body.get("job_description", "")
            threshold_yoe = body.get("min_yoe", 0)
            candidates_list = body.get("candidates", [])
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON payload.")
    else:
        if files:
            for f in files:
                if f.filename:
                    content = await f.read()
                    parsed = parse_resume_content(content, f.filename)
                    if parsed.get("type") == "excel" and "candidates" in parsed:
                        candidates_list.extend(parsed["candidates"])
                    else:
                        candidates_list.append({
                            "NAME": Path(f.filename).stem,
                            "raw_text": parsed.get("raw_text", ""),
                            "EDU": "Unavailable",
                            "YOE": None
                        })

    if not candidates_list:
        example_path = BASE_DIR / "example.resume for prediction testing.xlsx"
        if example_path.exists():
            with open(example_path, "rb") as ef:
                parsed = parse_resume_content(ef.read(), example_path.name)
                candidates_list = parsed.get("candidates", [])

    if not candidates_list:
        raise HTTPException(
            status_code=400,
            detail="No candidate records found. Please upload an Excel workbook or individual resumes."
        )

    if not jd_text.strip():
        jd_text = "Seeking Data Scientist or Software Engineer skilled in Python, Machine Learning, Data Science, and SQL."

    hr_analytics = generate_hr_analytics(candidates_list, jd_text, min_yoe=threshold_yoe)

    return {
        "status": "success",
        "job_description_summary": jd_text[:200] + ("..." if len(jd_text) > 200 else ""),
        "min_yoe_filter": threshold_yoe,
        "analytics": hr_analytics,
        "user": user
    }

# -------------------------------------------------------------
# HR CSV EXPORT ENDPOINT (ROLE PROTECTED)
# -------------------------------------------------------------
@app.post("/api/hr/export-csv")
async def hr_export_csv_endpoint(request: Request):
    """Role Protected: Requires HR credentials."""
    user = get_current_user(request)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Please log in to export candidate data."
        )
    if user["role"] != "hr":
        raise HTTPException(
            status_code=403,
            detail="Access forbidden: Student accounts cannot export HR candidate shortlists."
        )

    try:
        body = await request.json()
        leaderboard = body.get("leaderboard", [])
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON request body.")

    if not leaderboard:
        raise HTTPException(status_code=400, detail="Leaderboard list is empty.")

    export_rows = []
    for item in leaderboard:
        export_rows.append({
            "Rank": item.get("rank"),
            "Candidate Name": item.get("name"),
            "Job Match %": f"{item.get('job_match_percentage')}%",
            "Skill Match %": f"{item.get('skill_match_percentage')}%",
            "Composite Score": item.get("composite_rank_score"),
            "Education": item.get("education"),
            "Experience (YOE)": item.get("years_of_experience"),
            "Eligibility": item.get("eligibility_indicator"),
            "Status": item.get("status"),
            "Matched Skills": ", ".join(item.get("matched_skills", [])),
            "Missing Skills": ", ".join(item.get("missing_skills", [])),
            "Tech Knowledge": item.get("tech_knowledge", ""),
            "Project Highlight": item.get("project_highlight", ""),
            "ATS Score": item.get("ats_readiness_score", "")
        })

    df = pd.DataFrame(export_rows)
    stream = StringIO()
    df.to_csv(stream, index=False)
    csv_bytes = stream.getvalue().encode("utf-8")

    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=hirelens_ranked_candidates.csv"}
    )

# -------------------------------------------------------------
# BACKWARD COMPATIBLE SINGLE ANALYSIS ENDPOINT
# -------------------------------------------------------------
@app.post("/api/analyze-resume")
async def analyze_resume_endpoint(
    request: Request,
    file: Optional[UploadFile] = File(None),
    resume_text: Optional[str] = Form(None),
    job_description: Optional[str] = Form(None)
):
    return await student_analytics_endpoint(request, file, resume_text, job_description)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
