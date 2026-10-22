"""
HireLens AI — Dataset Loader Module
Minimal, memory-efficient loader for the Kaggle/Enterprise Resume Dataset.
Inspects and streams samples from the dataset archive without loading
the entire 53MB+ dataset into memory or decompressing thousands of PDFs.
"""

from io import BytesIO
from pathlib import Path
from typing import Dict, Any, List, Optional
import zipfile
import pandas as pd

from core.parser import extract_candidate_metadata, extract_text_from_pdf

BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_ZIP_PATH = BASE_DIR / "archive (1).zip"
DATASETS_DIR = BASE_DIR / "datasets"
SAMPLES_DIR = DATASETS_DIR / "samples"


def inspect_archive(zip_path: Optional[Path] = None) -> Dict[str, Any]:
    """
    Inspects the resume dataset ZIP without extracting all files.
    Returns archive metadata, file counts, CSV schema, and category breakdown.
    """
    path = Path(zip_path) if zip_path else DEFAULT_ZIP_PATH
    if not path.exists():
        raise FileNotFoundError(f"Dataset archive not found at: {path}")

    with zipfile.ZipFile(path, "r") as z:
        infolist = z.infolist()
        total_entries = len(infolist)
        
        pdf_files = [f.filename for f in infolist if f.filename.endswith(".pdf")]
        csv_files = [f.filename for f in infolist if f.filename.endswith(".csv")]
        
        csv_info = {}
        category_counts = {}
        
        if "Resume/Resume.csv" in [f.filename for f in infolist]:
            with z.open("Resume/Resume.csv") as f:
                # Read only header to get column names without loading data
                preview_df = pd.read_csv(f, nrows=2)
                csv_info["columns"] = preview_df.columns.tolist()
                csv_info["sample_row"] = preview_df.iloc[0].to_dict()
                
            # Read only ID and Category columns to get fast, memory-light category statistics
            with z.open("Resume/Resume.csv") as f:
                cat_df = pd.read_csv(f, usecols=["ID", "Category"])
                category_counts = cat_df["Category"].value_counts().to_dict()
                csv_info["total_records"] = len(cat_df)

        return {
            "archive_filename": path.name,
            "archive_size_bytes": path.stat().st_size,
            "archive_size_mb": round(path.stat().st_size / (1024 * 1024), 2),
            "total_entries": total_entries,
            "pdf_count": len(pdf_files),
            "csv_files": csv_files,
            "csv_metadata": csv_info,
            "category_distribution": category_counts,
            "total_categories": len(category_counts)
        }


def load_dataset_sample(
    n: int = 5,
    category: Optional[str] = None,
    zip_path: Optional[Path] = None,
    include_html: bool = False
) -> List[Dict[str, Any]]:
    """
    Loads a minimal sample of n resumes from the dataset.
    Avoids reading the entire 53MB CSV by filtering columns and chunking.
    """
    path = Path(zip_path) if zip_path else DEFAULT_ZIP_PATH
    if not path.exists():
        raise FileNotFoundError(f"Dataset archive not found at: {path}")

    usecols = ["ID", "Resume_str", "Category"]
    if include_html:
        usecols.append("Resume_html")

    samples: List[Dict[str, Any]] = []

    with zipfile.ZipFile(path, "r") as z:
        if "Resume/Resume.csv" not in z.namelist():
            raise ValueError("Resume/Resume.csv not found in archive.")

        with z.open("Resume/Resume.csv") as f:
            if category:
                # Stream in chunks of 50 to find matching category without memory blowup
                chunksize = 50
                for chunk in pd.read_csv(f, chunksize=chunksize, usecols=usecols):
                    filtered = chunk[chunk["Category"].str.upper() == category.upper()]
                    for _, row in filtered.iterrows():
                        samples.append({
                            "id": str(row["ID"]),
                            "category": str(row["Category"]),
                            "raw_text": str(row["Resume_str"]).strip(),
                            "name": f"Candidate {row['ID']}"
                        })
                        if len(samples) >= n:
                            break
                    if len(samples) >= n:
                        break
            else:
                # Fast direct read of just n rows
                df = pd.read_csv(f, nrows=n, usecols=usecols)
                for _, row in df.iterrows():
                    samples.append({
                        "id": str(row["ID"]),
                        "category": str(row["Category"]),
                        "raw_text": str(row["Resume_str"]).strip(),
                        "name": f"Candidate {row['ID']}"
                    })

    return samples


def load_sample_as_hr_candidates(
    n: int = 5,
    category: Optional[str] = "INFORMATION-TECHNOLOGY",
    zip_path: Optional[Path] = None
) -> List[Dict[str, Any]]:
    """
    Converts sampled resumes into structured candidate records compatible
    with core.analytics.generate_hr_analytics and pipeline ranking.
    """
    raw_samples = load_dataset_sample(n=n, category=category, zip_path=zip_path)
    candidates: List[Dict[str, Any]] = []

    for s in raw_samples:
        text = s["raw_text"]
        meta = extract_candidate_metadata(text)
        candidates.append({
            "NAME": s["name"],
            "raw_text": text,
            "Category": s["category"],
            "EDU": meta.get("detected_degree", "UG"),
            "YOE": meta.get("detected_yoe", 0),
            "EMAILID": meta.get("email"),
            "PHONE": meta.get("phone"),
            "TECH KN.": f"Specialized in {s['category']}",
            "HANDS ON PROJECT": "Hands-on domain experience detailed in resume",
            "CERTIFICATIONS": "Professional credentials"
        })

    return candidates


def extract_sample_resumes(
    dest_dir: Optional[Path] = None,
    samples_per_category: int = 1,
    categories: Optional[List[str]] = None,
    zip_path: Optional[Path] = None
) -> List[Path]:
    """
    Extracts a small dedicated sample of PDF resumes into a datasets folder.
    Only extracts the requested files, avoiding decompressing 2400+ PDFs.
    """
    path = Path(zip_path) if zip_path else DEFAULT_ZIP_PATH
    target_dir = Path(dest_dir) if dest_dir else SAMPLES_DIR
    target_dir.mkdir(parents=True, exist_ok=True)

    target_cats = [c.upper() for c in (categories or ["INFORMATION-TECHNOLOGY", "ENGINEERING", "HR"])]
    extracted_paths: List[Path] = []

    with zipfile.ZipFile(path, "r") as z:
        infolist = z.infolist()
        category_counts = {c: 0 for c in target_cats}

        for info in infolist:
            parts = info.filename.split("/")
            # Check structure: data/data/<CATEGORY>/<id>.pdf
            if len(parts) >= 4 and parts[0] == "data" and parts[1] == "data" and info.filename.endswith(".pdf"):
                cat = parts[2].upper()
                if cat in target_cats and category_counts[cat] < samples_per_category:
                    cat_dir = target_dir / cat
                    cat_dir.mkdir(parents=True, exist_ok=True)
                    out_file = cat_dir / parts[-1]
                    with z.open(info) as src, open(out_file, "wb") as dst:
                        dst.write(src.read())
                    extracted_paths.append(out_file)
                    category_counts[cat] += 1
                    
            if all(count >= samples_per_category for count in category_counts.values()):
                break

    return extracted_paths
