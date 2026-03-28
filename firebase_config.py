import firebase_admin
from firebase_admin import credentials, firestore
import os

def init_firebase():
    if not firebase_admin._apps:
        key_path = os.path.join(os.path.dirname(__file__), 'serviceAccountKey.json')
        if os.path.exists(key_path):
            cred = credentials.Certificate(key_path)
            firebase_admin.initialize_app(cred)
        else:
            print(f"WARNING: Firebase credentials not found at {key_path}")

def get_db():
    init_firebase()
    if not firebase_admin._apps:
        return None
    return firestore.client()
