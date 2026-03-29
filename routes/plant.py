import json
import os
import uuid
import sys
from datetime import datetime
from flask import Blueprint, request, jsonify

sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from firebase_config import get_db
from middleware.auth import require_auth
from routes.notifications import create_notification

plant_bp = Blueprint('plant', __name__)

@plant_bp.route('/', methods=['GET'])
@require_auth
def get_forest():
    user_id = request.user['userId']
    db = get_db()
    if not db: return jsonify({'error': 'DB Error'}), 500
    
    docs = db.collection('forests').where('userId', '==', user_id).stream()
    forests = [d.to_dict() for d in docs]
    return jsonify(forests), 200

@plant_bp.route('/', methods=['POST'])
@require_auth
def save_plant():
    body = request.get_json(silent=True) or {}
    duration = body.get('duration')
    score = body.get('score', 'Basic Tree')
    
    if not duration:
        return jsonify({"error": "Duration is required"}), 400
        
    user_id = request.user['userId']
    db = get_db()
    if not db: return jsonify({'error': 'DB Error'}), 500
    
    plant_id = str(uuid.uuid4())
    plant = {
        "id": plant_id,
        "userId": user_id,
        "duration": float(duration),
        "score": score,
        "createdAt": datetime.utcnow().isoformat() + "Z"
    }
    
    db.collection('forests').document(plant_id).set(plant)
    
    try:
        from flask import current_app
        create_notification(current_app, user_id, 'plant:grown', 'Congrats you have grown one plant! 🌱')
    except Exception as e:
        print("Failed to dispatch notification:", e)
    
    return jsonify(plant), 201
