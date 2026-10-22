import re
import warnings
from pathlib import Path
from typing import Dict, Any, List, Set, Tuple
import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# Suppress sklearn unpickling version warnings
warnings.filterwarnings("ignore", category=UserWarning)

BASE_DIR = Path(__file__).resolve().parent.parent

# Attempt loading the original model artifacts
MODEL_PATH = BASE_DIR / "resume_ranker_model.pkl"
VECTORIZER_PATH = BASE_DIR / "tfidf_vectorizer.pkl"

legacy_model = None
legacy_vectorizer = None

try:
    if MODEL_PATH.exists() and VECTORIZER_PATH.exists():
        legacy_model = joblib.load(MODEL_PATH)
        legacy_vectorizer = joblib.load(VECTORIZER_PATH)
except Exception as e:
    legacy_model = None
    legacy_vectorizer = None

# Comprehensive tech and professional skill vocabulary
TECH_SKILLS_DATABASE: Set[str] = {
    # Programming Languages
    "python", "java", "c++", "c#", "c", "javascript", "typescript", "ruby", "go", "golang",
    "rust", "php", "swift", "kotlin", "r", "scala", "sql", "html", "css", "bash", "shell",
    
    # Frameworks & Libraries
    "react", "react.js", "angular", "vue", "vue.js", "next.js", "node.js", "express", "django",
    "flask", "fastapi", "spring", "spring boot", "asp.net", "laravel", "rails",
    
    # Data Science & Machine Learning
    "machine learning", "deep learning", "nlp", "computer vision", "tensorflow", "pytorch",
    "scikit-learn", "sklearn", "pandas", "numpy", "matplotlib", "seaborn", "keras", "opencv",
    "huggingface", "transformers", "llm", "genai", "generative ai", "data analysis",
    "data science", "tableau", "power bi", "big data", "spark", "hadoop", "eda",
    
    # Databases & Cloud
    "postgresql", "postgres", "mysql", "mongodb", "sqlite", "redis", "cassandra", "dynamodb",
    "aws", "amazon web services", "azure", "gcp", "google cloud", "docker", "kubernetes",
    "git", "github", "gitlab", "ci/cd", "linux", "jenkins", "terraform",
    
    # Core Engineering & Methodologies
    "rest api", "restful api", "graphql", "microservices", "agile", "scrum", "oop",
    "data structures", "algorithms", "system design", "unit testing", "tdd"
}

def extract_skills_from_text(text: str) -> List[str]:
    """
    Extract recognized skills from text using boundary-safe regex.
    Prevents false positives (e.g., 'c' matching inside 'react').
    """
    found_skills = set()
    cleaned_text = " " + text.lower() + " "
    # Normalize common punctuation
    cleaned_text = re.sub(r'[/,();]', ' ', cleaned_text)
    
    for skill in TECH_SKILLS_DATABASE:
        # Boundary-safe match
        pattern = r'(?<![a-zA-Z0-9])' + re.escape(skill) + r'(?![a-zA-Z0-9])'
        if re.search(pattern, cleaned_text):
            found_skills.add(skill)
            
    return sorted(list(found_skills))

def calculate_transparent_similarity(resume_text: str, jd_text: str) -> float:
    """
    Computes exact Cosine Similarity between Resume and Job Description using
    a dynamically fit TF-IDF vectorizer across n-grams (1, 2).
    """
    if not resume_text.strip() or not jd_text.strip():
        return 0.0
        
    try:
        vectorizer = TfidfVectorizer(stop_words='english', ngram_range=(1, 2))
        tfidf_matrix = vectorizer.fit_transform([resume_text, jd_text])
        sim = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:2])[0][0]
        return round(float(sim) * 100, 1)
    except Exception:
        return 0.0

def evaluate_legacy_model(text: str) -> Dict[str, Any]:
    """
    Tests compatibility with original trained SVC model and 65-term vectorizer.
    Returns honest prediction without fabricating results.
    """
    if legacy_model is None or legacy_vectorizer is None:
        return {
            "available": False,
            "prediction": None,
            "note": "Original model artifacts not found or failed to load."
        }
        
    try:
        vector = legacy_vectorizer.transform([text])
        # Non-zero entries indicate whether the resume contains words from the 65-term vocab
        overlap_count = int(vector.nnz)
        pred = int(legacy_model.predict(vector)[0])
        
        return {
            "available": True,
            "prediction": pred,
            "matched": bool(pred == 1),
            "vocab_overlap_count": overlap_count,
            "note": "Legacy SVC model evaluated on 65-term training vocabulary."
        }
    except Exception as e:
        return {
            "available": False,
            "prediction": None,
            "note": f"Inference error: {str(e)}"
        }

def audit_ats_compliance(resume_text: str) -> Dict[str, Any]:
    """Audits structural elements of the resume for ATS readability."""
    word_count = len(resume_text.split())
    
    sections = {
        "experience": bool(re.search(r'\b(experience|work history|employment)\b', resume_text, re.I)),
        "education": bool(re.search(r'\b(education|academic|degree|university|college)\b', resume_text, re.I)),
        "skills": bool(re.search(r'\b(skills|technical skills|competencies|technologies)\b', resume_text, re.I)),
        "projects": bool(re.search(r'\b(projects|portfolio|hands on)\b', resume_text, re.I)),
    }
    
    has_email = bool(re.search(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+', resume_text))
    has_metrics = bool(re.search(r'\b\d+%(?:\s+increase|\s+reduction)?|\$\d+|\b\d+\+\s+(?:users|clients|projects|years)', resume_text, re.I))
    
    # Calculate an objective ATS compliance score out of 100
    points = 0
    feedback = []
    
    if word_count >= 150:
        points += 20
    else:
        feedback.append("Resume appears too short (< 150 words). Provide more detailed descriptions.")
        
    if has_email:
        points += 20
    else:
        feedback.append("No valid email address found in the parsed text.")
        
    detected_sections_count = sum(1 for v in sections.values() if v)
    points += detected_sections_count * 10  # Up to 40 points
    for sec_name, detected in sections.items():
        if not detected:
            feedback.append(f"Missing distinct '{sec_name.capitalize()}' section header.")
            
    if has_metrics:
        points += 20
    else:
        feedback.append("Add quantifiable metrics (e.g., percentages, scale, user count) to bullet points.")
        
    return {
        "ats_score": points,
        "word_count": word_count,
        "sections": sections,
        "has_contact_info": has_email,
        "has_quantifiable_metrics": has_metrics,
        "improvements": feedback
    }

def analyze_resume_against_job(resume_text: str, job_description: str) -> Dict[str, Any]:
    """
    Unified analysis engine for HireLens AI:
    1. Extracts job-specific skills and cross-checks with resume.
    2. Computes transparent TF-IDF cosine similarity.
    3. Audits ATS compliance and formatting.
    4. Evaluates legacy model compatibility.
    5. Derives grounded, calibrated overall match score.
    """
    resume_skills = extract_skills_from_text(resume_text)
    jd_skills = extract_skills_from_text(job_description)
    
    matched_skills = [s for s in jd_skills if s in resume_skills]
    missing_skills = [s for s in jd_skills if s not in resume_skills]
    additional_skills = [s for s in resume_skills if s not in jd_skills]
    
    # Calculate Skill Match Rate
    if jd_skills:
        skill_match_percentage = round((len(matched_skills) / len(jd_skills)) * 100, 1)
    else:
        skill_match_percentage = 50.0  # Default neutral when no specific JD skills detected
        
    # Semantic text similarity
    semantic_similarity = calculate_transparent_similarity(resume_text, job_description)
    
    # ATS Audit
    ats_audit = audit_ats_compliance(resume_text)
    
    # Legacy Model Prediction
    legacy_eval = evaluate_legacy_model(resume_text)
    
    # Grounded composite match score (60% Skill Match + 40% Semantic Content Match)
    overall_score = round((0.60 * skill_match_percentage) + (0.40 * semantic_similarity), 1)
    
    return {
        "overall_match_score": overall_score,
        "skill_match_percentage": skill_match_percentage,
        "semantic_similarity": semantic_similarity,
        "skills": {
            "required_by_job": jd_skills,
            "matched": matched_skills,
            "missing": missing_skills,
            "additional": additional_skills
        },
        "ats_audit": ats_audit,
        "legacy_model": legacy_eval,
        "resume_word_count": len(resume_text.split()),
        "jd_word_count": len(job_description.split())
    }
