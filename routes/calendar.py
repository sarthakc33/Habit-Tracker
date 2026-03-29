from flask import Blueprint, request, jsonify
import datetime
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from firebase_config import get_db
from middleware.auth import require_auth
from services.recurringService import generate_recurring_tasks

calendar_bp = Blueprint('calendar', __name__)

def is_task_scheduled_for_date(task, date_str):
    """Determine if a task should appear on the given date string (YYYY-MM-DD)."""
    # Non-recurring: use the task's explicit 'date' field first, then fall back to createdAt
    if task.get('isRecurring') or task.get('recurring'):
        repeat = task.get('repeat') or task.get('recurringType')
        if not repeat or repeat == 'daily':
            return True
        if repeat == 'weekdays':
            try:
                date_obj = datetime.date.fromisoformat(date_str)
                return date_obj.weekday() < 5  # Mon=0 ... Fri=4
            except:
                return False
        if repeat == 'weekly' or repeat == 'custom':
            try:
                date_obj = datetime.date.fromisoformat(date_str)
                python_weekday = date_obj.weekday()  # 0=Mon, 6=Sun
                js_day_of_week = (python_weekday + 1) % 7  # 0=Sun, 1=Mon…
            except:
                return False
            days = task.get('repeatDays') or task.get('daysOfWeek') or []
            if 'dayOfWeek' in task and task['dayOfWeek'] is not None:
                days = [task['dayOfWeek']]
            js_day_names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
            # Support both string names ('Mon') and numeric (1)
            return (js_day_names[js_day_of_week] in days or
                    js_day_of_week in [int(d) for d in days if str(d).isdigit()])
    
    # Non-recurring: match against the task's 'date' field (YYYY-MM-DD)
    task_date = task.get('date')
    if task_date:
        return task_date[:10] == date_str
    
    # Final fallback: use createdAt date
    created = task.get('createdAt')
    if created:
        return created[:10] == date_str
    
    return False


@calendar_bp.route('/tasks', methods=['GET'])
@require_auth
def get_tasks_by_date():
    user_id = request.user['userId']
    # Use local-like today by computing from UTC — since all tasks store YYYY-MM-DD dates,
    # we compare directly against UTC date (consistent with task creation in tasks.py)
    today = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d')
    date_str = request.args.get('date', today)
    
    is_past = date_str < today
    is_today = date_str == today

    # Generate recurring tasks for today so they always appear
    if is_today:
        try:
            generate_recurring_tasks(user_id)
        except Exception as e:
            print(f'Error generating recurring tasks: {e}')
    
    db = get_db()
    if not db:
        return jsonify({'error': 'DB Error'}), 500
    
    docs = db.collection('tasks').where('userId', '==', user_id).get()
    all_tasks = [d.to_dict() for d in docs]
    
    # Tasks completed on this specific date
    completed_on_date = [
        t for t in all_tasks
        if t.get('completedAt') and t['completedAt'][:10] == date_str
    ]
    
    # Tasks scheduled for this date
    scheduled_tasks = [t for t in all_tasks if is_task_scheduled_for_date(t, date_str)]
    
    completed_ids = {t.get('recurringParentId') or t['id'] for t in completed_on_date}
    
    tasks_for_date = []
    for task in scheduled_tasks:
        # Skip already-completed tasks (they'll appear in completedHistory)
        if task['id'] in completed_ids:
            continue
        t_copy = task.copy()
        t_copy['overdueForDate'] = is_past and task.get('status') != 'completed'
        t_copy['completedOnDate'] = False
        tasks_for_date.append(t_copy)
    
    # Completed tasks for this date that were either scheduled or historical
    completed_history = completed_on_date

    return jsonify({
        'date': date_str,
        'isToday': is_today,
        'isPast': is_past,
        'tasks': tasks_for_date,
        'completedHistory': completed_history,
        'summary': {
            'total': len(tasks_for_date) + len(completed_history),
            'completed': len(completed_history),
            'overdue': len([t for t in tasks_for_date if t.get('overdueForDate')])
        }
    }), 200


@calendar_bp.route('/heatmap', methods=['GET'])
@require_auth
def get_heatmap_data():
    user_id = request.user['userId']
    db = get_db()
    if not db:
        return jsonify({'dates': [], 'range': 30, 'taskRows': [], 'categoryRows': []}), 200
    
    today = datetime.datetime.now(datetime.timezone.utc).date()
    thirty_days_ago = today - datetime.timedelta(days=30)
    
    docs = db.collection('tasks').where('userId', '==', user_id).where('status', '==', 'completed').get()
    completed_tasks = [d.to_dict() for d in docs]
    
    date_map = {}
    for t in completed_tasks:
        if t.get('completedAt'):
            d = t['completedAt'][:10]
            if d >= str(thirty_days_ago):
                date_map[d] = date_map.get(d, 0) + 1
    
    return jsonify({
        'dates': [{'date': k, 'count': v} for k, v in sorted(date_map.items())],
        'range': 30,
        'taskRows': [],
        'categoryRows': []
    }), 200


@calendar_bp.route('/month-overview', methods=['GET'])
@require_auth
def get_month_overview():
    user_id = request.user['userId']
    now = datetime.datetime.now(datetime.timezone.utc)
    
    try:
        year = int(request.args.get('year', now.year))
        month = int(request.args.get('month', now.month))
    except (ValueError, TypeError):
        year, month = now.year, now.month
    
    db = get_db()
    if not db:
        return jsonify({'year': year, 'month': month, 'days': []}), 200
    
    # Determine the date range for the requested month
    import calendar as cal_mod
    _, days_in_month = cal_mod.monthrange(year, month)
    
    # Fetch tasks for this user
    docs = db.collection('tasks').where('userId', '==', user_id).get()
    all_tasks = [d.to_dict() for d in docs]
    
    today_str = now.strftime('%Y-%m-%d')
    
    days_data = []
    for day in range(1, days_in_month + 1):
        date_str = f'{year}-{str(month).zfill(2)}-{str(day).zfill(2)}'
        
        # Count scheduled tasks for this day
        scheduled = [t for t in all_tasks if is_task_scheduled_for_date(t, date_str)]
        total = len(scheduled)
        
        # Count completed on this day
        completed = [
            t for t in all_tasks
            if t.get('completedAt') and t['completedAt'][:10] == date_str
        ]
        completed_count = len(completed)
        
        has_activity = total > 0 or completed_count > 0
        completion_rate = 0
        if total > 0:
            completion_rate = round((completed_count / total) * 100)
        elif completed_count > 0:
            completion_rate = 100
        
        days_data.append({
            'date': date_str,
            'hasActivity': has_activity,
            'total': total,
            'completed': completed_count,
            'completionRate': completion_rate,
            'isPast': date_str < today_str,
            'isToday': date_str == today_str
        })
    
    return jsonify({
        'year': year,
        'month': month,
        'days': days_data
    }), 200
