# Dataset Integration Reference — HireLens AI

This directory manages dataset resources for HireLens AI, including the large resume corpus (`archive (1).zip`), metadata summaries, and sample files for automated testing and ingestion.

## 1. Primary Dataset Archive

- **Archive File**: `archive (1).zip` (62.49 MB, 65,529,677 bytes)
- **Total Archive Entries**: 2,485 items
- **Structured Table**: `Resume/Resume.csv` (2,484 candidate rows)
- **Document Files**: 2,484 category-organized PDF documents (`data/data/<CATEGORY>/<ID>.pdf`)

### Resume.csv Schema & Columns

| Column Name | Type | Description |
| :--- | :--- | :--- |
| `ID` | Integer / String | Unique candidate resume identifier (e.g., `16852973`) |
| `Resume_str` | String (Text) | Raw plain-text extracted resume content |
| `Resume_html` | String (HTML) | Structured HTML representation of resume formatting |
| `Category` | Categorical String | Professional domain classification (24 distinct categories) |

### Category Breakdown (24 Categories, 2,484 Total)

| Category | Count | Category | Count |
| :--- | :--- | :--- | :--- |
| `INFORMATION-TECHNOLOGY` | 120 | `CONSULTANT` | 115 |
| `BUSINESS-DEVELOPMENT` | 120 | `CONSTRUCTION` | 112 |
| `FINANCE` | 118 | `PUBLIC-RELATIONS` | 111 |
| `ADVOCATE` | 118 | `HR` | 110 |
| `ACCOUNTANT` | 118 | `DESIGNER` | 107 |
| `ENGINEERING` | 118 | `ARTS` | 103 |
| `CHEF` | 118 | `TEACHER` | 102 |
| `AVIATION` | 117 | `APPAREL` | 97 |
| `FITNESS` | 117 | `DIGITAL-MEDIA` | 96 |
| `SALES` | 116 | `AGRICULTURE` | 63 |
| `BANKING` | 115 | `AUTOMOBILE` | 36 |
| `HEALTHCARE` | 115 | `BPO` | 22 |

## 2. Minimal Memory-Efficient Loader (`core/dataset_loader.py`)

To adhere to Phase 7 performance and memory requirements, `core/dataset_loader.py` avoids uncompressing the full 2,485-file archive and avoids loading the uncompressed 53.67 MB CSV into memory:

- `inspect_archive(zip_path=None)`: Reads zip directory headers to inspect size, entries, schema, and category counts in milliseconds without extraction.
- `load_dataset_sample(n=5, category=None, ...)`: Streams only specified columns (`ID`, `Resume_str`, `Category`) using pandas chunking or `nrows` without pulling redundant HTML data into memory.
- `load_sample_as_hr_candidates(n=5, category=...)`: Synthesizes candidate records directly compatible with `generate_hr_analytics` and the candidate leaderboard.
- `extract_sample_resumes(...)`: Extracts a targeted sample of PDF resumes into `datasets/samples/` for end-to-end PDF parsing tests.

## 3. Preserved Artifacts

The following original project artifacts remain untouched and preserved:
- `archive (1).zip`
- `labeled_resumes.xlsx` (Training dataset)
- `example.resume for prediction testing.xlsx` (Inference benchmark dataset)
- `source code.ipynb` (Original exploratory data analysis notebook)
- `resume_ranker_model.pkl` (Legacy trained SVC model)
- `tfidf_vectorizer.pkl` (Legacy TF-IDF vectorizer)
- `app.py` & `server.py`
