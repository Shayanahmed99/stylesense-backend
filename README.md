# StyleSense Backend

## Setup

### 1. Install Node.js dependencies
```bash
npm install
```

### 2. Set up environment variables
```bash
cp .env.example .env
# Fill in your values in .env
```

### 3. Set up Python service
```bash
cd python
pip install -r requirements.txt
```

---

## Running the project

### Start Node.js backend (port 5000)
```bash
npm run dev
```

### Start Python analysis service (port 8000) — in a separate terminal
```bash
cd python
uvicorn analyze:app --reload --port 8000
```

---

## API Endpoints

| Method | Endpoint                      | Auth | Description                        |
|--------|-------------------------------|------|------------------------------------|
| POST   | /api/auth/register            | No   | Create new account                 |
| POST   | /api/auth/login               | No   | Login and get JWT token            |
| GET    | /api/auth/me                  | Yes  | Get logged-in user profile         |
| POST   | /api/analyze/upload           | Yes  | Upload selfie for body analysis    |
| GET    | /api/analyze/profile          | Yes  | Get existing body profile          |
| POST   | /api/mood/classify            | Yes  | Classify mood/occasion             |
| POST   | /api/outfits/generate         | Yes  | Generate 3 outfit images           |
| GET    | /api/outfits/history          | Yes  | Get past outfits                   |
| GET    | /api/outfits/:id              | Yes  | Get single outfit                  |
| POST   | /api/tryon                    | Yes  | Virtual try-on                     |
| GET    | /api/critique/:outfitId       | Yes  | Generate style critique            |
| POST   | /api/critique/feedback        | Yes  | Submit rating and comment          |
| GET    | /api/admin/stats              | Yes  | System stats for admin dashboard   |
| GET    | /api/admin/category-ratings   | Yes  | Ratings breakdown by style         |
| GET    | /api/admin/users              | Yes  | All users (paginated)              |
| PATCH  | /api/admin/users/:id/status   | Yes  | Activate or deactivate a user      |
| DELETE | /api/admin/users/:id          | Yes  | Delete user and all their data     |

---

## Connecting to Lovable Frontend

Set this environment variable in your Lovable project:
```
VITE_API_URL=http://localhost:5000/api
```

When deployed on Render, swap it for your live URL.
