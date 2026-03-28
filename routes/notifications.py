from flask import Blueprint, request, jsonify
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from firebase_config import get_db
from middleware.auth import require_auth

notifications_bp = Blueprint('notifications', __name__)

@notifications_bp.route('/', methods=['GET'])
@require_auth
def get_notifications():
    user_id = request.user['userId']
    db = get_db()
    if not db: return jsonify({'error': 'DB Error'}), 500
    
    docs = db.collection('notifications').where('userId', '==', user_id).order_by('createdAt', direction='DESCENDING').limit(50).get()
    
    notifs = []
    for d in docs:
        notifs.append(d.to_dict())
        
    return jsonify(notifs), 200

@notifications_bp.route('/<notif_id>/read', methods=['PATCH'])
@require_auth
def mark_read(notif_id):
    user_id = request.user['userId']
    db = get_db()
    if not db: return jsonify({'error': 'DB Error'}), 500
    
    ref = db.collection('notifications').document(notif_id)
    doc = ref.get()
    
    if not doc.exists or doc.to_dict().get('userId') != user_id:
        return jsonify({'error': 'Notification not found'}), 404
        
    ref.update({'read': True})
    return jsonify(ref.get().to_dict()), 200

@notifications_bp.route('/read-all', methods=['PATCH'])
@require_auth
def mark_all_read():
    user_id = request.user['userId']
    db = get_db()
    if not db: return jsonify({'error': 'DB Error'}), 500
    
    docs = db.collection('notifications').where('userId', '==', user_id).where('read', '==', False).get()
    
    batch = db.batch()
    for doc in docs:
        batch.update(doc.reference, {'read': True})
    batch.commit()
    
    return jsonify({'message': 'All notifications marked as read'}), 200
