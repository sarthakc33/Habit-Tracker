from flask import Blueprint, request, jsonify
import datetime
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from firebase_config import get_db
from middleware.auth import require_auth
from routes.tasks import create_notification  # Re-use notification helper

gamification_bp = Blueprint('gamification', __name__)

LEVEL_THRESHOLDS = [0, 100, 250, 500, 900, 1400, 2000, 2800, 3800, 5000, 6500]

def calc_level(xp):
    level = 1
    for i in range(len(LEVEL_THRESHOLDS)):
        if xp >= LEVEL_THRESHOLDS[i]:
            level = i + 1
    return min(level, 10)

@gamification_bp.route('/', methods=['GET'])
@require_auth
def get_status():
    user_id = request.user['userId']
    db = get_db()
    if not db: return jsonify({'error': 'DB Error'}), 500
    
    gami_ref = db.collection('gamification').document(user_id)
    doc = gami_ref.get()
    
    if not doc.exists:
        # Initialize if missing
        g = {'xp': 0, 'level': 1, 'streak': 0, 'lastActiveDate': None, 'badges': [], 'history': []}
        gami_ref.set(g)
    else:
        g = doc.to_dict()
        
    next_threshold = LEVEL_THRESHOLDS[g['level']] if g['level'] < len(LEVEL_THRESHOLDS) else LEVEL_THRESHOLDS[-1]
    prev_threshold = LEVEL_THRESHOLDS[g['level'] - 1] if g['level'] > 0 else 0
    
    if next_threshold > prev_threshold:
        progress = round(((g['xp'] - prev_threshold) / (next_threshold - prev_threshold)) * 100)
    else:
        progress = 100
        
    response = g.copy()
    response['nextThreshold'] = next_threshold
    response['progress'] = progress
    
    return jsonify(response), 200

@gamification_bp.route('/award', methods=['POST'])
@require_auth
def award_xp():
    user_id = request.user['userId']
    action = request.json.get('action')
    
    XP_MAP = {'complete_task': 50, 'start_timer': 5, 'perfect_estimate': 100, 'daily_checkin': 20}
    earned = XP_MAP.get(action, 10)
    
    db = get_db()
    if not db: return jsonify({'error': 'DB Error'}), 500
    
    gami_ref = db.collection('gamification').document(user_id)
    doc = gami_ref.get()
    
    if not doc.exists:
        g = {'xp': 0, 'level': 1, 'streak': 0, 'lastActiveDate': None, 'badges': [], 'history': []}
    else:
        g = doc.to_dict()
        
    old_level = g.get('level', 1)
    g['xp'] = g.get('xp', 0) + earned
    g['level'] = calc_level(g['xp'])
    
    today = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d')
    if g.get('lastActiveDate') != today:
        yesterday = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=1)).strftime('%Y-%m-%d')
        if g.get('lastActiveDate') == yesterday:
            g['streak'] = g.get('streak', 0) + 1
        else:
            g['streak'] = 1
        g['lastActiveDate'] = today
        
    badges = g.get('badges', [])
    streak = g['streak']
    xp = g['xp']
    level = g['level']
    
    if streak >= 3 and '3-day-streak' not in badges:
        badges.append('3-day-streak')
        create_notification(user_id, 'streak:milestone', '🔥 You earned the 3-Day Streak badge!')
    if streak >= 7 and 'week-warrior' not in badges:
        badges.append('week-warrior')
        create_notification(user_id, 'streak:milestone', '⚔️ You earned the Week Warrior badge!')
    if xp >= 500 and 'xp-500' not in badges:
        badges.append('xp-500')
        create_notification(user_id, 'xp:awarded', '⚡ You earned the 500 XP Club badge!')
    if level >= 5 and 'level-5' not in badges:
        badges.append('level-5')
        create_notification(user_id, 'xp:awarded', '🚀 You reached Level 5 Pro!')
        
    g['badges'] = badges
    
    if level > old_level:
        create_notification(user_id, 'xp:awarded', f'🎉 Level Up! You are now Level {level}!')
        
    history = g.get('history', [])
    history.append({
        'action': action,
        'earned': earned,
        'xp': xp,
        'timestamp': datetime.datetime.now(datetime.timezone.utc).isoformat()
    })
    g['history'] = history
    
    gami_ref.set(g)
    
    response = g.copy()
    response['earned'] = earned
    return jsonify(response), 200
