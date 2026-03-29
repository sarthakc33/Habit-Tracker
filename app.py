from flask import Flask, send_from_directory, request
from flask_cors import CORS
from flask_socketio import SocketIO
import os

from routes.auth import auth_bp
from routes.tasks import tasks_bp
from routes.analytics import analytics_bp
from routes.gamification import gamification_bp
from routes.notifications import notifications_bp
from routes.calendar import calendar_bp
from routes.plant import plant_bp

app = Flask(__name__, static_folder='public', static_url_path='')
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Register Blueprints
app.register_blueprint(auth_bp, url_prefix='/api/auth')
app.register_blueprint(tasks_bp, url_prefix='/api/tasks')
app.register_blueprint(analytics_bp, url_prefix='/api/analytics')
app.register_blueprint(gamification_bp, url_prefix='/api/gamification')
app.register_blueprint(notifications_bp, url_prefix='/api/notifications')
app.register_blueprint(calendar_bp, url_prefix='/api/calendar')
app.register_blueprint(plant_bp, url_prefix='/api/plant')

# Serve frontend pages
@app.route('/')
def index():
    return send_from_directory('public', 'index.html')

@app.route('/login')
def login_page():
    return send_from_directory('public', 'login.html')

@app.route('/planner')
def planner_page():
    return send_from_directory('public', 'planner.html')

@app.route('/tracker')
def tracker_page():
    return send_from_directory('public', 'tracker.html')

@app.route('/analytics')
def analytics_page():
    return send_from_directory('public', 'analytics.html')

@app.route('/plant')
def plant_page():
    return send_from_directory('public', 'plant.html')

@app.route('/<path:path>')
def serve_static(path):
    if os.path.exists(os.path.join('public', path)):
        return send_from_directory('public', path)
    return send_from_directory('public', 'index.html')

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3000))
    # Note: On render, we will use gunicorn and eventlet for socket.io
    socketio.run(app, host='0.0.0.0', port=port, debug=True)
