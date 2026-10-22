"""
Test script for Phase 7: Dataset Integration.
Tests:
1. Inspecting the archive without loading the full 53MB dataset into memory.
2. Extracting a small dedicated sample into datasets/samples/.
3. Parsing real sample PDF resumes from the dataset.
4. Running the matching engine and student analytics on dataset samples.
5. Running HR pipeline analytics on a sample candidate batch from the dataset.
6. Verifying preservation of original models, notebook, and data artifacts.
"""

from pathlib import Path
import sys

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from core.dataset_loader import (
    inspect_archive,
    load_dataset_sample,
    load_sample_as_hr_candidates,
    extract_sample_resumes
)
from core.parser import parse_resume_content, extract_candidate_metadata
from core.matcher import analyze_resume_against_job
from core.analytics import generate_student_analytics, generate_hr_analytics


def main():
    print("=" * 70)
    print("PHASE 7 — DATASET INTEGRATION TEST SUITE")
    print("=" * 70)

    # 1. Inspect archive
    print("\n[Step 1] Inspecting dataset archive (archive (1).zip)...")
    info = inspect_archive()
    print(f"  Archive Name: {info['archive_filename']}")
    print(f"  Archive Size: {info['archive_size_mb']} MB ({info['archive_size_bytes']} bytes)")
    print(f"  Total Archive Entries: {info['total_entries']}")
    print(f"  Total Resumes in CSV: {info['csv_metadata']['total_records']}")
    print(f"  CSV Columns: {info['csv_metadata']['columns']}")
    print(f"  Total Categories: {info['total_categories']}")
    print(f"  Top Categories: {dict(list(info['category_distribution'].items())[:5])}")

    assert info["csv_metadata"]["columns"] == ["ID", "Resume_str", "Resume_html", "Category"], "Unexpected columns in Resume.csv"
    assert info["csv_metadata"]["total_records"] == 2484, f"Expected 2484 records, found {info['csv_metadata']['total_records']}"
    print("  [PASS] Step 1 Passed: Archive schema and metadata verified.")

    # 2. Extract small sample into datasets/samples/
    print("\n[Step 2] Extracting small sample of PDFs into datasets/samples/...")
    extracted_files = extract_sample_resumes(
        samples_per_category=1,
        categories=["INFORMATION-TECHNOLOGY", "ENGINEERING", "HR"]
    )
    print(f"  Extracted {len(extracted_files)} sample resume PDFs:")
    for p in extracted_files:
        print(f"    - {p.relative_to(BASE_DIR)} ({p.stat().st_size} bytes)")
    assert len(extracted_files) >= 3, "Failed to extract sample PDFs"
    print("  [PASS] Step 2 Passed: Sample files extracted to dedicated datasets folder.")

    # 3. Test parsing real sample PDF from dataset
    print("\n[Step 3] Testing parsing on an extracted sample PDF...")
    sample_pdf = extracted_files[0]
    with open(sample_pdf, "rb") as f:
        pdf_bytes = f.read()
    parsed_pdf = parse_resume_content(pdf_bytes, sample_pdf.name)
    assert parsed_pdf["type"] == "pdf", f"Expected type 'pdf', got {parsed_pdf['type']}"
    raw_pdf_text = parsed_pdf["raw_text"]
    assert len(raw_pdf_text) > 100, "Extracted PDF text is too short or empty"
    print(f"  Parsed {sample_pdf.name} successfully ({len(raw_pdf_text)} characters)")
    meta = extract_candidate_metadata(raw_pdf_text)
    print(f"  Detected Metadata: Degree={meta['detected_degree']}, YOE={meta['detected_yoe']}, Email={meta['email']}")
    print("  [PASS] Step 3 Passed: PDF extraction and metadata parsing verified on dataset.")

    # 4. Test loading text samples via stream & matching engine
    print("\n[Step 4] Testing streaming text samples and matching engine...")
    it_samples = load_dataset_sample(n=2, category="INFORMATION-TECHNOLOGY")
    assert len(it_samples) == 2, f"Expected 2 samples, got {len(it_samples)}"
    print(f"  Loaded {len(it_samples)} IT resumes without loading full dataset into memory.")
    
    target_jd = (
        "Seeking a Senior Software Engineer / Data Scientist proficient in Python, "
        "SQL, Machine Learning, Git, Cloud technologies, and automated software pipelines."
    )
    
    it_resume = it_samples[0]
    match_result = analyze_resume_against_job(it_resume["raw_text"], target_jd)
    print(f"  Matching result for {it_resume['name']} ({it_resume['category']}):")
    print(f"    Overall Match Score: {match_result['overall_match_score']}%")
    print(f"    Skill Match: {match_result['skill_match_percentage']}%")
    print(f"    Matched Skills: {match_result['skills']['matched']}")
    print(f"    Missing Skills: {match_result['skills']['missing']}")
    print(f"    Legacy ML Model Prediction: {match_result['legacy_model']}")
    assert "overall_match_score" in match_result
    assert "skills" in match_result
    print("  [PASS] Step 4 Passed: Matching engine executed on dataset resume.")

    # 5. Test Student Analytics on sample
    print("\n[Step 5] Testing Student Analytics on dataset sample...")
    cand_meta = extract_candidate_metadata(it_resume["raw_text"])
    student_analytics = generate_student_analytics(it_resume["raw_text"], target_jd, cand_meta)
    print(f"  ATS Score: {student_analytics['ats_readiness']['score']} ({student_analytics['ats_readiness']['category']})")
    print(f"  Top Action Step: {student_analytics['prioritized_steps'][0]['title']}")
    assert "overall_match_percentage" in student_analytics
    assert "charts" in student_analytics
    print("  [PASS] Step 5 Passed: Student analytics computed successfully.")

    # 6. Test HR Pipeline Analytics on sample candidate pool
    print("\n[Step 6] Testing HR Pipeline Analytics on dataset candidate batch...")
    hr_candidates = load_sample_as_hr_candidates(n=5, category="INFORMATION-TECHNOLOGY")
    assert len(hr_candidates) == 5
    hr_analytics = generate_hr_analytics(hr_candidates, target_jd, min_yoe=1)
    
    summary = hr_analytics["summary"]
    leaderboard = hr_analytics["leaderboard"]
    charts = hr_analytics["charts"]
    
    print(f"  Total Candidates Analyzed: {summary['total_candidates_analyzed']}")
    print(f"  Shortlisted Count: {summary['shortlisted_count']}")
    print(f"  Average Job Match: {summary['average_job_match']}%")
    print(f"  Average Pool Skill Coverage: {summary['average_pool_skill_coverage']}%")
    print("  Leaderboard Top Candidate:")
    top_c = leaderboard[0]
    print(f"    Rank {top_c['rank']}: {top_c['name']} - Match: {top_c['job_match_percentage']}% (Composite: {top_c['composite_rank_score']}) - Status: {top_c['status']}")
    
    assert len(leaderboard) == 5
    assert "candidate_matches_bar" in charts
    assert "skills_coverage_bar" in charts
    assert "score_distribution" in charts
    print("  [PASS] Step 6 Passed: HR Analytics pipeline computed successfully.")

    # 7. Verify preservation of original artifacts
    print("\n[Step 7] Verifying preservation of original project artifacts...")
    artifacts = [
        BASE_DIR / "archive (1).zip",
        BASE_DIR / "labeled_resumes.xlsx",
        BASE_DIR / "example.resume for prediction testing.xlsx",
        BASE_DIR / "source code.ipynb",
        BASE_DIR / "resume_ranker_model.pkl",
        BASE_DIR / "tfidf_vectorizer.pkl",
        BASE_DIR / "app.py",
        BASE_DIR / "server.py"
    ]
    for art in artifacts:
        assert art.exists(), f"Artifact missing: {art.name}"
        print(f"  Preserved: {art.name} ({art.stat().st_size} bytes)")
    print("  [PASS] Step 7 Passed: All original models, datasets, and notebook preserved untouched.")

    print("\n" + "=" * 70)
    print("PHASE 7 INTEGRATION TESTS PASSED COMPLETELY")
    print("=" * 70)


if __name__ == "__main__":
    main()
