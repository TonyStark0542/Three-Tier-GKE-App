import os
from flask import Flask, jsonify, request
from flask_cors import CORS  
from pymongo import MongoClient
from bson.objectid import ObjectId

app = Flask(__name__)
CORS(app) 

mongo_uri = os.environ.get("MONGO_URI", "mongodb://mongodb-service:27017")
client = MongoClient(mongo_uri)
db = client['bookstore']

# The Health Check
@app.route('/')
def health_check():
    return "OK", 200

@app.route('/api/books', methods=['GET'])
def get_all_books():
    try:
        books_cursor = db['books'].find()
        books_list = []
        for book in books_cursor:
            book['_id'] = str(book['_id'])
            books_list.append(book)
        return jsonify(books_list)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/books/<string:book_id>', methods=['GET'])
def get_book_details(book_id):
    try:
        book = db['books'].find_one({'_id': ObjectId(book_id)})
        if book:
            book['_id'] = str(book['_id'])
            return jsonify(book)
        return jsonify({"error": "Book not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/books/category/<string:category_name>', methods=['GET'])
def get_books_by_category(category_name):
    try:
        books_cursor = db['books'].find({"category": category_name})
        books_list = []
        for book in books_cursor:
            book['_id'] = str(book['_id'])
            books_list.append(book)
        return jsonify(books_list)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True, host='0.0.0.0', port=5000)

