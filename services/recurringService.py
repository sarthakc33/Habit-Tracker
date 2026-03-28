import datetime
import uuid
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from firebase_config import get_db

DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

def generate_recurring_tasks(user_id):
    db = get_db()
    if not db:
        return False
        
    now = datetime.datetime.now(datetime.timezone.utc)
    today = now.strftime('%Y-%m-%d')
    today_day_num = now.weekday() # 0 = Monday, 6 = Sunday
    today_day_name = DAY_NAMES[today_day_num]
    
    # For compatibility with JS getDay() where 0 = Sunday
    # JS: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
    # Python: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
    js_today_day_num = (today_day_num + 1) % 7
    js_day_names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    js_today_day_name = js_day_names[js_today_day_num]
    
    created = False
    tasks_ref = db.collection('tasks')
    
    # We query all user tasks to avoid composite index requirements for now
    docs = tasks_ref.where('userId', '==', user_id).get()
    all_user_tasks = [d.to_dict() for d in docs]
    
    templates = [t for t in all_user_tasks if t.get('isTemplate') and t.get('isRecurring')]
    
    for tpl in templates:
        should_generate = False
        repeat = tpl.get('repeat')
        
        if repeat == 'daily':
            should_generate = True
        elif repeat == 'weekly':
            # Same weekday as the template was created
            created_at_str = tpl['createdAt'].replace('Z', '+00:00')
            try:
                created_at = datetime.datetime.fromisoformat(created_at_str)
                created_day = created_at.weekday()
                js_created_day = (created_day + 1) % 7
                should_generate = (js_today_day_num == js_created_day)
            except Exception:
                pass
        elif repeat == 'weekdays':
            should_generate = (1 <= js_today_day_num <= 5)
        elif repeat == 'custom':
            should_generate = js_today_day_name in tpl.get('repeatDays', [])
            
        if not should_generate:
            continue
            
        already_exists = any(
            t.get('recurringParentId') == tpl['id'] and 
            t.get('date') == today and 
            not t.get('isTemplate')
            for t in all_user_tasks
        )
        
        if already_exists:
            continue
            
        instance_id = str(uuid.uuid4())
        instance = {
            'id': instance_id,
            'userId': tpl['userId'],
            'name': tpl['name'],
            'priority': tpl.get('priority', 'Medium'),
            'estimatedTime': tpl.get('estimatedTime', 0),
            'actualTime': 0,
            'category': tpl.get('category', 'General'),
            'date': today,
            'status': 'pending',
            'createdAt': now.isoformat(),
            'completedAt': None,
            'timerSessions': [],
            'isRecurring': True,
            'isTemplate': False,
            'recurringParentId': tpl['id'],
            'repeat': repeat,
            'repeatDays': tpl.get('repeatDays', [])
        }
        
        tasks_ref.document(instance_id).set(instance)
        created = True
        
    return created
