from flask import Blueprint, request, jsonify
import datetime
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from firebase_config import get_db
from middleware.auth import require_auth
from routes.calendar import is_task_scheduled_for_date

analytics_bp = Blueprint('analytics', __name__)

def generate_insights(tasks, by_priority, reality_score):
    insights = []
    completed = [t for t in tasks if t.get('status') == 'completed']
    
    if not tasks:
        insights.append({'icon': '📋', 'text': 'Add your first task to get personalized insights!', 'type': 'info'})
        return insights
        
    if reality_score >= 85:
        insights.append({'icon': '🎯', 'text': 'Excellent planning! Your time estimates are very accurate.', 'type': 'success'})
    elif reality_score < 50:
        insights.append({'icon': '⚠️', 'text': 'Your estimates often miss the mark. Try breaking tasks into smaller chunks.', 'type': 'warning'})
        
    over_estimated = len([t for t in completed if t.get('actualTime', 0) < t.get('estimatedTime', 0) * 0.7])
    under_estimated = len([t for t in completed if t.get('actualTime', 0) > t.get('estimatedTime', 0) * 1.3])
    
    if over_estimated > under_estimated and over_estimated > 1:
        insights.append({'icon': '📉', 'text': 'You tend to overestimate tasks. Consider shortening your estimates.', 'type': 'info'})
    elif under_estimated > over_estimated and under_estimated > 1:
        insights.append({'icon': '📈', 'text': 'You are frequently underestimating tasks. Give yourself more buffer time.', 'type': 'warning'})
        
    if by_priority.get('Low', 0) > by_priority.get('High', 0) and by_priority.get('Low', 0) > 0:
        insights.append({'icon': '🕳️', 'text': 'You spend more time on Low priority tasks than High priority ones!', 'type': 'danger'})
        
    prod_score = round((len(completed) / len(tasks)) * 100) if tasks else 0
    if prod_score == 100 and len(tasks) > 2:
        insights.append({'icon': '🏆', 'text': 'Perfect day! All tasks completed. Amazing productivity!', 'type': 'success'})
    elif prod_score < 30 and len(tasks) > 2:
        insights.append({'icon': '😴', 'text': 'Low completion rate. Try focusing on one task at a time.', 'type': 'warning'})
        
    hours = []
    for t in completed:
        if t.get('completedAt'):
            try:
                dt = datetime.datetime.fromisoformat(t['completedAt'].replace('Z', '+00:00'))
                hours.append(dt.hour)
            except:
                pass
                
    if len(hours) > 1:
        avg_hour = round(sum(hours) / len(hours))
        period = 'morning' if avg_hour < 12 else 'afternoon' if avg_hour < 17 else 'evening'
        insights.append({'icon': '⏰', 'text': f'You are most productive in the {period} (avg completion ~{avg_hour}:00).', 'type': 'info'})
        
    if not insights:
        insights.append({'icon': '📊', 'text': 'Keep completing tasks to unlock personalized insights!', 'type': 'info'})
        
    return insights

def build_trend(all_tasks):
    trend_map = {}
    now = datetime.datetime.now(datetime.timezone.utc)
    for i in range(6, -1, -1):
        d = now - datetime.timedelta(days=i)
        key = d.strftime('%Y-%m-%d')
        trend_map[key] = {'date': key, 'planned': 0, 'actual': 0, 'completed': 0, 'total': 0}
        
    for t in all_tasks:
        day = (t.get('date') or t.get('createdAt') or '').split('T')[0]
        if day in trend_map:
            trend_map[day]['planned'] += float(t.get('estimatedTime') or 0)
            trend_map[day]['actual'] += float(t.get('actualTime') or 0)
            trend_map[day]['total'] += 1
            if t.get('status') == 'completed':
                trend_map[day]['completed'] += 1
                
    result = []
    for d in trend_map.values():
        d['planned'] = round(d['planned'], 1)
        d['actual'] = round(d['actual'], 1)
        d['score'] = round((d['completed'] / d['total']) * 100) if d['total'] else 0
        result.append(d)
        
    return result

@analytics_bp.route('/', methods=['GET'])
@require_auth
def get_summary():
    user_id = request.user['userId']
    db = get_db()
    if not db: return jsonify({'error': 'DB Error'}), 500
    
    docs = db.collection('tasks').where('userId', '==', user_id).where('isTemplate', '==', False).get()
    all_tasks = [d.to_dict() for d in docs]
    
    # Filter for today's tasks ONLY for dashboard KPI calculations
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    today_str = now_utc.strftime('%Y-%m-%d')
    
    today_tasks = [t for t in all_tasks if is_task_scheduled_for_date(t, today_str)]
    
    # Check if a task is completed today (either actively completed today, or marked as completed on another day but scheduled today)
    completed = []
    for t in today_tasks:
        if t.get('status') == 'completed':
            completed.append(t)
            
    pending = [t for t in today_tasks if t not in completed]
    
    total_planned = sum(float(t.get('estimatedTime') or 0) for t in today_tasks)
    total_actual = sum(float(t.get('actualTime') or 0) for t in today_tasks)
    
    reality_score = 100
    if completed:
        scores = []
        for t in completed:
            est = t.get('estimatedTime')
            # Handle string conversions if necessary
            if est:
                 try: est = float(est)
                 except: est = 0
            if not est or est == 0:
                scores.append(100)
            else:
                act = t.get('actualTime', 0)
                try: act = float(act)
                except: act = 0
                ratio = act / est
                scores.append(max(0, 100 - abs(ratio - 1) * 100))
        reality_score = round(sum(scores) / len(scores))
        
    productivity_score = round((len(completed) / len(today_tasks)) * 100) if today_tasks else 0
    
    by_priority = {'High': 0, 'Medium': 0, 'Low': 0}
    for t in today_tasks:
        prio = t.get('priority', 'Medium')
        if prio in by_priority:
            by_priority[prio] += float(t.get('actualTime') or 0)
            
    by_category = {}
    for t in today_tasks:
        cat = t.get('category', 'General')
        by_category[cat] = by_category.get(cat, 0) + float(t.get('actualTime') or 0)
        
    task_comparison = []
    for t in today_tasks:
        name = t.get('name', '')
        if len(name) > 18: name = name[:18] + '…'
        task_comparison.append({
            'name': name,
            'planned': round(float(t.get('estimatedTime') or 0), 1),
            'actual': round(float(t.get('actualTime') or 0), 1),
            'priority': t.get('priority'),
            'status': t.get('status')
        })
        
    trend = build_trend(all_tasks)
    
    insights = generate_insights(today_tasks, by_priority, reality_score)
    
    # 1. Smart Day Summary Generator
    completed_count = len(completed)
    total_count = len(today_tasks)
    if total_count > 0:
        if productivity_score >= 80: eff_label = "excellent"
        elif productivity_score >= 50: eff_label = "average"
        else: eff_label = "low"
        
        missed_count = total_count - completed_count
        summary_text = f"Day Summary: {completed_count} completed, {missed_count} missed. Productivity: {eff_label}. Efficiency: {reality_score}%."
        insights.insert(0, {'icon': '📅', 'text': summary_text, 'type': 'info'})

    # 2. Task Priority Impact Analysis
    pending_high = [t for t in pending if t.get('priority') == 'High']
    if len(pending_high) > 0:
        insights.insert(0, {'icon': '⚠️', 'text': f"You missed {len(pending_high)} important high-priority task{'s' if len(pending_high) > 1 else ''} today.", 'type': 'danger'})
    # Add historical efficiency comparison if we have data
    if len(trend) >= 2:
        today_score = trend[-1]['score']
        yesterday_score = trend[-2]['score']
        diff = today_score - yesterday_score
        
        if trend[-2]['total'] > 0: # Only if yesterday actually had tasks
            if diff > 0:
                insights.insert(0, {'icon': '🚀', 'text': f'You are {diff}% more efficient than yesterday!', 'type': 'success'})
            elif diff < 0:
                insights.insert(0, {'icon': '📉', 'text': f'Efficiency dropped by {abs(diff)}% compared to yesterday. Keep pushing!', 'type': 'warning'})
            else:
                insights.insert(0, {'icon': '➡️', 'text': f'Efficiency is exactly the same as yesterday.', 'type': 'info'})
    
    leaks = []
    for t in today_tasks:
        est = t.get('estimatedTime')
        act = t.get('actualTime', 0)
        try: est = float(est) if est else 0
        except: est = 0
        try: act = float(act) if act else 0
        except: act = 0
        
        if act > est * 1.5 and act > 0:
            leaks.append({
                'name': t.get('name'),
                'estimatedTime': t.get('estimatedTime'),
                'actualTime': round(t.get('actualTime', 0), 1),
                'overBy': round(t.get('actualTime', 0) - t.get('estimatedTime', 0), 1)
            })
            
    trend = build_trend(all_tasks)
    
    return jsonify({
        'totalPlanned': round(total_planned, 1),
        'totalActual': round(total_actual, 1),
        'productivityScore': productivity_score,
        'realityScore': reality_score,
        'completedCount': len(completed),
        'pendingCount': len(pending),
        'taskComparison': task_comparison,
        'byPriority': by_priority,
        'byCategory': by_category,
        'insights': insights,
        'leaks': leaks,
        'trend': trend
    }), 200
