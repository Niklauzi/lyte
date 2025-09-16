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
from dotenv import load_dotenv

load_dotenv()
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
    conn = sqlite3.connect("blog.db")
    
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
    
    # Migration: Add avatar column if it doesn't exist
    try:
        cursor.execute("PRAGMA table_info(users)")
        columns = [row[1] for row in cursor.fetchall()]
        if 'avatar' not in columns:
            print("Migrating: Adding avatar column to users table...")
            cursor.execute("ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT ''")
            conn.commit()
    except Exception as e:
        print(f"Migration error (avatar): {e}")

    # Drop old users table if it exists (one-time migration)
    # conn.execute("DROP TABLE IF EXISTS users")

    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            username TEXT UNIQUE,
            password_hash TEXT,
            is_admin BOOLEAN DEFAULT FALSE,
            is_anonymous BOOLEAN DEFAULT FALSE,
            avatar TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create admin user with default credentials (username: admin, password: admin123)
    admin_password = os.getenv('PASSWORD')
    admin_password_hash = hashlib.sha256(admin_password.encode()).hexdigest()
    conn.execute("""
        INSERT OR IGNORE INTO users (username, password_hash, is_admin, avatar) 
        VALUES (?, ?, TRUE, '')
    """, ("admin", admin_password_hash))
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
        INSERT OR IGNORE INTO users (username, is_admin, avatar) 
        VALUES ('Admin User 1', TRUE, ''), ('Admin User 2', TRUE, ''), ('Admin User 3', TRUE, '')
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
            "username": user[1],
            "is_admin": bool(user[3]),
            "is_anonymous": bool(user[4])
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

# Helper function to get post with user interactions
def get_post_with_interactions(post_id: int, user_id: Optional[int] = None):
    """Get a post with all its interaction counts and user-specific data"""
    conn = sqlite3.connect("blog.db")
    cursor = conn.cursor()
    
    # Get post data with counts
    cursor.execute("""
        SELECT 
            p.id,
            p.title,
            p.content,
            p.images,
            p.created_at,
            p.updated_at,
            u.username,
            u.avatar,
            (SELECT COUNT(*) FROM interactions i WHERE i.post_id = p.id AND i.type = 'like') as likes,
            (SELECT COUNT(*) FROM interactions i WHERE i.post_id = p.id AND i.type = 'dislike') as dislikes,
            (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count
        FROM posts p
        JOIN users u ON p.author_id = u.id
        WHERE p.id = ?
    """, (post_id,))
    
    post_data = cursor.fetchone()
    
    if not post_data:
        conn.close()
        return None
    
    # Get user-specific interactions if user is provided
    user_liked = False
    user_disliked = False
    
    if user_id:
        cursor.execute("""
            SELECT type FROM interactions 
            WHERE post_id = ? AND user_id = ?
        """, (post_id, user_id))
        user_interactions = cursor.fetchall()
        
        for interaction in user_interactions:
            if interaction[0] == 'like':
                user_liked = True
            elif interaction[0] == 'dislike':
                user_disliked = True
    
    conn.close()
    
    return {
        "id": post_data[0],
        "title": post_data[1],
        "content": post_data[2],
        "images": json.loads(post_data[3]) if post_data[3] else [],
        "created_at": post_data[4],
        "updated_at": post_data[5],
        "author": {"username": post_data[6], "avatar": post_data[7]},
        "likes": post_data[8],
        "dislikes": post_data[9],
        "comment_count": post_data[10],
        "user_liked": user_liked,
        "user_disliked": user_disliked
    }

# Models for auth
class LoginData(BaseModel):
    username: str
    password: str

class AnonymousUserCreate(BaseModel):
    device_id: str

# Health check endpoint
@app.get("/")
async def health_check():
    return {"status": "healthy", "message": "Blog API is running"}

# Admin login
@app.post("/auth/login")
async def admin_login(login_data: LoginData):
    try:
        conn = sqlite3.connect("blog.db")
        cursor = conn.cursor()
        
        password_hash = hashlib.sha256(login_data.password.encode()).hexdigest()
        
        cursor.execute("""
            SELECT * FROM users 
            WHERE username = ? AND password_hash = ? AND is_admin = TRUE
        """, (login_data.username, password_hash))
        
        user = cursor.fetchone()
        
        if not user:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        user_id = user[0]
        
        # Create session
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now() + timedelta(days=30)
        
        cursor.execute("""
            INSERT OR REPLACE INTO sessions (token, user_id, expires_at) 
            VALUES (?, ?, ?)
        """, (token, user_id, expires_at))
        
        conn.commit()
        
        return {
            "token": token,
            "user": {
                "id": user[0],
                "username": user[1],
                "is_admin": bool(user[3])
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Login error: {e}")
        raise HTTPException(status_code=500, detail="Login failed")
    finally:
        conn.close()

# Anonymous user creation/authentication
@app.post("/auth/anonymous")
async def create_anonymous_user(user_data: AnonymousUserCreate):
    try:
        conn = sqlite3.connect("blog.db")
        cursor = conn.cursor()
        
        # Check if device already has an anonymous user
        cursor.execute("SELECT * FROM users WHERE username = ? AND is_anonymous = TRUE", (user_data.device_id,))
        user = cursor.fetchone()
        
        if not user:
            cursor.execute("""
                INSERT INTO users (username, is_anonymous) 
                VALUES (?, TRUE)
            """, (user_data.device_id,))
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
        
        return {
            "token": token,
            "user": {
                "id": user[0],
                "username": user[1],
                "is_anonymous": bool(user[4])
            }
        }
        
    except Exception as e:
        print(f"Anonymous user creation error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create anonymous user")
    finally:
        conn.close()

# Posts
@app.get("/posts")
async def get_posts(user: dict = Depends(get_optional_user)):
    try:
        conn = sqlite3.connect("blog.db")
        cursor = conn.cursor()
        
        current_user_id = user["id"] if user else None
        
        # Get all posts with their interaction counts
        cursor.execute("""
            SELECT 
                p.id,
                p.title,
                p.content,
                p.images,
                p.created_at,
                p.updated_at,
                u.username,
                u.avatar,
                (SELECT COUNT(*) FROM interactions i WHERE i.post_id = p.id AND i.type = 'like') as likes,
                (SELECT COUNT(*) FROM interactions i WHERE i.post_id = p.id AND i.type = 'dislike') as dislikes,
                (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count
            FROM posts p
            JOIN users u ON p.author_id = u.id
            ORDER BY p.created_at DESC
        """)
        posts_data = cursor.fetchall()
        
        # Get user-specific interactions if user is logged in
        user_interactions = {}
        if current_user_id:
            cursor.execute("""
                SELECT post_id, type FROM interactions 
                WHERE user_id = ?
            """, (current_user_id,))
            for post_id, interaction_type in cursor.fetchall():
                if post_id not in user_interactions:
                    user_interactions[post_id] = {'like': False, 'dislike': False}
                user_interactions[post_id][interaction_type] = True
        
        conn.close()
        
        # Format the response
        posts = []
        for post_data in posts_data:
            post_id = post_data[0]
            user_likes = user_interactions.get(post_id, {'like': False, 'dislike': False})
            
            posts.append({
                "id": post_data[0],
                "title": post_data[1],
                "content": post_data[2],
                "images": json.loads(post_data[3]) if post_data[3] else [],
                "created_at": post_data[4],
                "updated_at": post_data[5],
                "author": {"username": post_data[6], "avatar": post_data[7]},
                "likes": post_data[8],
                "dislikes": post_data[9],
                "comment_count": post_data[10],
                "user_liked": user_likes['like'],
                "user_disliked": user_likes['dislike']
            })
        
        return posts
        
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
        conn.close()
        
        # Get updated post data using helper function
        updated_post = get_post_with_interactions(post_id, user["id"])
        
        if updated_post:
            print(f"Post updated successfully: {title}")  # Debug log
            return updated_post
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

# Interactions - FIXED VERSION
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
        
        print(f"User {user['id']} attempting to {action} post {post_id}")  # Debug log
        
        # Check if user already has this specific interaction
        cursor.execute("""
            SELECT type FROM interactions 
            WHERE post_id = ? AND user_id = ? AND type = ?
        """, (post_id, user["id"], action))
        existing_same_action = cursor.fetchone()
        
        # Start transaction
        cursor.execute("BEGIN")
        
        if existing_same_action:
            # User is toggling off the same action - remove it
            cursor.execute("""
                DELETE FROM interactions 
                WHERE post_id = ? AND user_id = ? AND type = ?
            """, (post_id, user["id"], action))
            print(f"Removed {action} from user {user['id']} on post {post_id}")
        else:
            # Remove any opposite interaction first
            opposite_action = "dislike" if action == "like" else "like"
            cursor.execute("""
                DELETE FROM interactions 
                WHERE post_id = ? AND user_id = ? AND type = ?
            """, (post_id, user["id"], opposite_action))
            
            # Add the new interaction
            cursor.execute("""
                INSERT INTO interactions (post_id, user_id, type)
                VALUES (?, ?, ?)
            """, (post_id, user["id"], action))
            print(f"Added {action} from user {user['id']} on post {post_id}")

        conn.commit()
        conn.close()
        
        # Get updated post data using helper function
        updated_post = get_post_with_interactions(post_id, user["id"])
        
        if updated_post:
            print(f"Returning updated post: likes={updated_post['likes']}, dislikes={updated_post['dislikes']}, user_liked={updated_post['user_liked']}, user_disliked={updated_post['user_disliked']}")
            return updated_post
        else:
            raise HTTPException(status_code=404, detail="Post not found")
        
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
                   (SELECT COUNT(*) FROM interactions i WHERE i.post_id = ? AND i.type = 'like') as likes,
                   (SELECT COUNT(*) FROM comments c WHERE c.post_id = ?) as comments
            FROM posts p
            WHERE p.id = ?
        """, (post_id, post_id, post_id))
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

@app.get("/debug/interactions/{post_id}")
async def debug_interactions(post_id: int):
    conn = sqlite3.connect("blog.db")
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM interactions WHERE post_id = ?", (post_id,))
    interactions = cursor.fetchall()
    cursor.execute("SELECT * FROM comments WHERE post_id = ?", (post_id,))
    comments = cursor.fetchall()
    conn.close()
    return {"interactions": interactions, "comments": comments}

if __name__ == "__main__":
    import uvicorn
    print("Starting Blog Platform API...")
    print("Admin users available: admin1, admin2, admin3")
    uvicorn.run(app, host="0.0.0.0", port=8000)