from flask import Blueprint, request, jsonify
import bcrypt
import jwt
import datetime
import uuid
import os
import sys

# Ensure imports work from parent dir
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from firebase_config import get_db
from middleware.auth import JWT_SECRET, require_auth

auth_bp = Blueprint('auth', __name__)

def generate_token(user):
    payload = {
        'userId': user['id'],
        'username': user['username'],
        'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=7)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm='HS256')

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json(silent=True) or {}
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'error': 'Username and password are required'}), 400
    if len(username) < 3:
        return jsonify({'error': 'Username must be at least 3 characters'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400
        
    db = get_db()
    if not db:
        return jsonify({'error': 'Database connection error (Firebase likely not initialized)'}), 500
        
    users_ref = db.collection('users')
    existing = list(users_ref.where('username_lower', '==', username.lower()).limit(1).stream())
    if len(existing) > 0:
        return jsonify({'error': 'Username already taken'}), 409
        
    salt = bcrypt.gensalt()
    hashed_password = bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
    user_id = str(uuid.uuid4())
    
    user = {
        'id': user_id,
        'username': username,
        'username_lower': username.lower(),
        'password': hashed_password,
        'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat()
    }
    
    users_ref.document(user_id).set(user)
    
    # Initialize gamification for this user
    gami_ref = db.collection('gamification').document(user_id)
    gami_ref.set({
        'xp': 0, 'level': 1, 'streak': 0, 'lastActiveDate': None, 'badges': [], 'history': []
    })
    
    token = generate_token(user)
    return jsonify({
        'token': token,
        'user': {'id': user['id'], 'username': user['username'], 'createdAt': user['createdAt']}
    }), 201

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json(silent=True) or {}
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'error': 'Username and password are required'}), 400
        
    db = get_db()
    if not db:
        return jsonify({'error': 'Database connection error'}), 500
        
    users_ref = db.collection('users')
    existing = list(users_ref.where('username_lower', '==', username.lower()).limit(1).stream())
    
    if len(existing) == 0:
        return jsonify({'error': 'Invalid credentials'}), 401
        
    user = existing[0].to_dict()
    
    if not bcrypt.checkpw(password.encode('utf-8'), user['password'].encode('utf-8')):
        return jsonify({'error': 'Invalid credentials'}), 401
        
    token = generate_token(user)
    return jsonify({
        'token': token,
        'user': {'id': user['id'], 'username': user['username'], 'createdAt': user['createdAt']}
    }), 200

@auth_bp.route('/profile', methods=['GET'])
@require_auth
def get_profile():
    db = get_db()
    if not db:
        return jsonify({'error': 'Database connection error'}), 500
        
    # the require_auth middleware sets request.user as the decoded token dict
    user_id = request.user['userId']
    user_doc = db.collection('users').document(user_id).get()
    
    if not user_doc.exists:
        return jsonify({'error': 'User not found'}), 404
        
    user = user_doc.to_dict()
    return jsonify({'id': user['id'], 'username': user['username'], 'createdAt': user['createdAt']}), 200
