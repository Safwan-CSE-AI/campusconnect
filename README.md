# CampusConnect AI ??

**Intelligent Campus Item Recovery Network** powered by Explainable AI.

## Features
- ?? AI Item Matching with synonym & color-family awareness
- ?? RBAC Security — Student / Moderator / Admin roles
- ?? Real-Time WebSockets — Live campus activity feed
- ?? Secure File Upload — MIME-validated image storage
- ?? Recovery Intelligence — 0–100% probability engine

## Setup & Run

```bash
git clone https://github.com/Safwan-CSE-AI/campusconnect.git
cd campusconnect
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Server: http://127.0.0.1:8000  
Docs: http://127.0.0.1:8000/docs

## Demo Credentials

| Role      | Email                  | Password     |
|-----------|------------------------|--------------|
| Student   | student@campus.edu     | student123   |
| Moderator | security@campus.edu    | security123  |
| Admin     | admin@campus.edu       | admin123     |

## Environment Variables

| Variable                    | Description              | Default               |
|-----------------------------|--------------------------|----------------------|
| `CAMPUSCONNECT_SECRET_KEY`  | HMAC password salt key   | (dev fallback set)   |

## Project Structure

```
campusconnect-ai/
+-- main.py              # FastAPI routes, WebSocket, QR endpoints
+-- database.py          # SQLite schema, WAL optimization, seed data
+-- auth.py              # HMAC auth, RBAC, serializers
+-- matching_engine.py   # AI matching + recovery probability engine
+-- storage.py           # Secure file upload handler
+-- requirements.txt     # Python dependencies
```

## License
MIT — Built for campus hackathon.
