const taskList = document.querySelector('#task-list');
const taskForm = document.querySelector('#task-form');
const toast = document.querySelector('#toast');
let currentQuestion = null;
let toastTimeout;

document.querySelector('#today-label').textContent = new Intl.DateTimeFormat('en', {
  weekday: 'short', month: 'short', day: 'numeric'
}).format(new Date());

document.querySelector('#weekly-chart').innerHTML = [28, 68, 47, 34, 16, 9, 7]
  .map((height) => `<span class="chart-bar" style="--height:${height}%"></span>`).join('');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers }
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || 'Something went wrong. Please try again.');
  }
  return response.status === 204 ? null : response.json();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => toast.classList.remove('visible'), 2300);
}

function renderTasks(tasks) {
  const completed = tasks.filter((task) => task.completed).length;
  document.querySelector('#task-count').textContent = tasks.length;
  document.querySelector('#nav-count').textContent = tasks.length - completed;
  document.querySelector('#completed-count').textContent = completed;
  document.querySelector('#tasks-footer-text').textContent = tasks.length
    ? `${completed} of ${tasks.length} tasks done. Keep your pace.`
    : 'A clear list. Make room for what matters.';
  if (!tasks.length) {
    taskList.innerHTML = '<div class="empty-state">Nothing here yet. Add one small thing to get started.</div>';
    return;
  }
  taskList.innerHTML = tasks.map((task) => {
    const subjectClass = task.subject.toLowerCase().replace(/[^a-z]/g, '');
    return `<article class="task-row ${task.completed ? 'completed' : ''}">
      <button class="task-check ${task.completed ? 'done' : ''}" data-action="toggle" data-id="${task.id}" aria-label="Toggle completion">✓</button>
      <div class="task-main"><p class="task-title">${escapeHtml(task.title)}</p><div class="task-subject"><span class="subject-dot ${subjectClass}"></span>${escapeHtml(task.subject)}</div></div>
      <span class="task-due ${task.due_date.toLowerCase() === 'today' ? 'today' : ''}">${escapeHtml(task.due_date || 'No due date')}</span>
      <button class="delete-task" data-action="delete" data-id="${task.id}" aria-label="Delete task">×</button>
    </article>`;
  }).join('');
}

async function loadTasks() {
  try { renderTasks(await api('/api/tasks')); }
  catch (error) { taskList.textContent = error.message; }
}

document.querySelector('#open-task-form').addEventListener('click', () => {
  taskForm.hidden = !taskForm.hidden;
  if (!taskForm.hidden) taskForm.elements.title.focus();
});

taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(taskForm).entries());
  document.querySelector('#form-error').textContent = '';
  try {
    await api('/api/tasks', { method: 'POST', body: JSON.stringify(payload) });
    taskForm.reset();
    taskForm.hidden = true;
    await loadTasks();
    showToast('Task added to your list.');
  } catch (error) { document.querySelector('#form-error').textContent = error.message; }
});

taskList.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  button.disabled = true;
  try {
    if (button.dataset.action === 'toggle') {
      const tasks = await api('/api/tasks');
      const task = tasks.find((item) => item.id === Number(button.dataset.id));
      if (task) await api(`/api/tasks/${task.id}`, {
        method: 'PATCH', body: JSON.stringify({ completed: !task.completed })
      });
      showToast(task && !task.completed ? 'Nicely done. One less thing.' : 'Task back on your list.');
    } else {
      await api(`/api/tasks/${button.dataset.id}`, { method: 'DELETE' });
      showToast('Task removed.');
    }
    await loadTasks();
  } catch (error) { button.disabled = false; showToast(error.message); }
});

async function loadQuestion(questionId) {
  const optionsElement = document.querySelector('#quiz-options');
  document.querySelector('#quiz-feedback').textContent = '';
  document.querySelector('#quiz-feedback').classList.remove('wrong');
  document.querySelector('#quiz-next').hidden = true;
  try {
    currentQuestion = await api(`/api/quiz${questionId ? `?id=${questionId}` : ''}`);
    document.querySelector('#quiz-subject').textContent = currentQuestion.subject.toUpperCase();
    document.querySelector('#quiz-question').textContent = currentQuestion.question;
    optionsElement.innerHTML = currentQuestion.options.map((option, index) =>
      `<button class="quiz-option" data-index="${index}"></button>`).join('');
    optionsElement.querySelectorAll('.quiz-option').forEach((button, index) => {
      button.textContent = `${String.fromCharCode(65 + index)}.  ${currentQuestion.options[index]}`;
    });
  } catch (error) { document.querySelector('#quiz-question').textContent = error.message; }
}

document.querySelector('#quiz-options').addEventListener('click', async (event) => {
  const button = event.target.closest('.quiz-option');
  if (!button || !currentQuestion || button.disabled) return;
  const buttons = [...document.querySelectorAll('.quiz-option')];
  buttons.forEach((option) => { option.disabled = true; });
  try {
    const result = await api('/api/quiz/check', {
      method: 'POST',
      body: JSON.stringify({ question_id: currentQuestion.id, option_index: Number(button.dataset.index) })
    });
    const correctIndex = currentQuestion.options.indexOf(result.answer);
    buttons[correctIndex].classList.add('correct');
    if (!result.correct) button.classList.add('incorrect');
    const feedback = document.querySelector('#quiz-feedback');
    feedback.classList.toggle('wrong', !result.correct);
    feedback.textContent = `${result.correct ? 'That’s right.' : 'Not quite.'} ${result.explanation}`;
    document.querySelector('#quiz-next').hidden = false;
  } catch (error) {
    buttons.forEach((option) => { option.disabled = false; });
    showToast(error.message);
  }
});

document.querySelector('#quiz-next').addEventListener('click', () => {
  const ids = ['photosynthesis', 'fractions', 'gravity'];
  const index = ids.indexOf(currentQuestion?.id ?? '');
  loadQuestion(ids[(index + 1) % ids.length]);
});

document.querySelector('#focus-button').addEventListener('click', (event) => {
  const active = document.body.classList.toggle('focus-mode');
  event.currentTarget.innerHTML = active ? '<span>Ⅱ</span> End focus' : '<span>▶</span> Start focus';
  showToast(active ? 'Focus mode on. One thing at a time.' : 'Focus session ended. Nice work.');
});

loadTasks();
loadQuestion();