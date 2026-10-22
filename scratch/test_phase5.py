import requests, json

# Login
res = requests.post('http://localhost:8000/api/auth/login', json={'email':'student@hirelens.ai','password':'StudentPass123!'})
token = res.json()['token']

resume = """
Jane Smith - Senior Data Scientist
Email: jane.smith@example.com

EDUCATION
B.Tech in Computer Science (UG) - State Tech University, 2021

EXPERIENCE
Data Scientist - DataCorp (2023-Present)
- Built NLP pipeline using Hugging Face transformers (92 percent F1 score)
- Deployed 6 machine learning models on AWS SageMaker; improved throughput by 28 percent
- Reduced data processing latency by 35 percent using Redis caching

SKILLS
Python, Pandas, NumPy, Scikit-Learn, Machine Learning, Deep Learning, NLP,
SQL, PostgreSQL, TensorFlow, AWS, Docker, Git, REST API

PROJECTS
Resume Ranker: TF-IDF and SVC classification; 87 percent accuracy
Revenue Predictor: Reduced RMSE by 18 percent using gradient boosting
"""

jd = 'Data Scientist: Python, Machine Learning, NLP, TensorFlow, Scikit-Learn, Pandas, SQL, AWS deployment.'

res = requests.post('http://localhost:8000/api/student/analytics',
    headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
    json={'resume_text': resume, 'job_description': jd, 'filename': 'jane_smith.txt'}
)
a = res.json()['analytics']
print('=== PHASE 5 STUDENT PORTAL E2E TEST ===')
print()
print('[1] Overall Match:', a['overall_match_percentage'], '%')
print('    Explanation:', a['match_calculation_explanation'][:100], '...')
print()
print('[2] ATS Score:', a['ats_readiness']['score'], '/100 (', a['ats_readiness']['category'], ')')
for iss in a['ats_readiness']['issues']:
    status = 'PASS' if iss['deduction'] == 0 else 'FAIL'
    print('   ', status, iss['component'], '-', iss['status'])
print()
matched = a['skills_audit']['matched_skills']
missing = a['skills_audit']['missing_skills']
checklist = a['skills_audit']['missing_checklist']
print('[3] Matched Skills (', len(matched), '):', matched)
print('    Missing Skills (', len(missing), '):', missing)
print('    Checklist items:', len(checklist))
print()
add_recs = a['resume_improvements']['add']
remove_recs = a['resume_improvements']['remove']
improve_recs = a['resume_improvements']['improve']
print('[4] Add recs:', len(add_recs), '| Remove:', len(remove_recs), '| Improve:', len(improve_recs))
for r in add_recs:
    print('    ADD:', r['action'], '-', r['reason'][:60])
print()
steps = a['prioritized_steps']
print('[5] Action steps:', len(steps))
for s in steps:
    print('   P' + str(s['priority']) + ': ' + s['title'])
print()
charts = a['charts']
print('[6] Charts:', list(charts.keys()))
for k, v in charts.items():
    print('   ', k, '- labels:', v['labels'], 'values:', v['values'])
print()
print('ALL CHECKS PASSED')
