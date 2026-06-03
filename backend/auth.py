from firebase_admin import auth
from flask import request, jsonify
from functools import wraps
from firestore_db import get_db

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        # Ensure Firebase is initialized
        get_db()
        
        # Handle CORS preflight requests
        if request.method == 'OPTIONS':
            return f(*args, **kwargs)

        id_token = None
        auth_header = request.headers.get('Authorization')
        
        if auth_header and auth_header.startswith('Bearer '):
            id_token = auth_header.split('Bearer ')[1]
        

        # If no token, we treat as a guest (for public/demo endpoints)
        if not id_token:
            request.uid = "guest"
            return f(*args, **kwargs)
        
        try:
            # Verify the ID token
            decoded_token = auth.verify_id_token(id_token)
            request.uid = decoded_token['uid']
            request.email = decoded_token.get('email', '')
            # email_verified gates expensive AI features against scripted
            # unverified-signup abuse. Google/OAuth sign-ins arrive verified.
            request.email_verified = bool(decoded_token.get('email_verified', False))
        except Exception as e:
            # If token is provided but invalid, we reject it
            return jsonify({'message': 'Token is invalid!', 'error': str(e)}), 401

        return f(*args, **kwargs)

    return decorated

def auth_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        get_db()
        if request.method == 'OPTIONS':
            return f(*args, **kwargs)

        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({'message': 'Authentication required!'}), 401
        
        id_token = auth_header.split('Bearer ')[1]
        try:
            decoded_token = auth.verify_id_token(id_token)
            request.uid = decoded_token['uid']
            request.email = decoded_token.get('email', '')
            request.email_verified = bool(decoded_token.get('email_verified', False))
        except Exception as e:
            return jsonify({'message': 'Token is invalid!', 'error': str(e)}), 401

        return f(*args, **kwargs)

    return decorated
