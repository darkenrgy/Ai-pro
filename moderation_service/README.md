# Privacy-First Moderation Service

This FastAPI service provides lightweight moderation for text and image inputs while keeping the state small and privacy focused.

## Run

```bash
pip install -r moderation_service/requirements.txt
uvicorn moderation_service.app.main:app --host 127.0.0.1 --port 8001 --no-access-log
```

Before running the API, ensure `ai_moderation_model.pkl` exists in the project root (or set `MODERATION_MODEL_PATH`).

## Analyze API

Endpoint:

- `POST /analyze`

Request JSON:

```json
{
	"type": "text",
	"content": "message text or image path",
	"session_id": "abc123",
	"user_id": "tempUser"
}
```

Optional image payload fields:

- `image_base64`
- `image_mime_type`

Response JSON:

```json
{
	"risk_score": 85,
	"flagged": true,
	"category": "illegal_weapons",
	"action": "block",
	"block_session": true,
	"user_violation_count": 3,
	"session_violation_count": 4
}
```

Behavior:

- Text: normalize and predict with the trained model.
- Image: OCR with `pytesseract`, then predict on extracted text.
- Risk score: illegal-class probability x 100.
- Base action by score:
	- `<30` -> allow
	- `30-70` -> warn
	- `>70` -> block

Violation escalation:

- 1st violation -> `warn`
- 2nd -> `strong_warn`
- 3rd -> `block`
- repeated session violations -> `block_session=true` and action `block`

## Privacy Model

- No chat history is stored.
- No message logs are written by the service.
- User and session IDs are hashed before state is stored.
- Only risk scores and violation counts are kept in memory.

## AI Model Training (scikit-learn)

This repository now includes a lightweight training pipeline based on TF-IDF + Logistic Regression.

### Dataset Format

CSV file with columns:

- `text`
- `label`

Label mapping:

- `0` -> `safe`
- `1` -> `human_trafficking`
- `2` -> `child_exploitation`
- `3` -> `illegal_weapons`

### Train the model

```bash
python -m moderation_service.app.ml_model --dataset dataset.csv --output ai_moderation_model.pkl
```

What it does:

- Loads `dataset.csv`
- Splits train/test
- Applies `TfidfVectorizer(max_features=5000, ngram_range=(1,2))`
- Trains `LogisticRegression`
- Prints `classification_report`
- Saves model artifact as `ai_moderation_model.pkl` using `joblib`

The text preprocessor (`preprocess_text`) performs lowercase normalization, cleanup, and basic multilingual-safe handling by preserving letters and numbers across scripts.
### run for traning testing data 
-update dateset> run this command>python -m moderation_service.app.ml_model --dataset dataset.csv --output ai_moderation_model.pkl

### manual methord 
update data set>run ml_mosel.py >start api >test