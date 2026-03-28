import jwt
from functools import wraps
from flask import request, jsonify

# Matching the existing local backend's hardcoded secret (if it was hardcoded)
# Let's read from env or use a fallback
import os
JWT_SECRET = os.environ.get('JWT_SECRET', 'reality_check_secret_key_2024')

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Unauthorized: No token provided'}), 401
        
        token = auth_header.split(' ')[1]
        try:
            decoded = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
            # Flask's request object supports custom attributes if carefully managed,
            # but usually it's cleaner to use flask.g. We will add it to request.user
            # as the previous Express handlers expect `req.user.userId`.
            setattr(request, 'user', decoded)
            # Make sure to handle dict access vs dot access later in controllers.
            # In Python, decoded is a dict: {'userId': '...', 'username': '...'}
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Unauthorized: Token expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Unauthorized: Invalid token'}), 401
            
        return f(*args, **kwargs)
    return decorated
