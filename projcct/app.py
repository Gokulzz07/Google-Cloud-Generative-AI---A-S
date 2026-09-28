import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from flask import Flask, jsonify, render_template, request

app = Flask("EduGenie")
app.config["DATABASE"] = os.environ.get(
     "EDUGENIE_DATABASE", str(Path(app.instance_path) / "edugenie.sqlite3")
)

QUIZ_QUESTIONS = [
     {
          "id": "photosynthesis",
          "subject": "Biology",
          "question": "Which organelle converts light energy into chemical energy?",
          "options": ["Mitochondrion", "Chloroplast", "Ribosome", "Nucleus"],
          "answer": 1,
          "explanation": "Chloroplasts contain chlorophyll and are the site of photosynthesis.",
     },
     {
          "id": "fractions",
          "subject": "Mathematics",
          "question": "What is 3/4 expressed as a percentage?",
          "options": ["25%", "50%", "75%", "80%"],
          "answer": 2,
          "explanation": "3 divided by 4 is 0.75, which is 75 percent.",
     },
     {
          "id": "gravity",
          "subject": "Physics",
          "question": "What is the approximate acceleration due to gravity on Earth?",
          "options": ["3.7 m/s²", "6.2 m/s²", "9.8 m/s²", "12.4 m/s²"],
          "answer": 2,
          "explanation": "Near Earth's surface, gravitational acceleration is about 9.8 m/s².",
     },
]


@contextmanager
def get_db():
     Path(app.config["DATABASE"]).parent.mkdir(parents=True, exist_ok=True)
     connection = sqlite3.connect(app.config["DATABASE"])
     connection.row_factory = sqlite3.Row
     try:
          yield connection
          connection.commit()
     except Exception:
          connection.rollback()
          raise
     finally:
          connection.close()


def initialize_database():
     with get_db() as connection:
          connection.execute(
               """CREATE TABLE IF NOT EXISTS tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    subject TEXT NOT NULL,
                    due_date TEXT NOT NULL DEFAULT '',
                    completed INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
               )"""
          )
          task_count = connection.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
          if task_count == 0:
               connection.executemany(
                    "INSERT INTO tasks (title, subject, due_date) VALUES (?, ?, ?)",
                    [
                         ("Review cell structure and organelles", "Biology", "Today"),
                         ("Complete practice set: linear equations", "Mathematics", "Tomorrow"),
                         ("Read chapter 6: forces and motion", "Physics", "Friday"),
                    ],
               )


initialize_database()


@app.get("/")
def home():
     return render_template("index.html")


@app.get("/api/tasks")
def list_tasks():
     with get_db() as connection:
          rows = connection.execute(
               "SELECT id, title, subject, due_date, completed FROM tasks ORDER BY completed, id"
          ).fetchall()
     return jsonify([dict(row) for row in rows])


@app.post("/api/tasks")
def create_task():
     data = request.get_json(silent=True) or {}
     title = data.get("title", "").strip()
     subject = data.get("subject", "").strip()
     due_date = data.get("due_date", "").strip()
     if not title or not subject:
          return jsonify(error="Title and subject are required."), 400

     with get_db() as connection:
          cursor = connection.execute(
               "INSERT INTO tasks (title, subject, due_date) VALUES (?, ?, ?)",
               (title, subject, due_date),
          )
          row = connection.execute(
               "SELECT id, title, subject, due_date, completed FROM tasks WHERE id = ?",
               (cursor.lastrowid,),
          ).fetchone()
     return jsonify(dict(row)), 201


@app.patch("/api/tasks/<int:task_id>")
def update_task(task_id):
     data = request.get_json(silent=True) or {}
     if not isinstance(data.get("completed"), bool):
          return jsonify(error="A boolean completed value is required."), 400

     with get_db() as connection:
          cursor = connection.execute(
               "UPDATE tasks SET completed = ? WHERE id = ?",
               (int(data["completed"]), task_id),
          )
          if cursor.rowcount == 0:
               return jsonify(error="Task not found."), 404
          row = connection.execute(
               "SELECT id, title, subject, due_date, completed FROM tasks WHERE id = ?",
               (task_id,),
          ).fetchone()
     return jsonify(dict(row))


@app.delete("/api/tasks/<int:task_id>")
def delete_task(task_id):
     with get_db() as connection:
          cursor = connection.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
     if cursor.rowcount == 0:
          return jsonify(error="Task not found."), 404
     return "", 204


@app.get("/api/quiz")
def get_quiz():
     question_id = request.args.get("id")
     question = next(
          (item for item in QUIZ_QUESTIONS if item["id"] == question_id),
          QUIZ_QUESTIONS[0],
     )
     return jsonify({key: value for key, value in question.items() if key not in {"answer", "explanation"}})


@app.post("/api/quiz/check")
def check_quiz_answer():
     data = request.get_json(silent=True) or {}
     question = next((item for item in QUIZ_QUESTIONS if item["id"] == data.get("question_id")), None)
     if question is None:
          return jsonify(error="Question not found."), 404
     option_index = data.get("option_index")
     if not isinstance(option_index, int) or isinstance(option_index, bool):
          return jsonify(error="A valid option index is required."), 400
     if not 0 <= option_index < len(question["options"]):
          return jsonify(error="Option index is out of range."), 400

     return jsonify(
          correct=option_index == question["answer"],
          answer=question["options"][question["answer"]],
          explanation=question["explanation"],
     )


if __name__ == "__main__":
     app.run(debug=True)
