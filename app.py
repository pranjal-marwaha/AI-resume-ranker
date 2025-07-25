import streamlit as st
import pandas as pd
import joblib

# Load model and vectorizer
model = joblib.load("resume_ranker_model.pkl")
vectorizer = joblib.load("tfidf_vectorizer.pkl")

st.set_page_config(page_title="AI Resume Ranker", layout="wide")
st.title("📄 AI Resume Ranker")
st.write("Upload an Excel file with multiple resumes to evaluate and rank them based on relevance.")

uploaded_file = st.file_uploader("📤 Upload Resume Excel File", type=["xlsx"])

if uploaded_file:
    try:
        df = pd.read_excel(uploaded_file)
        st.success("✅ File loaded successfully!")
        st.dataframe(df.head())

        # Combine relevant text
        df['combined_text'] = (
            df['EDU'].astype(str) + " " +
            df['TECH KN.'].astype(str) + " " +
            df['HANDS ON PROJECT'].astype(str) + " " +
            df['CERTIFICATIONS'].astype(str)
        )

        # Vectorize and predict
        text_vector = vectorizer.transform(df['combined_text'])
        df['MATCHED'] = model.predict(text_vector)

        # Scoring function
        def score(row):
            s = 0
            edu = row['EDU'].lower()
            if 'phd' in edu or 'p.hd' in edu:
                s += 40
            elif 'pg' in edu:
                s += 30
            elif 'ug' in edu:
                s += 20
            s += int(row.get('YOE', 0)) * 5
            if row['MATCHED'] == 1:
                s += 30
            return s

        df['rank_score'] = df.apply(score, axis=1)
        ranked_df = df[df['MATCHED'] == 1].sort_values(by='rank_score', ascending=False)

        st.subheader("🏆 Ranked Relevant Resumes")
        st.dataframe(ranked_df[['NAME', 'EDU', 'YOE', 'TECH KN.', 'HANDS ON PROJECT', 'rank_score']])

        st.download_button("⬇ Download Results", data=ranked_df.to_csv(index=False), file_name="ranked_resumes.csv")

    except Exception as e:
        st.error(f"❌ Something went wrong: {e}")