import json
import math
import mysql.connector
from sentence_transformers import SentenceTransformer

# =========================
# 형님 환경에 맞게 여기만 수정
# =========================
MYSQL = {
    "host": "127.0.0.1",
    "user": "root",
    "password": "",       # 필요하면 채우기
    "database": "sparta",
}
EMB_MODEL = "sentence-transformers/all-MiniLM-L6-v2"  # 가벼운 기본 (384 dim)

# 청킹: 너무 길면 검색 품질 저하 → 적당히 잘라 저장
CHUNK_CHAR = 900         # 문자 기준 MVP (토큰 계산 없이도 잘 돌아감)
CHUNK_OVERLAP = 120      # 겹침(문맥 보존)

def chunk_text(s: str, chunk_size: int = CHUNK_CHAR, overlap: int = CHUNK_OVERLAP):
    s = (s or "").strip()
    if not s:
        return []
    if len(s) <= chunk_size:
        return [s]
    out = []
    step = max(1, chunk_size - overlap)
    for i in range(0, len(s), step):
        part = s[i:i + chunk_size].strip()
        if part:
            out.append(part)
        if i + chunk_size >= len(s):
            break
    return out

def main():
    model = SentenceTransformer(EMB_MODEL)

    conn = mysql.connector.connect(**MYSQL)
    cur = conn.cursor()

    # ---- 1) history_comment.body 가져오기 ----
    cur.execute("""
        SELECT id, body, created_at, updated_at
        FROM history_comment
        WHERE body IS NOT NULL AND LENGTH(TRIM(body)) > 0
        ORDER BY id ASC
    """)
    history_rows = cur.fetchall()

    # ---- 2) chat_log.message 가져오기 ----
    cur.execute("""
        SELECT id, message, created_at
        FROM chat_log
        WHERE message IS NOT NULL AND LENGTH(TRIM(message)) > 0
        ORDER BY id ASC
    """)
    chat_rows = cur.fetchall()

    def upsert_doc(source_type: str, source_id: int, content: str, meta: dict):
        """
        rag_doc에 원문 저장(중복 방지). 이미 있으면 doc_id 반환.
        """
        cur.execute(
            "SELECT id, content FROM rag_doc WHERE source_type=%s AND source_id=%s",
            (source_type, source_id),
        )
        row = cur.fetchone()
        if row:
            doc_id, old_content = row
            # 내용이 달라졌으면 업데이트 (history_comment updated_at 대응)
            if (old_content or "").strip() != (content or "").strip():
                cur.execute(
                    "UPDATE rag_doc SET content=%s, meta_json=%s WHERE id=%s",
                    (content, json.dumps(meta, ensure_ascii=False), doc_id),
                )
            return doc_id, (row is None)
        else:
            cur.execute(
                "INSERT INTO rag_doc (source_type, source_id, content, meta_json) VALUES (%s, %s, %s, %s)",
                (source_type, source_id, content, json.dumps(meta, ensure_ascii=False)),
            )
            return cur.lastrowid, True

    def rebuild_chunks(doc_id: int, content: str):
        """
        doc content가 변경될 수 있으니: 가장 안전한 MVP는 '청크 전부 삭제 후 재생성'
        (데이터가 커지면 diff 방식으로 최적화 가능)
        """
        cur.execute("DELETE FROM rag_chunk WHERE doc_id=%s", (doc_id,))
        chunks = chunk_text(content)
        for idx, ch in enumerate(chunks):
            vec = model.encode(ch, normalize_embeddings=True).tolist()
            cur.execute(
                "INSERT INTO rag_chunk (doc_id, chunk_no, content, embedding_json, token_count) VALUES (%s,%s,%s,%s,%s)",
                (doc_id, idx, ch, json.dumps(vec), None),
            )

    # ---- history_comment 적재 ----
    for (hid, body, created_at, updated_at) in history_rows:
        meta = {
            "table": "history_comment",
            "created_at": str(created_at),
            "updated_at": str(updated_at) if updated_at else None,
        }
        doc_id, _ = upsert_doc("history_comment", hid, body, meta)
        rebuild_chunks(doc_id, body)

    # ---- chat_log 적재 ----
    for (cid, msg, created_at) in chat_rows:
        meta = {
            "table": "chat_log",
            "created_at": str(created_at),
        }
        doc_id, _ = upsert_doc("chat_log", cid, msg, meta)
        rebuild_chunks(doc_id, msg)

    conn.commit()
    cur.close()
    conn.close()
    print("✅ RAG ingest 완료: history_comment + chat_log → rag_doc/rag_chunk")

if __name__ == "__main__":
    main()