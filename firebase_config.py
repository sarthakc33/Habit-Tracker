import firebase_admin
from firebase_admin import credentials, firestore
import os

def init_firebase():
    if not firebase_admin._apps:
        key_path_local = os.path.join(os.path.dirname(__file__), 'serviceAccountKey.json')
        key_path_render = '/etc/secrets/serviceAccountKey.json'
        
        if os.path.exists(key_path_local):
            cred = credentials.Certificate(key_path_local)
            firebase_admin.initialize_app(cred)
        elif os.path.exists(key_path_render):
            cred = credentials.Certificate(key_path_render)
            firebase_admin.initialize_app(cred)
        else:
            print(f"WARNING: Firebase credentials not found at {key_path_local} or {key_path_render}")

def get_db():
    init_firebase()
    if not firebase_admin._apps:
        return None
    return firestore.client()
