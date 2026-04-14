#!/usr/bin/env python3
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import uuid
import datetime

class MockHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_cors_headers()
        
    def do_POST(self):
        self.send_cors_headers()
        
        if self.path == '/api/v1/user/register':
            self.handle_register()
        elif self.path == '/api/v1/user/login':
            self.handle_login()
        elif self.path == '/api/v1/receipts':
            self.handle_create_receipt()
        else:
            self.send_error(404)
    
    def do_GET(self):
        self.send_cors_headers()
        
        if self.path == '/api/v1/receipts':
            self.handle_get_receipts()
        elif self.path == '/health':
            self.send_json({'status': 'ok'})
        else:
            self.send_error(404)
    
    def send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        
    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_cors_headers()
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    
    def get_request_body(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length > 0:
            body = self.rfile.read(content_length)
            return json.loads(body.decode())
        return {}
    
    def handle_register(self):
        data = self.get_request_body()
        user_id = str(uuid.uuid4())
        token = "mock-jwt-token-" + user_id[:8]
        
        response = {
            "token": token,
            "user": {
                "id": user_id,
                "email": data.get("email"),
                "username": data.get("username")
            }
        }
        self.send_json(response, 201)
    
    def handle_login(self):
        data = self.get_request_body()
        user_id = str(uuid.uuid4())
        token = "mock-jwt-token-" + user_id[:8]
        
        response = {
            "token": token,
            "user": {
                "id": user_id,
                "email": data.get("email"),
                "username": "Test User"
            }
        }
        self.send_json(response)
    
    def handle_create_receipt(self):
        data = self.get_request_body()
        receipt_id = str(uuid.uuid4())
        
        receipt = {
            "id": receipt_id,
            "user_id": "550e8400-e29b-41d4-a716-446655440000",
            "purchase_date": data.get("purchase_date", datetime.datetime.now().isoformat()),
            "total_amount": data.get("total_amount", 0),
            "status": "DONE",
            "created_at": datetime.datetime.now().isoformat(),
            "items": []
        }
        
        # Add items
        for item in data.get("items", []):
            item_id = str(uuid.uuid4())
            receipt["items"].append({
                "id": item_id,
                "description": item.get("description_raw", ""),
                "price": item.get("price", 0),
                "quantity": item.get("quantity", 1),
                "category_name": item.get("category_name"),
                "is_corrected_by_user": False,
                "confidence_score": 0.95
            })
        
        self.send_json(receipt, 201)
    
    def handle_get_receipts(self):
        # Return some mock receipts
        receipts = [
            {
                "id": str(uuid.uuid4()),
                "user_id": "550e8400-e29b-41d4-a716-446655440000",
                "purchase_date": "2024-09-19T10:30:00Z",
                "total_amount": 25.99,
                "status": "DONE",
                "created_at": "2024-09-19T10:35:00Z",
                "items": [
                    {
                        "id": str(uuid.uuid4()),
                        "description": "Apfel 1kg",
                        "price": 3.49,
                        "quantity": 1.0,
                        "category_name": "Obst",
                        "is_corrected_by_user": False,
                        "confidence_score": 0.95
                    }
                ]
            }
        ]
        self.send_json(receipts)

if __name__ == '__main__':
    print("🎯 Mock Backend running on http://localhost:3000")
    print("📋 Available endpoints:")
    print("   POST /api/v1/user/register")
    print("   POST /api/v1/user/login") 
    print("   GET  /api/v1/receipts")
    print("   POST /api/v1/receipts")
    print("   GET  /health")
    
    server = HTTPServer(('localhost', 3000), MockHandler)
    server.serve_forever()
