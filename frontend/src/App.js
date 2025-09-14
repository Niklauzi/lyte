import React, { useState, useEffect } from 'react';
import { MessageCircle, Heart, ThumbsDown, Share2, Upload, PlusCircle, TrendingUp, Brain, Clock } from 'lucide-react';
import 'bootstrap/dist/css/bootstrap.min.css';

const API_URL = 'http://localhost:8000';

// Auth context
const AuthContext = React.createContext();

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  useEffect(() => {
    // Check for token in memory first, then localStorage as fallback for demo
    const savedToken = localStorage.getItem('token');
    if (savedToken) {
      setToken(savedToken);
      // In real app, verify token with backend
      const savedUser = localStorage.getItem('user');
      if (savedUser) {
        setUser(JSON.parse(savedUser));
      }
    }
  }, []);

  const login = async (twitterData) => {
  try {
    const response = await fetch(`${API_URL}/auth/twitter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(twitterData)
    });

    if (!response.ok) {
      throw new Error('Login failed');
    }

    const data = await response.json();
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
  } catch (error) {
    console.error('Login error:', error);
  }
};

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, token }}>
      {children}
    </AuthContext.Provider>
  );
}

// Login component
function TwitterLogin() {
  const { login } = React.useContext(AuthContext);
  
  const handleLogin = async (isAdmin = false) => {
    const mockData = {
      twitter_id: isAdmin ? `admin_${Math.floor(Math.random() * 3) + 1}` : `user_${Date.now()}`,
      username: isAdmin ? 'Admin User' : 'Demo User',
      avatar: '',
      is_admin: isAdmin
    };
    
    console.log('Logging in with:', mockData); // Debug log
    await login(mockData);
  };

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center" style={{background: 'linear-gradient(135deg, #f8f9ff 0%, #e3e7ff 100%)'}}>
      <div className="card shadow-lg" style={{maxWidth: '400px', width: '100%'}}>
        <div className="card-body p-5">
          <div className="text-center mb-4">
            <h1 className="h2 fw-bold text-dark mb-3">Blog Platform</h1>
            <p className="text-muted">Connect with Twitter to continue</p>
          </div>
          
          <div className="d-grid gap-3">
            <button
              onClick={() => handleLogin(false)}
              className="btn btn-primary btn-lg d-flex align-items-center justify-content-center gap-2"
            >
              <MessageCircle size={20} />
              Login as Reader
            </button>
            
            <button
              onClick={() => handleLogin(true)}
              className="btn btn-success btn-lg d-flex align-items-center justify-content-center gap-2"
            >
              <PlusCircle size={20} />
              Login as Admin
            </button>
          </div>
          
          <p className="text-muted text-center mt-4 small">
            Demo app - no real Twitter auth required
          </p>
        </div>
      </div>
    </div>
  );
}

// Post card component
function PostCard({ post, onInteract, onComment }) {
  const { user, token } = React.useContext(AuthContext);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [prediction, setPrediction] = useState(null);

  const loadComments = async () => {
    try {
      const res = await fetch(`${API_URL}/posts/${post.id}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data);
      }
    } catch (error) {
      console.error('Error loading comments:', error);
      // Demo fallback
      setComments([]);
    }
  };

  const loadPrediction = async () => {
    try {
      const res = await fetch(`${API_URL}/predict/engagement/${post.id}`);
      if (res.ok) {
        const data = await res.json();
        setPrediction(data);
      }
    } catch (error) {
      console.error('Error loading prediction:', error);
      // Demo fallback
      setPrediction({
        engagement_score: Math.floor(Math.random() * 100),
        predictions: [
          "This post will likely get 5-10 more interactions",
          "Peak engagement expected in 3 hours",
          "Viral probability: 78%"
        ],
        confidence: "74.2%"
      });
    }
  };

  const handleComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || !token) return;

    try {
      const res = await fetch(`${API_URL}/posts/${post.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ content: newComment })
      });
      
      if (res.ok) {
        setNewComment('');
        loadComments();
      }
    } catch (error) {
      console.error('Error posting comment:', error);
      // Demo: just clear the comment
      setNewComment('');
    }
  };

  const handleInteract = async (action) => {
    if (!token) return;
    await onInteract(post.id, action);
    if (action === 'like') loadPrediction();
  };

  return (
    <div className="card shadow-sm mb-4">
      <div className="card-body">
        <div className="d-flex align-items-center mb-3">
          <div 
            className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold me-3"
            style={{
              width: '40px', 
              height: '40px', 
              background: 'linear-gradient(45deg, #8b5cf6, #ec4899)'
            }}
          >
            {post.author.username[0].toUpperCase()}
          </div>
          <div>
            <h6 className="mb-0 fw-semibold">{post.author.username}</h6>
            <small className="text-muted">{new Date(post.created_at).toLocaleDateString()}</small>
          </div>
        </div>
        
        <h2 className="h4 fw-bold mb-3">{post.title}</h2>
        <p className="text-dark mb-4" style={{lineHeight: '1.6'}}>{post.content}</p>
        
        {post.images && post.images.length > 0 && (
          <div className="row g-3 mb-4">
            {post.images.map((img, idx) => (
              <div key={idx} className="col-md-6">
                <img
                  src={`${API_URL}${img}`}
                  alt="Post content"
                  className="img-fluid rounded"
                  style={{height: '200px', objectFit: 'cover', width: '100%'}}
                />
              </div>
            ))}
          </div>
        )}
        
        <div className="border-top pt-3">
          <div className="d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center gap-4">
              <button
                onClick={() => handleInteract('like')}
                className="btn btn-link p-0 text-danger d-flex align-items-center gap-2"
                disabled={!user}
                style={{textDecoration: 'none'}}
              >
                <Heart size={20} />
                <span>{post.likes || 0}</span>
              </button>
              
              <button
                onClick={() => handleInteract('dislike')}
                className="btn btn-link p-0 text-muted d-flex align-items-center gap-2"
                disabled={!user}
                style={{textDecoration: 'none'}}
              >
                <ThumbsDown size={20} />
                <span>{post.dislikes || 0}</span>
              </button>
              
              <button
                onClick={() => {
                  setShowComments(!showComments);
                  if (!showComments) loadComments();
                }}
                className="btn btn-link p-0 text-primary d-flex align-items-center gap-2"
                style={{textDecoration: 'none'}}
              >
                <MessageCircle size={20} />
                <span>{post.comment_count || 0}</span>
              </button>
              
              <button className="btn btn-link p-0 text-success d-flex align-items-center gap-2" style={{textDecoration: 'none'}}>
                <Share2 size={20} />
                Share
              </button>
            </div>
            
            <button
              onClick={loadPrediction}
              className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-2"
            >
              <Brain size={16} />
              AI Predict
            </button>
          </div>
        </div>
        
        {prediction && (
          <div className="alert alert-info mt-3" style={{background: 'linear-gradient(45deg, #f8f4ff, #fdf2f8)', border: '1px solid #e0e7ff'}}>
            <div className="d-flex align-items-center gap-2 mb-2">
              <TrendingUp size={16} className="text-primary" />
              <strong className="text-primary">AI Prediction</strong>
              <small className="text-muted">({prediction.confidence})</small>
            </div>
            <div className="small">
              <p className="mb-1"><strong>Engagement Score:</strong> {prediction.engagement_score}/100</p>
              {prediction.predictions.map((pred, idx) => (
                <p key={idx} className="mb-1">• {pred}</p>
              ))}
            </div>
          </div>
        )}
        
        {showComments && (
          <div className="border-top mt-3 pt-3">
            {user && (
              <form onSubmit={handleComment} className="mb-3">
                <div className="input-group">
                  <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Write a comment..."
                    className="form-control"
                  />
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={!newComment.trim()}
                  >
                    Post
                  </button>
                </div>
              </form>
            )}
            
            <div className="vstack gap-3">
              {comments.map((comment) => (
                <div key={comment.id} className="d-flex gap-3">
                  <div 
                    className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold"
                    style={{
                      width: '32px', 
                      height: '32px', 
                      background: 'linear-gradient(45deg, #3b82f6, #8b5cf6)',
                      minWidth: '32px'
                    }}
                  >
                    {comment.user.username[0].toUpperCase()}
                  </div>
                  <div className="flex-grow-1">
                    <div className="d-flex align-items-center gap-2 mb-1">
                      <small className="fw-semibold">{comment.user.username}</small>
                      <small className="text-muted">{new Date(comment.created_at).toLocaleDateString()}</small>
                    </div>
                    <p className="mb-0">{comment.content}</p>
                  </div>
                </div>
              ))}
              {comments.length === 0 && (
                <p className="text-muted text-center">No comments yet</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Create post form
function CreatePostForm({ onPostCreated }) {
  const { token } = React.useContext(AuthContext);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setLoading(true);
    
    try {
      const formData = new FormData();
      formData.append('title', title);
      formData.append('content', content);
      
      // Append images if any
      for (let i = 0; i < images.length; i++) {
        formData.append('images', images[i]);
      }

      const res = await fetch(`${API_URL}/posts`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      
      if (res.ok) {
        setTitle('');
        setContent('');
        setImages([]);
        onPostCreated();
      } else {
        console.error('Error creating post:', await res.text());
        alert('Error creating post. Please try again.');
      }
    } catch (error) {
      console.error('Error creating post:', error);
      alert('Error creating post. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleImageChange = (e) => {
    const fileList = Array.from(e.target.files);
    setImages(fileList);
  };

  return (
    <div className="card shadow-sm mb-4">
      <div className="card-body">
        <h2 className="h5 fw-bold mb-3">Create New Post</h2>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Post title..."
              className="form-control form-control-lg"
              required
            />
          </div>
          
          <div className="mb-3">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your post content..."
              rows={6}
              className="form-control"
              required
            />
          </div>
          
          <div className="d-flex align-items-center gap-3 mb-3">
            <label className="btn btn-outline-secondary d-flex align-items-center gap-2">
              <Upload size={20} />
              Add Images
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleImageChange}
                className="d-none"
              />
            </label>
            {images.length > 0 && (
              <small className="text-muted">{images.length} image(s) selected</small>
            )}
          </div>
          
          <button
            type="submit"
            disabled={loading || !title.trim() || !content.trim()}
            className="btn btn-primary btn-lg w-100"
            style={{background: 'linear-gradient(45deg, #8b5cf6, #ec4899)', border: 'none'}}
          >
            {loading ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                Publishing...
              </>
            ) : (
              'Publish Post'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

// AI Insights Panel
function AIInsights() {
  const [insights, setInsights] = useState(null);

  useEffect(() => {
    const loadInsights = async () => {
      try {
        const res = await fetch(`${API_URL}/predict/trending`);
        if (res.ok) {
          const data = await res.json();
          setInsights(data);
        }
      } catch (error) {
        console.error('Error loading insights:', error);
        // Demo fallback
        setInsights({
          trending_topics: ['React', 'FastAPI', 'AI'],
          next_viral_post: 'Posts about Python are 67% more likely to go viral',
          best_time_to_post: '14:00 - 18:00'
        });
      }
    };
    loadInsights();
  }, []);

  if (!insights) {
    return (
      <div className="card text-white mb-4" style={{background: 'linear-gradient(45deg, #8b5cf6, #ec4899)'}}>
        <div className="card-body text-center">
          <div className="spinner-border text-white" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-2 mb-0">Loading AI insights...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card text-white mb-4" style={{background: 'linear-gradient(45deg, #8b5cf6, #ec4899)'}}>
      <div className="card-body">
        <div className="d-flex align-items-center gap-2 mb-3">
          <Brain size={24} />
          <h2 className="h5 mb-0 fw-bold">AI Insights</h2>
        </div>
        
        <div className="vstack gap-3">
          <div>
            <h6 className="fw-semibold mb-1">🔥 Trending Topics</h6>
            <p className="mb-0 opacity-75">{insights.trending_topics.join(', ')}</p>
          </div>
          
          <div>
            <h6 className="fw-semibold mb-1">📈 Viral Prediction</h6>
            <p className="mb-0 opacity-75">{insights.next_viral_post}</p>
          </div>
          
          <div className="d-flex align-items-center gap-2">
            <Clock size={16} />
            <span className="fw-semibold">Best Time to Post:</span>
            <span className="opacity-75">{insights.best_time_to_post}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Main app
function BlogApp() {
  const { user, logout, token } = React.useContext(AuthContext);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  console.log('Current user:', user); // Debug log

  const loadPosts = async () => {
    try {
      const res = await fetch(`${API_URL}/posts`);
      if (res.ok) {
        const data = await res.json();
        setPosts(data);
      } else {
        console.error('Error loading posts:', res.status);
        // Demo fallback with sample data
        setPosts([
          {
            id: 1,
            title: "Welcome to the Blog Platform!",
            content: "This is a demo post to show how the platform works. You can like, comment, and share posts.",
            images: [],
            author: { username: "Demo Admin", avatar: "" },
            created_at: new Date().toISOString(),
            likes: 5,
            dislikes: 0,
            comment_count: 2
          }
        ]);
      }
    } catch (error) {
      console.error('Error loading posts:', error);
      // Demo fallback
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInteract = async (postId, action) => {
    try {
      const res = await fetch(`${API_URL}/posts/${postId}/${action}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        loadPosts();
      }
    } catch (error) {
      console.error('Error with interaction:', error);
      // For demo, just reload posts
      loadPosts();
    }
  };

  useEffect(() => {
    loadPosts();
  }, []);

  if (loading) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center">
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-2 text-muted">Loading posts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-vh-100 bg-light">
      <nav className="navbar navbar-expand-lg navbar-light bg-white shadow-sm">
        <div className="container">
          <span className="navbar-brand h2 fw-bold mb-0">Blog Platform</span>
          <div className="d-flex align-items-center gap-3">
            <span className="text-muted">
              Welcome, {user?.username} 
              {user?.is_admin && <span className="badge bg-success ms-2">Admin</span>}
            </span>
            <button
              onClick={logout}
              className="btn btn-outline-danger btn-sm"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>
      
      <div className="container py-4">
        <div className="row justify-content-center">
          <div className="col-lg-8">
            <AIInsights />
            
            {/* Show create post form only for admins */}
            {user?.is_admin && (
              <>
                <div className="alert alert-success mb-4">
                  <strong>Admin Access:</strong> You can create new posts!
                </div>
                <CreatePostForm onPostCreated={loadPosts} />
              </>
            )}
            
            {/* Show reader notice for non-admins */}
            {user && !user.is_admin && (
              <div className="alert alert-info mb-4">
                <strong>Reader Access:</strong> You can read posts, like, dislike, and comment!
              </div>
            )}
            
            <div>
              {posts.map(post => (
                <PostCard
                  key={post.id}
                  post={post}
                  onInteract={handleInteract}
                  onComment={loadPosts}
                />
              ))}
            </div>
            
            {posts.length === 0 && (
              <div className="text-center py-5">
                <h3 className="text-muted">No posts yet</h3>
                <p className="text-muted">
                  {user?.is_admin ? "Create the first post!" : "Check back later for new content!"}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Root component
export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const { user } = React.useContext(AuthContext);
  
  return (
    <div className="App">
      {!user ? <TwitterLogin /> : <BlogApp />}
    </div>
  );
}