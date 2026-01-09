import os, json, re
import mysql.connector
from pypdf import PdfReader
from sentence_transformers import SentenceTransformer

MYSQL = {
    "host": "localhost",
    "user": "root",
    "password": "",
    "database": "sparta",
    "charset": "utf8mb4",
    "use_unicode": True,
}

EMB_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
PDF_PATH = "Angel_Protocol_본문.pdf"   # ✅ 여기만 수정

CHUNK_CHAR = 1200
OVERLAP = 150

def to_safe_utf8(s: str) -> str:
    """
    MySQL driver가 싫어하는 문자(깨진 유니코드/서로게이트/NULL 등) 제거 + UTF-8 강제
    """
    if not s:
        return ""
    s = s.replace("\x00", "")  # NULL 제거
    # 제어문자(탭/개행 제외) 제거
    s = re.sub(r"[\x01-\x08\x0B\x0C\x0E-\x1F]", " ", s)
    # UTF-8로 강제 정리 (문제 문자 제거)
    s = s.encode("utf-8", "ignore").decode("utf-8", "ignore")
    # 공백 정리
    s = re.sub(r"[ \t]+", " ", s)
    return s.strip()

def chunk_text(t, n=CHUNK_CHAR, ov=OVERLAP):
    t = (t or "").strip()
    if not t: return []
    if len(t) <= n: return [t]
    out, step = [], max(1, n-ov)
    for i in range(0, len(t), step):
        part = t[i:i+n].strip()
        if part: out.append(part)
        if i+n >= len(t): break
    return out

def extract_pdf_text(path):
    r = PdfReader(path)
    pages = []
    for i, p in enumerate(r.pages):
        txt = p.extract_text() or ""
        txt = to_safe_utf8(txt)
        if txt:
            pages.append(f"[PAGE {i+1}]\n{txt}")
    return "\n\n".join(pages).strip()

def main():
    text = extract_pdf_text(PDF_PATH)
    if not text:
        raise SystemExit("텍스트 추출 0자 (스캔본이면 OCR 필요)")

    title = to_safe_utf8(os.path.basename(PDF_PATH))
    meta = to_safe_utf8(json.dumps({"pdf_path": os.path.abspath(PDF_PATH)}, ensure_ascii=False))

    model = SentenceTransformer(EMB_MODEL)

    conn = mysql.connector.connect(**MYSQL)
    cur = conn.cursor()

    # ✅ MVP: PDF 1개만 넣는 방식 (source_id=0 고정)
    cur.execute("SELECT id, content FROM rag_doc WHERE source_type=%s AND source_id=%s", ("pdf", 0))
    row = cur.fetchone()

    if row:
        doc_id, old = row
        old = old or ""
        if to_safe_utf8(old) != text:
            cur.execute(
                "UPDATE rag_doc SET title=%s, content=%s, meta_json=%s WHERE id=%s",
                (title, text, meta, doc_id)
            )
    else:
        cur.execute(
            "INSERT INTO rag_doc (source_type, source_id, title, content, meta_json) VALUES (%s,%s,%s,%s,%s)",
            ("pdf", 0, title, text, meta)
        )
        doc_id = cur.lastrowid

    # 청크 재생성
    cur.execute("DELETE FROM rag_chunk WHERE doc_id=%s", (doc_id,))
    chunks = chunk_text(text)

    for i, ch in enumerate(chunks):
        ch = to_safe_utf8(ch)
        vec = model.encode(ch, normalize_embeddings=True).tolist()
        cur.execute(
            "INSERT INTO rag_chunk (doc_id, chunk_no, content, embedding_json, token_count) VALUES (%s,%s,%s,%s,%s)",
            (doc_id, i, ch, json.dumps(vec), None)
        )

    conn.commit()
    cur.close()
    conn.close()
    print(f"✅ PDF RAG 적재 완료: {title} (chunks={len(chunks)})")

if __name__ == "__main__":
    main()