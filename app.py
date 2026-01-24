# app.py
from typing import List, Literal, Optional, Tuple
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import httpx
import os
import json
import numpy as np
import mysql.connector
from sentence_transformers import SentenceTransformer

# =========================
# exaone3.5 / Model settings
# =========================
OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL = "exaone3.5"

# ✅ 서버 기본 시스템 프롬프트 (요청에서 system_prompt 오면 그걸 우선 사용)
SYSTEM_PROMPT = (
    "너는 한국어로 짧고 정확하게 답하는 AI 비서다.\n"
    "필요하면 아래 중 하나의 JSON만 단독으로 출력할 수 있다(설명/문장/코드펜스 금지).\n"
    '{"tool":"OPEN_HISTORY_MODAL"} | {"tool":"OPEN_OCO_CALC"} | {"tool":"OPEN_CALCULATOR"}\n'
)

# =========================
# Chat limits
# =========================
MAX_TURNS = 20

# =========================
# RAG settings
# =========================
RAG_ENABLED = True
RAG_TOP_K = 6
RAG_MAX_CONTEXT_CHARS = 2500
RAG_MIN_SCORE = 0.0  # ← 중요: 컷 제거

# Embedding model (local)
EMB_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

# =========================
# MySQL (sparta)
# =========================
MYSQL_HOST = os.getenv("MYSQL_HOST", "localhost")
MYSQL_USER = os.getenv("MYSQL_USER", "root")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "")
MYSQL_DB = os.getenv("MYSQL_DB", "sparta")

# =========================
# FastAPI setup
# =========================
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 로컬 전용
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Role = Literal["system", "user", "assistant"]


class ChatMessage(BaseModel):
    role: Role
    content: str = Field(default="", max_length=4000)


class ChatReq(BaseModel):
    # ✅ aiPopup에서 system_prompt를 내려보낼 수 있게 지원
    system_prompt: Optional[str] = Field(default=None, max_length=4000)
    messages: List[ChatMessage]


# =========================
# Globals
# =========================
_embedding_model: Optional[SentenceTransformer] = None


@app.on_event("startup")
def startup():
    global _embedding_model
    _embedding_model = SentenceTransformer(EMB_MODEL)


def _get_db_conn():
    return mysql.connector.connect(
        host=MYSQL_HOST,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        database=MYSQL_DB,
    )


# =========================
# Helpers
# =========================
def normalize_messages(msgs: List[ChatMessage], base_system_prompt: str) -> List[dict]:
    non_system = [m for m in msgs if m.role != "system"]
    if len(non_system) > (MAX_TURNS * 2):
        non_system = non_system[-(MAX_TURNS * 2):]

    out = [{"role": "system", "content": base_system_prompt}]
    out += [{"role": m.role, "content": m.content} for m in non_system]
    return out


def _last_user_message(msgs: List[dict]) -> str:
    for m in reversed(msgs):
        if m["role"] == "user" and m.get("content", "").strip():
            return m["content"].strip()
    return ""


# =========================
# RAG Retrieval (Keyword → Semantic)
# =========================
def _retrieve_rag_context(question: str) -> Tuple[str, List[dict]]:
    if not RAG_ENABLED or not question:
        return "", []

    global _embedding_model
    conn = _get_db_conn()
    cur = conn.cursor()

    # ---- 1) KEYWORD SEARCH (FULLTEXT / LIKE) ----
    keyword_rows = []
    try:
        cur.execute(
            """
            SELECT
              d.source_type,
              d.source_id,
              c.id,
              c.content,
              1.0 AS score
            FROM rag_chunk c
            JOIN rag_doc d ON d.id = c.doc_id
            WHERE MATCH(c.content) AGAINST (%s IN BOOLEAN MODE)
            LIMIT %s
        """,
            (question, RAG_TOP_K),
        )
        keyword_rows = cur.fetchall()
    except Exception:
        keyword_rows = []

    if not keyword_rows:
        like_q = f"%{question}%"
        cur.execute(
            """
            SELECT
              d.source_type,
              d.source_id,
              c.id,
              c.content,
              0.9 AS score
            FROM rag_chunk c
            JOIN rag_doc d ON d.id = c.doc_id
            WHERE c.content LIKE %s
            LIMIT %s
        """,
            (like_q, RAG_TOP_K),
        )
        keyword_rows = cur.fetchall()

    if keyword_rows:
        hits = []
        lines = []
        size = 0
        for st, sid, cid, content, score in keyword_rows:
            line = f"- ({st}:{sid}) {content}"
            if size + len(line) > RAG_MAX_CONTEXT_CHARS:
                break
            lines.append(line)
            size += len(line)
            hits.append(
                {
                    "mode": "keyword",
                    "score": score,
                    "source_type": st,
                    "source_id": int(sid),
                    "chunk_id": int(cid),
                }
            )
        cur.close()
        conn.close()
        return "\n".join(lines), hits

    # ---- 2) SEMANTIC SEARCH (Embedding) ----
    q = _embedding_model.encode(question, normalize_embeddings=True)
    q = np.array(q, dtype=np.float32)

    cur.execute(
        """
        SELECT
          d.source_type,
          d.source_id,
          c.id,
          c.content,
          c.embedding_json
        FROM rag_chunk c
        JOIN rag_doc d ON d.id = c.doc_id
    """
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()

    scored = []
    for st, sid, cid, content, emb_json in rows:
        try:
            v = np.array(json.loads(emb_json), dtype=np.float32)
            score = float(np.dot(q, v))
        except Exception:
            continue
        scored.append((score, st, sid, cid, content))

    scored.sort(reverse=True, key=lambda x: x[0])
    top = scored[:RAG_TOP_K]

    hits = []
    lines = []
    size = 0
    for score, st, sid, cid, content in top:
        line = f"- ({st}:{sid}) {content}"
        if size + len(line) > RAG_MAX_CONTEXT_CHARS:
            break
        lines.append(line)
        size += len(line)
        hits.append(
            {
                "mode": "semantic",
                "score": round(score, 4),
                "source_type": st,
                "source_id": int(sid),
                "chunk_id": int(cid),
            }
        )

    return "\n".join(lines), hits


def _inject_rag_system_message(msgs: List[dict], context: str) -> List[dict]:
    if not context:
        return msgs

    rag_sys = {
        "role": "system",
        "content": (
            "아래 [근거]에 있는 내용만 사용해서 답변하세요. "
            "근거에 없으면 '근거 부족'이라고 말하세요.\n\n"
            f"[근거]\n{context}"
        ),
    }
    return [msgs[0], rag_sys] + msgs[1:]


# =========================
# Routes
# =========================
@app.get("/health")
async def health():
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            r = await client.get("http://localhost:11434/api/tags")
            ollama_ok = r.status_code == 200
    except Exception:
        ollama_ok = False

    return {
        "ok": True,
        "ollama_ok": ollama_ok,
        "model": MODEL,
        "rag_enabled": RAG_ENABLED,
        "mysql_db": MYSQL_DB,
        "embedding_model": EMB_MODEL,
    }


@app.post("/chat")
async def chat(req: ChatReq):
    # ✅ 요청 system_prompt가 있으면 우선 사용
    base_prompt = SYSTEM_PROMPT
    if isinstance(req.system_prompt, str) and req.system_prompt.strip():
        base_prompt = req.system_prompt.strip()

    msgs = normalize_messages(req.messages or [], base_prompt)

    if not any(m["role"] == "user" for m in msgs):
        raise HTTPException(status_code=400, detail="No user message.")

    user_q = _last_user_message(msgs)

    try:
        context, hits = _retrieve_rag_context(user_q)
        msgs = _inject_rag_system_message(msgs, context)
    except Exception:
        context, hits = "", []

    payload = {
        "model": MODEL,
        "messages": msgs,
        "stream": False,
        "options": {"temperature": 0.3, "top_p": 0.9},
    }

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(OLLAMA_URL, json=payload)
            r.raise_for_status()
            data = r.json()

            content = (data.get("message") or {}).get("content")
            if not isinstance(content, str):
                raise HTTPException(status_code=502, detail="Invalid model response")

            return {
                "content": content,
                "rag": {"used": bool(context), "hits": hits},
            }

    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=str(e))