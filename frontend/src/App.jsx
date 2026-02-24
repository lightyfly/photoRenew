import { useEffect, useMemo, useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export default function App() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(localStorage.getItem('photoRenewToken') || '');
  const [user, setUser] = useState(null);

  const [file, setFile] = useState(null);
  const [prompt, setPrompt] = useState('请修复这张老照片，去除划痕和噪点，保持人物五官不变，自然增强清晰度和色彩。');
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState('');
  const [resultUrl, setResultUrl] = useState('');

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('登录已失效，请重新登录。'))))
      .then((data) => setUser(data.user))
      .catch(() => {
        localStorage.removeItem('photoRenewToken');
        setToken('');
        setUser(null);
      });
  }, [token]);

  const submitAuth = async (event) => {
    event.preventDefault();
    setError('');
    setAuthLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '认证失败');
      }

      localStorage.setItem('photoRenewToken', data.token);
      setToken(data.token);
      setUser(data.user);
    } catch (authError) {
      setError(authError.message || '认证失败');
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('photoRenewToken');
    setToken('');
    setUser(null);
    setResultUrl('');
    setError('');
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!file) {
      setError('请先上传一张老照片。');
      return;
    }

    if (!token) {
      setError('请先登录。');
      return;
    }

    setLoading(true);
    setError('');
    setResultUrl('');

    const formData = new FormData();
    formData.append('image', file);
    formData.append('prompt', prompt);

    try {
      const response = await fetch(`${API_BASE_URL}/api/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '修复失败');
      }

      setResultUrl(`data:${data.mimeType};base64,${data.imageBase64}`);
      setUser((currentUser) =>
        currentUser
          ? {
              ...currentUser,
              remainingCredits: data.remainingCredits
            }
          : currentUser
      );
    } catch (requestError) {
      setError(requestError.message || '请求失败，请稍后再试。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="container">
      <h1>Photo Renew 老照片修复</h1>
      <p className="subtitle">前后端分离 + Google Nano Banana / Gemini 2.5 Flash API</p>

      {!user ? (
        <form className="card" onSubmit={submitAuth}>
          <h2>{mode === 'login' ? '登录' : '注册'}</h2>
          <label className="label">邮箱</label>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />

          <label className="label">密码</label>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={6}
            required
          />

          <button type="submit" disabled={authLoading}>
            {authLoading ? '提交中...' : mode === 'login' ? '登录' : '注册并领取5次修复'}
          </button>
          <button type="button" className="secondary" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? '没有账号？去注册' : '已有账号？去登录'}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      ) : (
        <>
          <div className="card userbar">
            <p>
              当前用户：<b>{user.email}</b> ｜ 剩余修复次数：<b>{user.remainingCredits}</b>
            </p>
            <button type="button" className="secondary" onClick={logout}>
              退出登录
            </button>
          </div>

          <form className="card" onSubmit={onSubmit}>
            <label className="label">上传老照片（JPG/PNG）</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />

            <label className="label">修复提示词（可修改）</label>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={4} />

            <button type="submit" disabled={loading || user.remainingCredits <= 0}>
              {loading ? '修复中...' : '开始修复'}
            </button>

            {error && <p className="error">{error}</p>}
          </form>

          <section className="grid">
            <div className="card">
              <h2>原图</h2>
              {previewUrl ? <img src={previewUrl} alt="上传的老照片" /> : <p>等待上传</p>}
            </div>
            <div className="card">
              <h2>修复后</h2>
              {resultUrl ? <img src={resultUrl} alt="修复结果" /> : <p>修复完成后会显示在这里</p>}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
