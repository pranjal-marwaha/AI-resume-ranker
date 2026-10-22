# HireLens AI Core Package
from core.parser import parse_resume_content, extract_candidate_metadata
from core.matcher import analyze_resume_against_job
from core.analytics import generate_student_analytics, generate_hr_analytics
from core.auth import register_user, authenticate_user, create_session, get_session_user
from core.dataset_loader import (
    inspect_archive,
    load_dataset_sample,
    load_sample_as_hr_candidates,
    extract_sample_resumes,
)

__all__ = [
    "parse_resume_content",
    "extract_candidate_metadata",
    "analyze_resume_against_job",
    "generate_student_analytics",
    "generate_hr_analytics",
    "register_user",
    "authenticate_user",
    "create_session",
    "get_session_user",
    "inspect_archive",
    "load_dataset_sample",
    "load_sample_as_hr_candidates",
    "extract_sample_resumes",
]
