import json
import os
import uuid
from datetime import datetime
from flask import Blueprint, request, jsonify

plant_bp = Blueprint('plant', __name__)
DATA_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'forest.json')

def read_data():
    try:
        with open(DATA_PATH, 'r') as f:
            return json.load(f)
    except Exception:
        return {"forests": []}

def write_data(data):
    with open(DATA_PATH, 'w') as f:
        json.dump(data, f, indent=2)

@plant_bp.route('/', methods=['GET'])
def get_forest():
    data = read_data()
    return jsonify(data.get('forests', [])), 200

@plant_bp.route('/', methods=['POST'])
def save_plant():
    body = request.get_json() or {}
    duration = body.get('duration')
    score = body.get('score', 'Basic Tree')
    
    if not duration:
        return jsonify({"error": "Duration is required"}), 400
        
    data = read_data()
    plant = {
        "id": str(uuid.uuid4()),
        "userId": "unknown", # Python simple fallback
        "duration": float(duration),
        "score": score,
        "createdAt": datetime.utcnow().isoformat() + "Z"
    }
    data.setdefault("forests", []).append(plant)
    write_data(data)
    
    return jsonify(plant), 201
