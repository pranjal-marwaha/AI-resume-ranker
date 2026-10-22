import re
from typing import Dict, Any, List, Optional
from core.matcher import (
    analyze_resume_against_job,
    extract_skills_from_text,
    calculate_transparent_similarity,
    audit_ats_compliance,
    evaluate_legacy_model
)
from core.parser import extract_candidate_metadata

def generate_student_analytics(resume_text: str, job_description: str, metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Computes rigorous, transparent Student Analytics:
    1. Overall resume-job match percentage.
    2. ATS readiness score with a detailed issue breakdown.
    3. Missing keywords and skills checklist.
    4. What to add, remove, or improve in the resume (with explicit rationale).
    5. Prioritized action steps to maximize match and ATS readiness.
    6. Formatted chart data payloads (Chart.js ready).
    """
    base_analysis = analyze_resume_against_job(resume_text, job_description)
    if not metadata:
        metadata = extract_candidate_metadata(resume_text)

    skills_data = base_analysis["skills"]
    ats_data = base_analysis["ats_audit"]
    legacy_eval = base_analysis["legacy_model"]

    matched_skills = skills_data["matched"]
    missing_skills = skills_data["missing"]
    required_skills = skills_data["required_by_job"]
    additional_skills = skills_data["additional"]

    skill_match_pct = base_analysis["skill_match_percentage"]
    semantic_sim = base_analysis["semantic_similarity"]
    overall_match = base_analysis["overall_match_score"]

    # 1. Match explanation
    match_explanation = (
        f"Overall Match ({overall_match}%) is calculated as a weighted composite: "
        f"60% Skill Coverage ({skill_match_pct}%, based on {len(matched_skills)}/{len(required_skills) if required_skills else 1} target skills matched) "
        f"+ 40% Semantic Content Overlap ({semantic_sim}% TF-IDF cosine similarity against the job description text)."
    )

    # 2. ATS Readiness with detailed issue breakdown
    ats_score = ats_data["ats_score"]
    ats_issues = []
    
    if not ats_data["has_contact_info"]:
        ats_issues.append({
            "component": "Contact Details",
            "deduction": 20,
            "status": "Missing",
            "detail": "No valid email address was detected. ATS parsers need an email to index candidate profiles."
        })
    else:
        ats_issues.append({
            "component": "Contact Details",
            "deduction": 0,
            "status": "Passed",
            "detail": f"Contact email detected ({metadata.get('email', 'present')})."
        })

    missing_sections = [sec for sec, found in ats_data["sections"].items() if not found]
    if missing_sections:
        ats_issues.append({
            "component": "Standard Sections",
            "deduction": len(missing_sections) * 10,
            "status": "Incomplete",
            "detail": f"Missing standard section headers: {', '.join(s.capitalize() for s in missing_sections)}."
        })
    else:
        ats_issues.append({
            "component": "Standard Sections",
            "deduction": 0,
            "status": "Passed",
            "detail": "All 4 standard sections (Experience, Education, Skills, Projects) detected."
        })

    if not ats_data["has_quantifiable_metrics"]:
        ats_issues.append({
            "component": "Measurable Impact",
            "deduction": 20,
            "status": "Needs Improvement",
            "detail": "No quantifiable metrics found (percentages, latency reductions, user scale, or monetary impact)."
        })
    else:
        ats_issues.append({
            "component": "Measurable Impact",
            "deduction": 0,
            "status": "Passed",
            "detail": "Quantifiable performance metrics detected in work descriptions."
        })

    if ats_data["word_count"] < 150:
        ats_issues.append({
            "component": "Content Depth",
            "deduction": 20,
            "status": "Too Brief",
            "detail": f"Resume text is too brief ({ats_data['word_count']} words). Minimum recommended is 150-250 words."
        })
    else:
        ats_issues.append({
            "component": "Content Depth",
            "deduction": 0,
            "status": "Passed",
            "detail": f"Adequate content length ({ats_data['word_count']} words)."
        })

    # 3. Missing keywords checklist with severity
    missing_checklist = []
    for skill in missing_skills:
        missing_checklist.append({
            "skill": skill,
            "importance": "High" if skill in required_skills[:3] else "Medium",
            "recommendation": f"Add concrete project or experience bullet points demonstrating {skill}."
        })

    # 4. What to Add, Remove, or Improve
    add_recommendations = []
    if missing_skills:
        top_missing = missing_skills[:4]
        add_recommendations.append({
            "action": "Add Target Skills",
            "items": top_missing,
            "reason": f"These skills ({', '.join(top_missing)}) are emphasized in the job description but absent from your resume."
        })
    if not ats_data["has_quantifiable_metrics"]:
        add_recommendations.append({
            "action": "Add Metric-Driven Accomplishments",
            "items": ["Metrics (% improvement, scale, latency, users)"],
            "reason": "Top hiring teams prioritize impact metrics (e.g. 'Reduced loading time by 30% using Redis')."
        })

    remove_recommendations = []
    # Check for overused vague buzzwords
    vague_buzzwords = ["hardworking", "team player", "go-getter", "synergy", "detail-oriented", "self-motivated"]
    found_buzzwords = [bw for bw in vague_buzzwords if re.search(r'\b' + bw + r'\b', resume_text, re.I)]
    if found_buzzwords:
        remove_recommendations.append({
            "action": "Replace Vague Buzzwords",
            "items": found_buzzwords,
            "reason": "Subjective self-descriptors take up space without proving competence. Replace with factual project outcomes."
        })
    else:
        remove_recommendations.append({
            "action": "Maintain Concise Language",
            "items": ["Fluff phrases / Unverified claims"],
            "reason": "Keep text focused on concrete tools, responsibilities, and deliverables."
        })

    improve_recommendations = []
    if missing_sections:
        improve_recommendations.append({
            "action": "Standardize Section Layout",
            "items": [f"Create '{s.capitalize()}' header" for s in missing_sections],
            "reason": "Applicant Tracking Systems scan for standardized headers to correctly compartmentalize your background."
        })
    if matched_skills:
        improve_recommendations.append({
            "action": "Highlight Primary Matched Skills",
            "items": matched_skills[:3],
            "reason": "Ensure these validated matching skills appear in both your Skills list and in your project descriptions."
        })

    # 5. Prioritized action steps
    action_steps = [
        {
            "priority": 1,
            "title": "Incorporate Top Missing Core Skills",
            "description": f"Integrate {', '.join(missing_skills[:3]) if missing_skills else 'advanced domain keywords'} into your recent project descriptions."
        },
        {
            "priority": 2,
            "title": "Resolve ATS Structure Gaps",
            "description": "Ensure your resume contains clear 'Experience', 'Projects', and 'Education' headers and displays your email clearly."
        },
        {
            "priority": 3,
            "title": "Quantify Results in Bullet Points",
            "description": "Rewrite at least two project bullet points to use the 'Accomplished [X], as measured by [Y], by doing [Z]' framework."
        }
    ]

    # 6. Chart data structures
    chart_data = {
        "skills_bar": {
            "labels": ["Matched Skills", "Missing Skills", "Additional Relevant Skills"],
            "values": [len(matched_skills), len(missing_skills), len(additional_skills)],
            "colors": ["#16a34a", "#dc2626", "#2563eb"]
        },
        "skills_doughnut": {
            "labels": ["Skills Matched", "Skills Missing"],
            "values": [len(matched_skills), len(missing_skills)],
            "colors": ["#2563eb", "#e2e8f0"]
        },
        "score_radar": {
            "labels": ["Skill Match %", "Semantic Similarity", "ATS Structure", "Content Depth"],
            "values": [
                skill_match_pct,
                semantic_sim,
                ats_score,
                min(100.0, round((ats_data["word_count"] / 350.0) * 100, 1))
            ]
        }
    }

    return {
        "overall_match_percentage": overall_match,
        "match_calculation_explanation": match_explanation,
        "ats_readiness": {
            "score": ats_score,
            "category": "High" if ats_score >= 80 else ("Moderate" if ats_score >= 50 else "Low"),
            "issues": ats_issues
        },
        "skills_audit": {
            "matched_skills": matched_skills,
            "missing_skills": missing_skills,
            "additional_skills": additional_skills,
            "missing_checklist": missing_checklist
        },
        "resume_improvements": {
            "add": add_recommendations,
            "remove": remove_recommendations,
            "improve": improve_recommendations
        },
        "prioritized_steps": action_steps,
        "charts": chart_data,
        "legacy_model_baseline": legacy_eval
    }

def generate_hr_analytics(candidates: List[Dict[str, Any]], job_description: str, min_yoe: int = 0) -> Dict[str, Any]:
    """
    Computes rigorous, transparent HR Pipeline Analytics:
    1. Ranked candidate leaderboard with job-match percentages.
    2. Candidate-wise matched and missing skills.
    3. ATS/readiness and eligibility indicators based on actual data.
    4. Candidate comparison and transparent ranking breakdown.
    5. Chart data: candidate match-score bar chart, skills coverage, and score distribution.
    6. Pipeline summary metrics (total analyzed, qualified count, shortlist count, skill coverage).
    """
    jd_skills = extract_skills_from_text(job_description)
    ranked_candidates = []

    # Track overall skills frequency across all candidates
    skill_frequency = {skill: 0 for skill in jd_skills}
    score_brackets = {"<50%": 0, "50-69%": 0, "70-84%": 0, "85-100%": 0}

    for idx, cand in enumerate(candidates):
        # Extract or synthesize candidate text
        raw_text = cand.get("combined_text") or cand.get("raw_text") or ""
        name = cand.get("NAME") or cand.get("name") or f"Candidate {idx + 1}"
        edu = str(cand.get("EDU") or cand.get("edu") or "Unavailable")
        
        # Parse YOE safely
        raw_yoe = cand.get("YOE") if cand.get("YOE") is not None else cand.get("yoe")
        if raw_yoe is not None and str(raw_yoe).strip() != "" and str(raw_yoe) != "None":
            try:
                yoe = float(raw_yoe)
            except (ValueError, TypeError):
                yoe = None
        else:
            yoe = None

        # Individual analysis against the target job
        analysis = analyze_resume_against_job(raw_text, job_description)
        match_score = analysis["overall_match_score"]
        skill_match_pct = analysis["skill_match_percentage"]
        semantic_sim = analysis["semantic_similarity"]
        matched_skills = analysis["skills"]["matched"]
        missing_skills = analysis["skills"]["missing"]

        # Track skill frequency in talent pool
        for s in matched_skills:
            if s in skill_frequency:
                skill_frequency[s] += 1

        # Track score bracket
        if match_score < 50:
            score_brackets["<50%"] += 1
        elif match_score < 70:
            score_brackets["50-69%"] += 1
        elif match_score < 85:
            score_brackets["70-84%"] += 1
        else:
            score_brackets["85-100%"] += 1

        # Transparent Rank Score Calculation
        # Base: Job Match Score (0 - 100)
        # Bonus: Education (PhD: 15, PG: 10, UG: 5)
        # Bonus: YOE (YOE * 2, capped at 20)
        # Bonus: Legacy ML model match (+10 if matched)
        edu_bonus = 0
        edu_lower = edu.lower()
        if "phd" in edu_lower or "p.hd" in edu_lower:
            edu_bonus = 15
        elif "pg" in edu_lower or "master" in edu_lower:
            edu_bonus = 10
        elif "ug" in edu_lower or "bachelor" in edu_lower:
            edu_bonus = 5

        yoe_bonus = min(20, int(yoe * 2)) if yoe is not None else 0
        legacy_matched = bool(analysis["legacy_model"].get("matched", False))
        ml_bonus = 10 if legacy_matched else 0

        # Total composite ranking score
        composite_rank = round(match_score + edu_bonus + yoe_bonus + ml_bonus, 1)

        # Eligibility check
        if yoe is not None and min_yoe > 0:
            eligibility = "Eligible" if yoe >= min_yoe else f"Under Experience ({yoe}/{min_yoe} yrs)"
        elif yoe is not None:
            eligibility = f"{int(yoe)} yrs exp"
        else:
            eligibility = "Experience Unavailable"

        ats_audit = analysis["ats_audit"]

        candidate_record = {
            "candidate_id": f"cand-{idx + 1}",
            "name": name,
            "education": edu,
            "years_of_experience": yoe if yoe is not None else "Unavailable",
            "job_match_percentage": match_score,
            "skill_match_percentage": skill_match_pct,
            "semantic_similarity": semantic_sim,
            "matched_skills": matched_skills,
            "missing_skills": missing_skills,
            "tech_knowledge": cand.get("TECH KN.", "Unavailable"),
            "project_highlight": cand.get("HANDS ON PROJECT", "Unavailable"),
            "certifications": cand.get("CERTIFICATIONS", "Unavailable"),
            "ats_readiness_score": ats_audit["ats_score"],
            "eligibility_indicator": eligibility,
            "legacy_ml_match": legacy_matched,
            "composite_rank_score": composite_rank,
            "score_breakdown": {
                "base_job_match": match_score,
                "education_bonus": edu_bonus,
                "experience_bonus": yoe_bonus,
                "ml_model_bonus": ml_bonus,
                "formula": f"{match_score} (Match) + {edu_bonus} (Edu) + {yoe_bonus} (YOE) + {ml_bonus} (ML) = {composite_rank}"
            },
            "status": "Review"
        }
        ranked_candidates.append(candidate_record)

    # Sort descending by composite_rank_score, then job_match_percentage
    ranked_candidates.sort(key=lambda x: (x["composite_rank_score"], x["job_match_percentage"]), reverse=True)

    # Assign rank indices and auto-recommend shortlisting for top candidates
    total_count = len(ranked_candidates)
    shortlist_count = 0
    for rank_idx, cand in enumerate(ranked_candidates):
        cand["rank"] = rank_idx + 1
        if cand["job_match_percentage"] >= 50 or rank_idx < 3:
            cand["status"] = "Shortlisted"
            shortlist_count += 1

    # Skills coverage percentage across candidate pool
    skills_coverage = []
    for skill, count in skill_frequency.items():
        pct = round((count / total_count) * 100, 1) if total_count > 0 else 0.0
        skills_coverage.append({
            "skill": skill,
            "candidates_possessing": count,
            "coverage_percentage": pct
        })
    skills_coverage.sort(key=lambda x: x["coverage_percentage"], reverse=True)

    # Average pool skill coverage
    avg_pool_coverage = round(
        sum(item["coverage_percentage"] for item in skills_coverage) / len(skills_coverage), 1
    ) if skills_coverage else 0.0

    # HR Graphs data structure
    charts = {
        "candidate_matches_bar": {
            "labels": [c["name"] for c in ranked_candidates[:10]],
            "values": [c["job_match_percentage"] for c in ranked_candidates[:10]]
        },
        "skills_coverage_bar": {
            "labels": [s["skill"] for s in skills_coverage[:8]],
            "values": [s["coverage_percentage"] for s in skills_coverage[:8]]
        },
        "score_distribution": {
            "labels": list(score_brackets.keys()),
            "values": list(score_brackets.values())
        }
    }

    return {
        "summary": {
            "total_candidates_analyzed": total_count,
            "shortlisted_count": shortlist_count,
            "average_job_match": round(sum(c["job_match_percentage"] for c in ranked_candidates) / total_count, 1) if total_count > 0 else 0.0,
            "average_pool_skill_coverage": avg_pool_coverage
        },
        "leaderboard": ranked_candidates,
        "skills_coverage_breakdown": skills_coverage,
        "charts": charts,
        "explanation": (
            "Leaderboard ranks candidates using a transparent multi-factor formula: "
            "Base Job-Match % (Skill Match + Text Semantic Similarity) + Education Level Bonus + Experience Bonus + Legacy Model Prediction."
        )
    }
