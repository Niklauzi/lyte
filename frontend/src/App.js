import React, { useState, useEffect } from 'react';
import { MessageCircle, Heart, ThumbsDown, Share2, Upload, X, Expand, Edit2, Trash2, Save, XCircle } from 'lucide-react';
import 'bootstrap/dist/css/bootstrap.min.css';

const API_URL = 'http://localhost:8000';

// Auth context
const AuthContext = React.createContext();

function LoginModal({ isOpen, onClose }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { loginAdmin } = React.useContext(AuthContext);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      await loginAdmin(username, password);
      onClose();
    } catch (error) {
      setError('Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 1050
      }}
      onClick={onClose}
    >
      <div 
        className="bg-white rounded shadow-lg p-4"
        style={{ width: '100%', maxWidth: '400px' }}
        onClick={e => e.stopPropagation()}
      >
        <h4 className="mb-4">Admin Login</h4>
        
        {error && (
          <div className="alert alert-danger">{error}</div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label">Username</label>
            <input
              type="text"
              className="form-control"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
            />
          </div>
          
          <div className="mb-4">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-control"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          
          <div className="d-grid">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  useEffect(() => {
    // Try to get saved token and user
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    } else {
      // Create anonymous user
      createAnonymousUser();
    }
  }, []);

  const createAnonymousUser = async () => {
    try {
      // Generate a unique device ID (in real app, use more robust method)
      let deviceId = localStorage.getItem('deviceId');
      if (!deviceId) {
        deviceId = 'anon_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('deviceId', deviceId);
      }

      const response = await fetch(`${API_URL}/auth/anonymous`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId })
      });

      if (response.ok) {
        const data = await response.json();
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
      }
    } catch (error) {
      console.error('Error creating anonymous user:', error);
    }
  };

  const loginAdmin = async (username, password) => {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      throw new Error('Login failed');
    }

    const data = await response.json();
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    createAnonymousUser(); // Create new anonymous user after logout
  };

  const openLoginModal = () => setIsLoginModalOpen(true);
  const closeLoginModal = () => setIsLoginModalOpen(false);

  return (
    <AuthContext.Provider value={{ user, loginAdmin, logout, token, openLoginModal }}>
      {children}
      <LoginModal isOpen={isLoginModalOpen} onClose={closeLoginModal} />
    </AuthContext.Provider>
  );
}

// Image Modal Component
function ImageModal({ src, alt, isOpen, onClose }) {
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.keyCode === 27) onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        zIndex: 9999,
        backdropFilter: 'blur(10px)'
      }}
      onClick={onClose}
    >
      <button
        className="btn btn-light position-absolute top-0 end-0 m-3 rounded-circle p-2"
        onClick={onClose}
        style={{ zIndex: 10000 }}
      >
        <X size={20} />
      </button>
      <img
        src={src}
        alt={alt}
        className="img-fluid"
        style={{
          maxWidth: '90vw',
          maxHeight: '90vh',
          objectFit: 'contain',
          borderRadius: '8px',
          boxShadow: '0 10px 50px rgba(0, 0, 0, 0.5)'
        }}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// Post Detail Modal Component
function PostDetailModal({ 
  post, 
  isOpen, 
  onClose, 
  onInteract, 
  onComment, 
  onPostUpdate, 
  onPostDelete,
  setPosts,
  setSelectedPost
}) {
  const { user, token } = React.useContext(AuthContext);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editTitle, setEditTitle] = useState(post?.title || '');
  const [editContent, setEditContent] = useState(post?.content || '');
  const [editImages, setEditImages] = useState(post?.images || []);
  const [newImages, setNewImages] = useState([]);

  const loadComments = React.useCallback(async () => {
    if (!post) return;
    try {
      const res = await fetch(`${API_URL}/posts/${post.id}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data);
      }
    } catch (error) {
      console.error('Error loading comments:', error);
      setComments([]);
    }
  }, [post]);

  useEffect(() => {
    if (isOpen && post) {
      loadComments();
      setEditTitle(post.title);
      setEditContent(post.content);
      setEditImages(post.images || []);
      setNewImages([]);
      setIsEditing(false);
    }
  }, [isOpen, post, loadComments]);

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
        const newCommentData = await res.json();
        setComments(prev => [...prev, newCommentData]);
        setNewComment('');
        if (onComment) onComment(); // Update parent component
        // Update the post's comment count in the posts list
        setPosts((prevPosts) => 
          prevPosts.map(p => 
            p.id === post.id 
              ? { ...p, comment_count: (p.comment_count || 0) + 1 }
              : p
          )
        );
      }
    } catch (error) {
      console.error('Error posting comment:', error);
      alert('Failed to post comment. Please try again.');
    }
  };

  const handleInteract = async (action) => {
    if (!token) return;
    await onInteract(post.id, action);
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditTitle(post.title);
    setEditContent(post.content);
    setEditImages(post.images || []);
    setNewImages([]);
  };

  const handleSaveEdit = async () => {
    if (!editTitle.trim() || !editContent.trim()) {
      alert('Title and content are required');
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('title', editTitle);
      formData.append('content', editContent);
      formData.append('existing_images', JSON.stringify(editImages));
      // Add new images
      newImages.forEach(img => formData.append('new_images', img));
      
      const res = await fetch(`${API_URL}/posts/${post.id}`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${token}`,
        },
        body: formData
      });
      
      if (res.ok) {
        const updatedPost = await res.json();
        // Update both the posts list and selected post
        setPosts((prevPosts) => prevPosts.map(p => p.id === updatedPost.id ? updatedPost : p));
        setSelectedPost(updatedPost);
        if (onPostUpdate) onPostUpdate();
        setIsEditing(false);
        alert('Post updated successfully!');
      } else {
        throw new Error('Failed to update post');
      }
    } catch (error) {
      console.error('Error updating post:', error);
      alert('Error updating post. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this post? This action cannot be undone.')) {
      return;
    }

    try {
      const res = await fetch(`${API_URL}/posts/${post.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        onPostDelete();
        onClose();
      } else {
        console.error('Error deleting post');
        alert('Failed to delete post');
      }
    } catch (error) {
      console.error('Error deleting post:', error);
      alert('Failed to delete post');
    }
  };

  const handleImageRemove = (imageToRemove) => {
    setEditImages(editImages.filter(img => img !== imageToRemove));
  };

  const handleNewImageChange = (e) => {
    const fileList = Array.from(e.target.files);
    setNewImages([...newImages, ...fileList]);
  };

  const handleNewImageRemove = (index) => {
    setNewImages(newImages.filter((_, i) => i !== index));
  };

  if (!isOpen || !post) return null;

  return (
    <>
      <div 
        className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          zIndex: 1050,
          backdropFilter: 'blur(5px)'
        }}
        onClick={onClose}
      >
        <div 
          className="bg-white rounded shadow-lg position-relative"
          style={{
            width: '90vw',
            maxWidth: '800px',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="btn btn-light position-absolute top-0 end-0 m-3 rounded-circle p-2"
            onClick={onClose}
            style={{ zIndex: 1051 }}
          >
            <X size={20} />
          </button>

          <div className="p-4">
            {/* Post Header */}
            <div className="d-flex align-items-center justify-content-between mb-4">
              <div className="d-flex align-items-center">
                <div 
                  className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold me-3"
                  style={{
                    width: '50px', 
                    height: '50px', 
                    background: 'linear-gradient(45deg, #8b5cf6, #ec4899)'
                  }}
                >
                  {post.author.username[0].toUpperCase()}
                </div>
                <div>
                  <h6 className="mb-0 fw-semibold">{post.author.username}</h6>
                  <div>
                                      <small className="text-muted">
                                        {new Date(post.created_at).toLocaleString(undefined, { 
                                          dateStyle: 'short',
                                          timeStyle: 'medium'
                                        })}
                                      </small>
                  {post.updated_at && post.updated_at !== post.created_at && (
                    <small className="text-muted"> • (edited {new Date(post.updated_at).toLocaleString(undefined, { 
                      dateStyle: 'short',
                      timeStyle: 'medium'
                    })})</small>
                  )}
                  </div>
                </div>
              </div>
              
              {/* Admin Controls */}
              {user?.is_admin && !isEditing && (
                <div className="d-flex gap-2">
                  <button
                    onClick={handleEdit}
                    className="btn btn-outline-primary btn-sm d-flex align-items-center gap-1"
                  >
                    <Edit2 size={14} />
                    Edit
                  </button>
                  <button
                    onClick={handleDelete}
                    className="btn btn-outline-danger btn-sm d-flex align-items-center gap-1"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              )}

              {/* Edit Controls */}
              {isEditing && (
                <div className="d-flex gap-2">
                  <button
                    onClick={handleSaveEdit}
                    disabled={loading || !editTitle.trim() || !editContent.trim()}
                    className="btn btn-success btn-sm d-flex align-items-center gap-1"
                  >
                    {loading ? (
                      <>
                        <span className="spinner-border spinner-border-sm" role="status"></span>
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save size={14} />
                        Save
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    disabled={loading}
                    className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
                  >
                    <XCircle size={14} />
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Post Content - Edit Mode */}
            {isEditing ? (
              <div className="mb-4">
                <div className="mb-3">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Post title..."
                    className="form-control form-control-lg"
                    disabled={loading}
                  />
                </div>
                <div className="mb-3">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder="Post content..."
                    rows={8}
                    className="form-control"
                    disabled={loading}
                  />
                </div>

                {/* Existing Images */}
                {editImages.length > 0 && (
                  <div className="mb-3">
                    <h6 className="fw-semibold mb-2">Current Images:</h6>
                    <div className="row g-3">
                      {editImages.map((img, idx) => (
                        <div key={idx} className="col-md-4 position-relative">
                          <img
                            src={`${API_URL}${img}`}
                            alt="Post content"
                            className="img-fluid rounded"
                            style={{ height: '120px', objectFit: 'cover', width: '100%' }}
                          />
                          <button
                            type="button"
                            onClick={() => handleImageRemove(img)}
                            className="btn btn-danger btn-sm position-absolute top-0 end-0 m-1 rounded-circle p-1"
                            disabled={loading}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* New Images */}
                {newImages.length > 0 && (
                  <div className="mb-3">
                    <h6 className="fw-semibold mb-2">New Images to Add:</h6>
                    <div className="row g-3">
                      {newImages.map((file, idx) => (
                        <div key={idx} className="col-md-4 position-relative">
                          <img
                            src={URL.createObjectURL(file)}
                            alt="New content"
                            className="img-fluid rounded"
                            style={{ height: '120px', objectFit: 'cover', width: '100%' }}
                          />
                          <button
                            type="button"
                            onClick={() => handleNewImageRemove(idx)}
                            className="btn btn-danger btn-sm position-absolute top-0 end-0 m-1 rounded-circle p-1"
                            disabled={loading}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add Images */}
                <div className="mb-3">
                  <label className="btn btn-outline-secondary d-flex align-items-center gap-2 w-auto">
                    <Upload size={16} />
                    Add More Images
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleNewImageChange}
                      className="d-none"
                      disabled={loading}
                    />
                  </label>
                </div>
              </div>
            ) : (
              <>
                {/* Post Content - View Mode */}
                <h2 className="h3 fw-bold mb-3">{post.title}</h2>
                <p className="text-dark mb-4" style={{lineHeight: '1.6', whiteSpace: 'pre-wrap'}}>
                  {post.content}
                </p>

                {/* Post Images */}
                {post.images && post.images.length > 0 && (
                  <div className="row g-3 mb-4">
                    {post.images.map((img, idx) => (
                      <div key={idx} className="col-md-6">
                        <div 
                          className="position-relative cursor-pointer"
                          onClick={() => setSelectedImage(`${API_URL}${img}`)}
                        >
                          <img
                            src={`${API_URL}${img}`}
                            alt="Post content"
                            className="img-fluid rounded"
                            style={{
                              height: '250px', 
                              objectFit: 'cover', 
                              width: '100%',
                              transition: 'transform 0.2s ease',
                              cursor: 'pointer'
                            }}
                            onMouseEnter={(e) => e.target.style.transform = 'scale(1.02)'}
                            onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                          />
                          <div 
                            className="position-absolute top-50 start-50 translate-middle bg-dark bg-opacity-75 text-white rounded-circle p-2 opacity-0"
                            style={{
                              transition: 'opacity 0.2s ease',
                              pointerEvents: 'none'
                            }}
                          >
                            <Expand size={20} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Interaction Buttons */}
            {!isEditing && (
              <div className="border-top pt-3 mb-4">
                <div className="d-flex align-items-center gap-4">
                  <button
                    onClick={() => handleInteract('like')}
                    className={`btn btn-link p-0 d-flex align-items-center gap-2 ${post.user_liked ? 'text-danger' : 'text-muted'}`}
                    disabled={!user}
                    style={{textDecoration: 'none'}}
                  >
                    <Heart size={20} fill={post.user_liked ? "currentColor" : "none"} />
                    <span>{post.likes || 0}</span>
                  </button>
                  
                  <button
                    onClick={() => handleInteract('dislike')}
                    className={`btn btn-link p-0 d-flex align-items-center gap-2 ${post.user_disliked ? 'text-danger' : 'text-muted'}`}
                    disabled={!user}
                    style={{textDecoration: 'none'}}
                  >
                    <ThumbsDown size={20} fill={post.user_disliked ? "currentColor" : "none"} />
                    <span>{post.dislikes || 0}</span>
                  </button>
                  
                  <button className="btn btn-link p-0 text-success d-flex align-items-center gap-2" style={{textDecoration: 'none'}}>
                    <Share2 size={20} />
                    Share
                  </button>
                </div>
              </div>
            )}

            {/* Comments Section */}
            {!isEditing && (
              <div className="border-top pt-3">
                <h5 className="fw-semibold mb-3">Comments ({comments.length})</h5>
                
                {user && (
                  <form onSubmit={handleComment} className="mb-4">
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
                
                <div className="vstack gap-3" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {comments.map((comment) => (
                    <div key={comment.id} className="d-flex gap-3">
                      <div 
                        className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold"
                        style={{
                          width: '36px', 
                          height: '36px', 
                          background: 'linear-gradient(45deg, #3b82f6, #8b5cf6)',
                          minWidth: '36px'
                        }}
                      >
                        {comment.user.username[0].toUpperCase()}
                      </div>
                      <div className="flex-grow-1">
                        <div className="d-flex align-items-center gap-2 mb-1">
                          <small className="fw-semibold">{comment.user.username}</small>
                          <small className="text-muted">
                            {new Date(comment.created_at).toLocaleString(undefined, { 
                              dateStyle: 'short',
                              timeStyle: 'medium'
                            })}
                          </small>
                        </div>
                        <p className="mb-0">{comment.content}</p>
                      </div>
                    </div>
                  ))}
                  {comments.length === 0 && (
                    <p className="text-muted text-center py-3">No comments yet</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Image Modal */}
      <ImageModal
        src={selectedImage}
        alt="Post image"
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
      />
    </>
  );
}


// Post card component
function PostCard({ post, onInteract, onComment, onPostClick, onPostDelete }) {
  const { user, token } = React.useContext(AuthContext);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Truncate content to 300 characters
  const truncatedContent = post.content.length > 300 
    ? post.content.substring(0, 300) + '...' 
    : post.content;

  const loadComments = async () => {
    try {
      const res = await fetch(`${API_URL}/posts/${post.id}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data);
      }
    } catch (error) {
      console.error('Error loading comments:', error);
      setComments([]);
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
      setNewComment('');
    }
  };

  const handleInteract = async (action) => {
    if (!token) return;
    await onInteract(post.id, action);
  };

  const handlePostClick = (e) => {
    // Don't trigger if clicking on interactive elements
    if (e.target.closest('button, a, img, .no-click')) return;
    onPostClick(post);
  };

  const handleImageClick = (e, img) => {
    e.stopPropagation();
    setSelectedImage(`${API_URL}${img}`);
  };

  return (
    <>
      <div 
        className="card shadow-sm mb-4" 
        style={{ cursor: 'pointer', transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}
        onClick={handlePostClick}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.15)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.12)';
        }}
      >
        <div className="card-body">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <div className="d-flex align-items-center">
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
                <div>
                  <small className="text-muted">
                    {new Date(post.created_at).toLocaleString(undefined, { 
                      dateStyle: 'short',
                      timeStyle: 'medium'
                    })}
                  </small>
                  {post.updated_at && post.updated_at !== post.created_at && (
                    <small className="text-muted"> • (edited)</small>
                  )}
                </div>
              </div>
            </div>
            
            {/* Admin Controls */}
            {user?.is_admin && (
              <div className="d-flex gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPostClick(post);
                  }}
                  className="btn btn-outline-primary btn-sm no-click"
                  title="Edit Post"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (window.confirm('Are you sure you want to delete this post?')) {
                      try {
                        const res = await fetch(`${API_URL}/posts/${post.id}`, {
                          method: 'DELETE',
                          headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (res.ok) {
                          onPostDelete();
                        } else {
                          alert('Failed to delete post');
                        }
                      } catch (error) {
                        alert('Failed to delete post');
                      }
                    }
                  }}
                  className="btn btn-outline-danger btn-sm no-click"
                  title="Delete Post"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
          
          <h2 className="h4 fw-bold mb-3">{post.title}</h2>
          
          <div className="text-dark mb-4" style={{lineHeight: '1.6'}}>
            <p className="mb-2">
              {isExpanded ? post.content : truncatedContent}
            </p>
            {post.content.length > 300 && (
              <button
                className="btn btn-link p-0 text-primary no-click"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
                style={{ textDecoration: 'none', fontSize: '14px' }}
              >
                {isExpanded ? 'Show less' : 'See more'}
              </button>
            )}
          </div>
          
          {post.images && post.images.length > 0 && (
            <div className="row g-3 mb-4">
              {post.images.slice(0, 2).map((img, idx) => (
                <div key={idx} className={`col-md-${post.images.length === 1 ? '12' : '6'}`}>
                  <div className="position-relative">
                    <img
                      src={`${API_URL}${img}`}
                      alt="Post content"
                      className="img-fluid rounded no-click"
                      style={{
                        height: post.images.length === 1 ? '300px' : '200px', 
                        objectFit: 'cover', 
                        width: '100%',
                        cursor: 'pointer',
                        transition: 'transform 0.2s ease'
                      }}
                      onClick={(e) => handleImageClick(e, img)}
                      onMouseEnter={(e) => e.target.style.transform = 'scale(1.02)'}
                      onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                    />
                    <div 
                      className="position-absolute top-50 start-50 translate-middle bg-dark bg-opacity-75 text-white rounded-circle p-2"
                      style={{
                        opacity: 0,
                        transition: 'opacity 0.2s ease',
                        pointerEvents: 'none'
                      }}
                      onMouseEnter={(e) => e.target.style.opacity = '1'}
                    >
                      <Expand size={16} />
                    </div>
                    {post.images.length > 2 && idx === 1 && (
                      <div className="position-absolute top-0 start-0 w-100 h-100 bg-dark bg-opacity-75 d-flex align-items-center justify-content-center text-white rounded">
                        <span className="fs-3 fw-bold">+{post.images.length - 2}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <div className="border-top pt-3">
            <div className="d-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center gap-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleInteract('like');
                  }}
                  className={`btn btn-link p-0 d-flex align-items-center gap-2 no-click ${post.user_liked ? 'text-danger' : 'text-muted'}`}
                  disabled={!user}
                  style={{textDecoration: 'none'}}
                >
                  <Heart size={20} fill={post.user_liked ? "currentColor" : "none"} />
                  <span>{post.likes || 0}</span>
                </button>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleInteract('dislike');
                  }}
                  className={`btn btn-link p-0 d-flex align-items-center gap-2 no-click ${post.user_disliked ? 'text-danger' : 'text-muted'}`}
                  disabled={!user}
                  style={{textDecoration: 'none'}}
                >
                  <ThumbsDown size={20} fill={post.user_disliked ? "currentColor" : "none"} />
                  <span>{post.dislikes || 0}</span>
                </button>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowComments(!showComments);
                    if (!showComments) loadComments();
                  }}
                  className="btn btn-link p-0 text-primary d-flex align-items-center gap-2 no-click"
                  style={{textDecoration: 'none'}}
                >
                  <MessageCircle size={20} />
                  <span>{post.comment_count || 0}</span>
                </button>
                
                <button 
                  className="btn btn-link p-0 text-success d-flex align-items-center gap-2 no-click" 
                  style={{textDecoration: 'none'}}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Share2 size={20} />
                  Share
                </button>
              </div>
              
            </div>
          </div>
          
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
                      className="form-control no-click"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      type="submit"
                      className="btn btn-primary no-click"
                      disabled={!newComment.trim()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Post
                    </button>
                  </div>
                </form>
              )}
              
              <div className="vstack gap-3">
                {comments.slice(0, 3).map((comment) => (
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
                        <small className="text-muted">
                          {new Date(comment.created_at).toLocaleString(undefined, { 
                            dateStyle: 'short',
                            timeStyle: 'medium'
                          })}
                        </small>
                      </div>
                      <p className="mb-0">{comment.content}</p>
                    </div>
                  </div>
                ))}
                {comments.length > 3 && (
                  <button
                    className="btn btn-link text-primary no-click"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPostClick(post);
                    }}
                  >
                    View all {comments.length} comments
                  </button>
                )}
                {comments.length === 0 && (
                  <p className="text-muted text-center">No comments yet</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Image Modal */}
      <ImageModal
        src={selectedImage}
        alt="Post image"
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
      />
    </>
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

// Main app
function BlogApp() {
  const { user, logout, token, openLoginModal } = React.useContext(AuthContext);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState(null);

  console.log('Current user:', user);

  const loadPosts = async () => {
    try {
      const res = await fetch(`${API_URL}/posts`);
      if (res.ok) {
        const data = await res.json();
        setPosts(data);
      } else {
        console.error('Error loading posts:', res.status);
        setPosts([
          {
            id: 1,
            title: "Welcome to the Blog Platform!",
            content: "This is a demo post to show how the platform works. You can like, comment, and share posts. This is a longer content that demonstrates the truncation feature. When content is longer than 300 characters, it gets truncated and shows a 'See more' button. Users can click to expand the full content, similar to how Twitter handles long posts. This provides a clean interface while still allowing access to full content when needed.",
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
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInteract = async (postId, action) => {
    try {
      // Optimistically update UI state
      setPosts((prevPosts) => 
        prevPosts.map(p => {
          if (p.id === postId) {
            const wasLiked = p.user_liked;
            const wasDisliked = p.user_disliked;
            return {
              ...p,
              user_liked: action === 'like' ? !wasLiked : false,
              user_disliked: action === 'dislike' ? !wasDisliked : false,
              likes: action === 'like' ? p.likes + (wasLiked ? -1 : 1) : p.likes - (wasLiked ? 1 : 0),
              dislikes: action === 'dislike' ? p.dislikes + (wasDisliked ? -1 : 1) : p.dislikes - (wasDisliked ? 1 : 0)
            };
          }
          return p;
        })
      );

      if (selectedPost?.id === postId) {
        setSelectedPost(prev => ({
          ...prev,
          user_liked: action === 'like' ? !prev.user_liked : false,
          user_disliked: action === 'dislike' ? !prev.user_disliked : false,
          likes: action === 'like' ? prev.likes + (prev.user_liked ? -1 : 1) : prev.likes - (prev.user_liked ? 1 : 0),
          dislikes: action === 'dislike' ? prev.dislikes + (prev.user_disliked ? -1 : 1) : prev.dislikes - (prev.user_disliked ? 1 : 0)
        }));
      }

      // Send request to server
      const res = await fetch(`${API_URL}/posts/${postId}/${action}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!res.ok) {
        // If request fails, revert the optimistic update
        await loadPosts();
        if (selectedPost?.id === postId) {
          const freshData = await fetch(`${API_URL}/posts/${postId}`).then(r => r.json());
          setSelectedPost(freshData);
        }
      }
    } catch (error) {
      console.error('Error with interaction:', error);
      // On error, reload posts to ensure correct state
      await loadPosts();
    }
  };

  const handlePostClick = (post) => {
    setSelectedPost(post);
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
    <>
      <div className="min-vh-100 bg-light">
        <nav className="navbar navbar-expand-lg navbar-light bg-white shadow-sm">
          <div className="container">
            <span className="navbar-brand h2 fw-bold mb-0">Blog Platform</span>
            <div className="d-flex align-items-center gap-3">
              {user?.is_admin ? (
                <>
                  <span className="text-muted">
                    Welcome, {user.username}
                    <span className="badge bg-success ms-2">Admin</span>
                  </span>
                  <button
                    onClick={logout}
                    className="btn btn-outline-danger btn-sm"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <button
                  onClick={openLoginModal}
                  className="btn btn-outline-primary btn-sm"
                >
                  Admin Login
                </button>
              )}
            </div>
          </div>
        </nav>
        
        <div className="container py-4">
          <div className="row justify-content-center">
            <div className="col-lg-8">
              {user?.is_admin && (
                <>
                  <div className="alert alert-success mb-4">
                    <strong>Admin Access:</strong> You can create new posts!
                  </div>
                  <CreatePostForm onPostCreated={loadPosts} />
                </>
              )}
              
              {user && !user.is_admin && (
                <div className="alert alert-info mb-4">
                  <strong>Reader Access:</strong> You can read posts, like, dislike, and comment! Click on any post to view full details.
                </div>
              )}
              
              <div>
                {posts.map(post => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onInteract={handleInteract}
                    onComment={loadPosts}
                    onPostClick={handlePostClick}
                    onPostUpdate={loadPosts}
                    onPostDelete={loadPosts}
                    isAdmin={user?.is_admin}
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

      {/* Post Detail Modal */}
      <PostDetailModal
        post={selectedPost}
        isOpen={!!selectedPost}
        onClose={() => setSelectedPost(null)}
        onInteract={handleInteract}
        onComment={loadPosts}
        onPostUpdate={loadPosts}
        onPostDelete={loadPosts}
        setPosts={setPosts}
        setSelectedPost={setSelectedPost}
      />
    </>
  );
}

// Root component
export default function App() {
  return (
    <AuthProvider>
      <div className="App">
        <BlogApp />
      </div>
    </AuthProvider>
  );
}