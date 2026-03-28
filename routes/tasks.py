from flask import Blueprint, request, jsonify
import datetime
import uuid
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from firebase_config import get_db
from middleware.auth import require_auth
from services.recurringService import generate_recurring_tasks

# Note: We need a utility to send SocketIO notifications. We'll import it dynamically or globally.
# For now, we will create a helper here and move it later if needed.
def create_notification(user_id, type_action, message):
    db = get_db()
    if not db: return
    notif_id = str(uuid.uuid4())
    notif = {
        'id': notif_id,
        'userId': user_id,
        'type': type_action,
        'message': message,
        'read': False,
        'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat()
    }
    db.collection('notifications').document(notif_id).set(notif)
    
    # We would also emit socket event here.
    # To do that, we import socketio from app (but careful with circular imports)
    try:
        from app import socketio
        socketio.emit('notification', notif, to=f'user:{user_id}')
    except ImportError:
        pass

tasks_bp = Blueprint('tasks', __name__)

@tasks_bp.route('/', methods=['GET'])
@require_auth
def get_tasks():
    user_id = request.user['userId']
    generate_recurring_tasks(user_id)
    
    db = get_db()
    if not db: return jsonify({'error': 'DB Error'}), 500
    
    docs = db.collection('tasks').where('userId', '==', user_id).where('isTemplate', '==', False).get()
    tasks = [d.to_dict() for d in docs]
    return jsonify(tasks), 200

@tasks_bp.route('/templates', methods=['GET'])
@require_auth
def get_templates():
    user_id = request.user['userId']
    db = get_db()
    if not db: return jsonify({'error': 'DB Error'}), 500
    
    docs = db.collection('tasks').where('userId', '==', user_id).where('isTemplate', '==', True).get()
    templates = [d.to_dict() for d in docs]
    return jsonify(templates), 200

@tasks_bp.route('/', methods=['POST'])
@require_auth
def create_task():
    data = request.json
    name = data.get('name')
    estimated_time = data.get('estimatedTime')
    if not name or estimated_time is None:
        return jsonify({'error': 'Name and estimated time are required'}), 400
        
    user_id = request.user['userId']
    db = get_db()
    if not db: return jsonify({'error': 'DB Error'}), 500
    
    is_recurring = data.get('isRecurring', False)
    
    task_id = str(uuid.uuid4())
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    today_date = data.get('date') or datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d')
    
    task = {
        'id': task_id,
        'userId': user_id,
        'name': name,
        'priority': data.get('priority', 'Medium'),
        'estimatedTime': float(estimated_time),
        'actualTime': 0,
        'category': data.get('category', 'General'),
        'date': today_date,
        'status': 'pending',
        'createdAt': now_iso,
        'completedAt': None,
        'timerSessions': [],
        'isRecurring': is_recurring,
        'isTemplate': is_recurring,
        'repeat': data.get('repeat', 'daily') if is_recurring else None,
        'repeatDays': data.get('repeatDays', []) if is_recurring else []
    }
    
    db.collection('tasks').document(task_id).set(task)
    
    if is_recurring:
        generate_recurring_tasks(user_id)
        
    return jsonify(task), 201

@tasks_bp.route('/<task_id>', methods=['PUT'])
@require_auth
def update_task(task_id):
    user_id = request.user['userId']
    db = get_db()
    if not db: return jsonify({'error': 'DB Error'}), 500
    
    task_ref = db.collection('tasks').document(task_id)
    doc = task_ref.get()
    if not doc.exists or doc.to_dict().get('userId') != user_id:
        return jsonify({'error': 'Task not found'}), 404
        
    update_data = request.json
    # ensure we don't overwrite id or userId
    update_data['id'] = task_id
    update_data['userId'] = user_id
    
    # We update the fields
    task_ref.update(update_data)
    return jsonify(task_ref.get().to_dict()), 200

@tasks_bp.route('/<task_id>', methods=['DELETE'])
@require_auth
def delete_task(task_id):
    user_id = request.user['userId']
    db = get_db()
    
    task_ref = db.collection('tasks').document(task_id)
    doc = task_ref.get()
    if not doc.exists or doc.to_dict().get('userId') != user_id:
        return jsonify({'error': 'Task not found'}), 404
        
    task_ref.delete()
    return jsonify({'message': 'Task deleted'}), 200

@tasks_bp.route('/<task_id>/start', methods=['PATCH'])
@require_auth
def start_timer(task_id):
    user_id = request.user['userId']
    db = get_db()
    
    task_ref = db.collection('tasks').document(task_id)
    doc = task_ref.get()
    if not doc.exists or doc.to_dict().get('userId') != user_id:
        return jsonify({'error': 'Task not found'}), 404
        
    task = doc.to_dict()
    sessions = task.get('timerSessions', [])
    sessions.append({'start': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'end': None})
    
    task_ref.update({
        'timerSessions': sessions,
        'status': 'in-progress'
    })
    return jsonify(task_ref.get().to_dict()), 200

@tasks_bp.route('/<task_id>/stop', methods=['PATCH'])
@require_auth
def stop_timer(task_id):
    user_id = request.user['userId']
    db = get_db()
    
    task_ref = db.collection('tasks').document(task_id)
    doc = task_ref.get()
    if not doc.exists or doc.to_dict().get('userId') != user_id:
        return jsonify({'error': 'Task not found'}), 404
        
    task = doc.to_dict()
    sessions = task.get('timerSessions', [])
    actual_time = task.get('actualTime', 0)
    
    if sessions and sessions[-1].get('end') is None:
        now = datetime.datetime.now(datetime.timezone.utc)
        start_time = datetime.datetime.fromisoformat(sessions[-1]['start'].replace('Z', '+00:00'))
        sessions[-1]['end'] = now.isoformat()
        
        elapsed_minutes = (now - start_time).total_seconds() / 60.0
        actual_time += elapsed_minutes
        
    task_ref.update({
        'timerSessions': sessions,
        'actualTime': actual_time
    })
    return jsonify(task_ref.get().to_dict()), 200

@tasks_bp.route('/<task_id>/complete', methods=['PATCH'])
@require_auth
def complete_task(task_id):
    user_id = request.user['userId']
    db = get_db()
    
    task_ref = db.collection('tasks').document(task_id)
    doc = task_ref.get()
    if not doc.exists or doc.to_dict().get('userId') != user_id:
        return jsonify({'error': 'Task not found'}), 404
        
    task = doc.to_dict()
    sessions = task.get('timerSessions', [])
    actual_time = task.get('actualTime', 0)
    now = datetime.datetime.now(datetime.timezone.utc)
    
    if sessions and sessions[-1].get('end') is None:
        start_time = datetime.datetime.fromisoformat(sessions[-1]['start'].replace('Z', '+00:00'))
        sessions[-1]['end'] = now.isoformat()
        elapsed_minutes = (now - start_time).total_seconds() / 60.0
        actual_time += elapsed_minutes
        
    # We move it to history. In Firestore, we can just keep it in tasks but change status,
    # or copy to a history collection. Let's keep it simple: just update the task status.
    # The Node backend put it in a separate array "history". We can add an 'archivedAt' field.
    
    update_data = {
        'status': 'completed',
        'completedAt': now.isoformat(),
        'archivedAt': now.isoformat(),
        'timerSessions': sessions,
        'actualTime': actual_time
    }
    
    task_ref.update(update_data)
    task_updated = task_ref.get().to_dict()
    
    create_notification(user_id, 'task:completed', f'✅ Task "{task_updated["name"]}" completed!')
    
    return jsonify(task_updated), 200

@tasks_bp.route('/<task_id>/manual-time', methods=['PATCH'])
@require_auth
def manual_time(task_id):
    user_id = request.user['userId']
    minutes = request.json.get('minutes', 0)
    db = get_db()
    
    task_ref = db.collection('tasks').document(task_id)
    doc = task_ref.get()
    if not doc.exists or doc.to_dict().get('userId') != user_id:
        return jsonify({'error': 'Task not found'}), 404
        
    task = doc.to_dict()
    actual_time = task.get('actualTime', 0) + float(minutes)
    task_ref.update({'actualTime': actual_time})
    
    return jsonify(task_ref.get().to_dict()), 200

@tasks_bp.route('/suggest-time', methods=['GET'])
@require_auth
def suggest_time():
    user_id = request.user['userId']
    name_query = request.args.get('name', '').lower()
    db = get_db()
    
    docs = db.collection('tasks').where('userId', '==', user_id).where('status', '==', 'completed').get()
    
    similar = []
    for d in docs:
        t = d.to_dict()
        if t.get('actualTime', 0) > 0 and name_query[:4] in t.get('name', '').lower():
            similar.append(t)
            
    if not similar:
        return jsonify({'suggestion': None}), 200
        
    avg = sum(t['actualTime'] for t in similar) / len(similar)
    return jsonify({'suggestion': round(avg)}), 200
