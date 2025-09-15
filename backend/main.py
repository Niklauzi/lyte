from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
import sqlite3
import hashlib
import secrets
import json
import base64
from datetime import datetime, timedelta
from typing import Optional, List
import httpx
import os
from pydantic import BaseModel

app = FastAPI()
security = HTTPBearer()

# CORS - Updated to be more permissive for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for images
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Database
def init_db():
    # Migration: Add updated_at column if it doesn't exist
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(posts)")
        columns = [row[1] for row in cursor.fetchall()]
        if 'updated_at' not in columns:
            print("Migrating: Adding updated_at column to posts table...")
            cursor.execute("ALTER TABLE posts ADD COLUMN updated_at TIMESTAMP")
            conn.commit()
    except Exception as e:
        print(f"Migration error: {e}")
    conn = sqlite3.connect("blog.db")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            twitter_id TEXT UNIQUE,
            username TEXT,
            avatar TEXT,
            is_admin BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            images TEXT,
            author_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (author_id) REFERENCES users (id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY,
            post_id INTEGER,
            user_id INTEGER,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (post_id) REFERENCES posts (id),
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS interactions (
            id INTEGER PRIMARY KEY,
            post_id INTEGER,
            user_id INTEGER,
            type TEXT CHECK(type IN ('like', 'dislike')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(post_id, user_id, type),
            FOREIGN KEY (post_id) REFERENCES posts (id),
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER,
            expires_at TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    # Create default admin users and some sample posts
    conn.execute("""
        INSERT OR IGNORE INTO users (twitter_id, username, is_admin) 
        VALUES ('admin1', 'Admin User 1', TRUE), ('admin2', 'Admin User 2', TRUE), ('admin3', 'Admin User 3', TRUE)
    """)
    
    # Add sample post if no posts exist
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM posts")
    post_count = cursor.fetchone()[0]
    
    if post_count == 0:
        cursor.execute("""
            INSERT INTO posts (title, content, images, author_id)
            VALUES (?, ?, ?, ?)
        """, (
            "Welcome to Blog Platform!", 
            "This is a sample post to demonstrate the blog platform. You can like, comment, and interact with posts. Admin users can create new posts like this one.",
            "[]",
            1
        ))
    
    conn.commit()
    conn.close()

init_db()

# Models
class PostCreate(BaseModel):
    title: str
    content: str

class PostUpdate(BaseModel):
    title: str
    content: str

class CommentCreate(BaseModel):
    content: str

# Auth helpers
def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        conn = sqlite3.connect("blog.db")
        cursor = conn.cursor()
        
        # Debug print
        print(f"Checking token: {credentials.credentials}")
        
        cursor.execute("""
            SELECT u.* FROM users u 
            JOIN sessions s ON u.id = s.user_id 
            WHERE s.token = ? AND s.expires_at > ?
        """, (credentials.credentials, datetime.now()))
        user = cursor.fetchone()
        
        if not user:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        
        user_data = {
            "id": user[0],
            "twitter_id": user[1],
            "username": user[2],
            "avatar": user[3],
            "is_admin": bool(user[4])
        }
        
        # Debug print
        print(f"Authenticated user: {user_data}")
        
        return user_data
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Auth error: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")
    finally:
        conn.close()

def get_optional_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False))):
    if not credentials:
        return None
    try:
        return get_current_user(credentials)
    except:
        return None

# Health check endpoint
@app.get("/")
async def health_check():
    return {"status": "healthy", "message": "Blog API is running"}

# Twitter OAuth (simplified for demo)
@app.post("/auth/twitter")
async def twitter_login(twitter_data: dict):
    try:
        print(f"Login attempt with data: {twitter_data}")  # Debug log
        
        # Validate required fields
        if "twitter_id" not in twitter_data or "username" not in twitter_data:
            raise HTTPException(status_code=400, detail="Missing required fields")
            
        print(f"Processing login for user: {twitter_data['username']}, admin: {twitter_data.get('is_admin', False)}")  # Debug log
        
        conn = sqlite3.connect("blog.db")
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM users WHERE twitter_id = ?", (twitter_data["twitter_id"],))
        user = cursor.fetchone()
        
        if not user:
            cursor.execute("""
                INSERT INTO users (twitter_id, username, avatar, is_admin) 
                VALUES (?, ?, ?, ?)
            """, (twitter_data["twitter_id"], twitter_data["username"], twitter_data.get("avatar", ""), twitter_data.get("is_admin", False)))
            user_id = cursor.lastrowid
            cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
            user = cursor.fetchone()
        else:
            user_id = user[0]
        
        # Create session
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now() + timedelta(days=30)
        
        cursor.execute("""
            INSERT OR REPLACE INTO sessions (token, user_id, expires_at) 
            VALUES (?, ?, ?)
        """, (token, user_id, expires_at))
        
        conn.commit()
        conn.close()
        
        user_data = {
            "id": user[0],
            "twitter_id": user[1],
            "username": user[2],
            "avatar": user[3],
            "is_admin": bool(user[4])
        }
        
        print(f"Login successful: {user_data}")  # Debug log
        
        return {
            "token": token,
            "user": user_data
        }
        
    except Exception as e:
        print(f"Login error: {e}")  # Debug log
        raise HTTPException(status_code=500, detail="Login failed")

# Posts
@app.get("/posts")
async def get_posts(user: dict = Depends(get_optional_user)):
    try:
        conn = sqlite3.connect("blog.db")
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT p.*, u.username, u.avatar,
                   COUNT(CASE WHEN i.type = 'like' THEN 1 END) as likes,
                   COUNT(CASE WHEN i.type = 'dislike' THEN 1 END) as dislikes,
                   COUNT(c.id) as comment_count
            FROM posts p
            JOIN users u ON p.author_id = u.id
            LEFT JOIN interactions i ON p.id = i.post_id
            LEFT JOIN comments c ON p.id = c.post_id
            GROUP BY p.id
            ORDER BY p.created_at DESC
        """)
        posts = cursor.fetchall()
        conn.close()
        
        return [{
            "id": post[0],
            "title": post[1],
            "content": post[2],
            "images": json.loads(post[3]) if post[3] else [],
            "author": {"username": post[6], "avatar": post[7]},
            "created_at": post[4],
            "updated_at": post[5],
            "likes": post[8],
            "dislikes": post[9],
            "comment_count": post[10]
        } for post in posts]
        
    except Exception as e:
        print(f"Error getting posts: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch posts")

@app.post("/posts")
async def create_post(
    title: str = Form(...),
    content: str = Form(...),
    images: List[UploadFile] = File(default=[]),
    user: dict = Depends(get_current_user)
):
    try:
        print(f"Creating post by user: {user}")  # Debug log
        
        if not user["is_admin"]:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        # Save images
        image_paths = []
        for img in images:
            if img.filename:
                ext = img.filename.split(".")[-1].lower()
                if ext not in ['jpg', 'jpeg', 'png', 'gif', 'webp']:
                    continue
                    
                filename = f"{secrets.token_hex(16)}.{ext}"
                file_path = f"static/{filename}"
                
                with open(file_path, "wb") as f:
                    content_bytes = await img.read()
                    f.write(content_bytes)
                image_paths.append(f"/static/{filename}")
        
        conn = sqlite3.connect("blog.db")
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO posts (title, content, images, author_id)
            VALUES (?, ?, ?, ?)
        """, (title, content, json.dumps(image_paths), user["id"]))
        conn.commit()
        conn.close()
        
        print(f"Post created successfully: {title}")  # Debug log
        return {"message": "Post created successfully", "title": title}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error creating post: {e}")
        raise HTTPException(status_code=500, detail="Failed to create post")

@app.put("/posts/{post_id}")
async def update_post(
    post_id: int,
    title: str = Form(...),
    content: str = Form(...),
    existing_images: str = Form(default="[]"),
    new_images: List[UploadFile] = File(default=[]),
    user: dict = Depends(get_current_user)
):
    try:
        print(f"Updating post {post_id} by user: {user}")  # Debug log
        
        if not user["is_admin"]:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        conn = sqlite3.connect("blog.db")
        cursor = conn.cursor()
        
        # Check if post exists and user has permission
        cursor.execute("SELECT author_id FROM posts WHERE id = ?", (post_id,))
        post = cursor.fetchone()
        if not post:
            conn.close()
            raise HTTPException(status_code=404, detail="Post not found")
        
        # Parse existing images
        try:
            existing_image_list = json.loads(existing_images)
        except:
            existing_image_list = []
        
        # Save new images
        new_image_paths = []
        for img in new_images:
            if img.filename:
                ext = img.filename.split(".")[-1].lower()
                if ext not in ['jpg', 'jpeg', 'png', 'gif', 'webp']:
                    continue
                    
                filename = f"{secrets.token_hex(16)}.{ext}"
                file_path = f"static/{filename}"
                
                with open(file_path, "wb") as f:
                    content_bytes = await img.read()
                    f.write(content_bytes)
                new_image_paths.append(f"/static/{filename}")
        
        # Combine existing and new images
        all_images = existing_image_list + new_image_paths
        
        # Update the post
        cursor.execute("""
            UPDATE posts 
            SET title = ?, content = ?, images = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (title, content, json.dumps(all_images), post_id))
        
        conn.commit()
        
        # Get updated post data
        cursor.execute("""
            SELECT p.*, u.username, u.avatar
            FROM posts p
            JOIN users u ON p.author_id = u.id
            WHERE p.id = ?
        """, (post_id,))
        updated_post = cursor.fetchone()
        
        conn.close()
        
        if updated_post:
            result = {
                "id": updated_post[0],
                "title": updated_post[1],
                "content": updated_post[2],
                "images": json.loads(updated_post[3]) if updated_post[3] else [],
                "author": {"username": updated_post[6], "avatar": updated_post[7]},
                "created_at": updated_post[4],
                "updated_at": updated_post[5]
            }
            
            print(f"Post updated successfully: {title}")  # Debug log
            return result
        else:
            raise HTTPException(status_code=500, detail="Failed to retrieve updated post")
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating post: {e}")
        raise HTTPException(status_code=500, detail="Failed to update post")

@app.delete("/posts/{post_id}")
async def delete_post(
    post_id: int,
    user: dict = Depends(get_current_user)
):
    try:
        print(f"Deleting post {post_id} by user: {user}")  # Debug log
        
        if not user["is_admin"]:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        conn = sqlite3.connect("blog.db")
        cursor = conn.cursor()
        
        # Check if post exists
        cursor.execute("SELECT images FROM posts WHERE id = ?", (post_id,))
        post = cursor.fetchone()
        if not post:
            conn.close()
            raise HTTPException(status_code=404, detail="Post not found")
        
        # Delete associated images from filesystem
        try:
            images = json.loads(post[0]) if post[0] else []
            for img_path in images:
                if img_path.startswith("/static/"):
                    file_path = img_path[1:]  # Remove leading slash
                    if os.path.exists(file_path):
                        os.remove(file_path)
        except Exception as e:
            print(f"Error deleting images: {e}")
        
        # Delete related records first (comments, interactions)
        cursor.execute("DELETE FROM comments WHERE post_id = ?", (post_id,))
        cursor.execute("DELETE FROM interactions WHERE post_id = ?", (post_id,))
        
        # Delete the post
        cursor.execute("DELETE FROM posts WHERE id = ?", (post_id,))
        
        conn.commit()
        conn.close()
        
        print(f"Post {post_id} deleted successfully")  # Debug log
        return {"message": "Post deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deleting post: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete post")

# Comments
@app.get("/posts/{post_id}/comments")
async def get_comments(post_id: int):
    try:
        conn = sqlite3.connect("blog.db")
        cursor = conn.cursor()
        cursor.execute("""
            SELECT c.*, u.username, u.avatar
            FROM comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.post_id = ?
            ORDER BY c.created_at ASC
        """, (post_id,))
        comments = cursor.fetchall()
        conn.close()
        
        return [{
            "id": comment[0],
            "content": comment[3],
            "created_at": comment[4],
            "user": {"username": comment[5], "avatar": comment[6]}
        } for comment in comments]
        
    except Exception as e:
        print(f"Error getting comments: {e}")
        return []

@app.post("/posts/{post_id}/comments")
async def create_comment(
    post_id: int, 
    comment_data: CommentCreate,
    user: dict = Depends(get_current_user)
):
    try:
        conn = sqlite3.connect("blog.db")
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO comments (post_id, user_id, content)
            VALUES (?, ?, ?)
        """, (post_id, user["id"], comment_data.content))
        conn.commit()
        conn.close()
        
        return {"message": "Comment created successfully"}
        
    except Exception as e:
        print(f"Error creating comment: {e}")
        raise HTTPException(status_code=500, detail="Failed to create comment")

# Interactions
@app.post("/posts/{post_id}/{action}")
async def interact_with_post(
    post_id: int, 
    action: str,
    user: dict = Depends(get_current_user)
):
    if action not in ["like", "dislike"]:
        raise HTTPException(status_code=400, detail="Invalid action")
    
    try:
        conn = sqlite3.connect("blog.db")
        cursor = conn.cursor()
        
        # Remove existing interaction
        cursor.execute("""
            DELETE FROM interactions 
            WHERE post_id = ? AND user_id = ?
        """, (post_id, user["id"]))
        
        # Add new interaction
        cursor.execute("""
            INSERT INTO interactions (post_id, user_id, type)
            VALUES (?, ?, ?)
        """, (post_id, user["id"], action))
        
        conn.commit()
        conn.close()
        
        return {"message": f"Post {action}d successfully"}
        
    except Exception as e:
        print(f"Error with interaction: {e}")
        raise HTTPException(status_code=500, detail="Failed to process interaction")

# Predictive models (playful AI features)
@app.get("/predict/engagement/{post_id}")
async def predict_engagement(post_id: int):
    try:
        conn = sqlite3.connect("blog.db")
        cursor = conn.cursor()
        cursor.execute("""
            SELECT LENGTH(content), 
                   COUNT(CASE WHEN i.type = 'like' THEN 1 END) as likes,
                   COUNT(c.id) as comments
            FROM posts p
            LEFT JOIN interactions i ON p.id = i.post_id
            LEFT JOIN comments c ON p.id = c.post_id
            WHERE p.id = ?
            GROUP BY p.id
        """, (post_id,))
        data = cursor.fetchone()
        conn.close()
        
        if not data:
            raise HTTPException(status_code=404, detail="Post not found")
        
        # Simple "AI" prediction based on content length
        content_length, likes, comments = data
        engagement_score = min(100, (content_length / 50) + (likes * 10) + (comments * 15))
        
        predictions = [
            f"This post will likely get {int(engagement_score * 0.3)} more interactions",
            f"Peak engagement expected in {2 + (content_length % 5)} hours",
            f"Viral probability: {min(95, int(engagement_score))}%"
        ]
        
        return {
            "engagement_score": round(engagement_score, 1),
            "predictions": predictions,
            "confidence": "74.2%"  # Always optimistic!
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error predicting engagement: {e}")
        # Return fallback prediction
        return {
            "engagement_score": 65.0,
            "predictions": [
                "This post has good engagement potential",
                "Peak engagement expected in 3-5 hours",
                "Viral probability: 65%"
            ],
            "confidence": "74.2%"
        }

@app.get("/predict/trending")
async def predict_trending():
    import random
    topics = ["AI", "Python", "React", "FastAPI", "Twitter", "Tech", "Web Dev", "APIs", "Machine Learning", "Data Science"]
    return {
        "trending_topics": random.sample(topics, 3),
        "next_viral_post": f"Posts about {random.choice(topics)} are 67% more likely to go viral",
        "best_time_to_post": f"{random.randint(9, 18)}:00 - {random.randint(19, 23)}:00"
    }

# Debug endpoint to check database
@app.get("/debug/users")
async def debug_users():
    conn = sqlite3.connect("blog.db")
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users")
    users = cursor.fetchall()
    conn.close()
    return {"users": users}

if __name__ == "__main__":
    import uvicorn
    print("Starting Blog Platform API...")
    print("Admin users available: admin1, admin2, admin3")
    uvicorn.run(app, host="0.0.0.0", port=8000)