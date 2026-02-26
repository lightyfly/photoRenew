import { useEffect, useMemo, useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const landingHighlights = [
  { title: '人物五官保持', desc: '重点保护人脸身份特征，避免“AI 换脸感”。' },
  { title: '划痕折痕修复', desc: '去除老照片常见划痕、灰尘、折痕和霉斑。' },
  { title: '自然上色增强', desc: '在保持年代气质的前提下做清晰度与色彩增强。' }
];

const landingSteps = [
  { step: '01', title: '上传老照片', desc: '支持 JPG / PNG / WEBP，自动读取并预览。' },
  { step: '02', title: '选择修复策略', desc: '可使用默认提示词，也可自定义高级指令。' },
  { step: '03', title: 'AI 高清修复', desc: '调用 Nano Banana / Gemini Flash 图像能力生成结果。' },
  { step: '04', title: '下载与对比', desc: '对比修复前后细节，满意后下载保存。' }
];

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return { error: text || '服务端返回了非 JSON 响应。' };
}

function toErrorMessage(payload, fallback) {
  if (!payload) return fallback;
  if (typeof payload === 'string') return payload;
  if (typeof payload.error === 'string') return payload.error;
  if (typeof payload.details === 'string') return payload.details;
  return fallback;
}

export default function App() {
  const [page, setPage] = useState('landing');
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
      .then(async (res) => {
        const data = await parseResponse(res);
        if (!res.ok) {
          throw new Error(toErrorMessage(data, '登录已失效，请重新登录。'));
        }
        return data;
      })
      .then((data) => {
        setUser(data.user);
        setPage('studio');
      })
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
      const data = await parseResponse(response);
      if (!response.ok) {
        throw new Error(toErrorMessage(data, '认证失败'));
      }

      localStorage.setItem('photoRenewToken', data.token);
      setToken(data.token);
      setUser(data.user);
      setPage('studio');
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
    setPage('landing');
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

      const data = await parseResponse(response);
      if (!response.ok) {
        throw new Error(toErrorMessage(data, '修复失败'));
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
      <header className="topbar">
        <div>
          <h1>Photo Renew 老照片修复</h1>
          <p className="subtitle">AI Old Photo Restoration Studio</p>
        </div>
        {!user && page !== 'auth' && (
          <button type="button" onClick={() => setPage('auth')}>
            立即试用
          </button>
        )}
      </header>

      {!user && page === 'landing' && (
        <>
          <section className="hero card">
            <div>
              <span className="badge">Nano Banana 2.5 Flash Powered</span>
              <h2>专业级老照片修复，几秒看到前后对比</h2>
              <p>
                面向家庭回忆修复、影像工作室和档案数字化场景。上传照片后自动去划痕、降噪、增强清晰度，尽量保留人物真实面貌。
              </p>
              <div className="hero-actions">
                <button type="button" onClick={() => setPage('auth')}>
                  免费开始（赠送 5 次）
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setMode('register');
                    setPage('auth');
                  }}
                >
                  创建账号
                </button>
              </div>
            </div>
            <div className="hero-preview">
              <div className="preview-box before">
                <p>Before</p>
              </div>
              <div className="preview-box after">
                <p>After</p>
              </div>
            </div>
          </section>

          <nav className="card nav-links">
            <a href="#features">核心能力</a>
            <a href="#showcase">效果预览</a>
            <a href="#workflow">工作流程</a>
            <a href="#cta">立即体验</a>
          </nav>

          <section id="features" className="card">
            <h3>核心能力</h3>
            <div className="feature-grid">
              {landingHighlights.map((item) => (
                <article key={item.title} className="feature-item">
                  <h4>{item.title}</h4>
                  <p>{item.desc}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="showcase" className="card">
            <h3>效果预览</h3>
            <div className="showcase-grid">
              <div className="showcase-card">
                <h4>人像修复</h4>
                <p>对皮肤纹理、发丝与眼部细节进行自然增强，减少 AI 感。</p>
              </div>
              <div className="showcase-card">
                <h4>黑白上色</h4>
                <p>保持时代氛围的基础上进行色彩还原，减少“过饱和”问题。</p>
              </div>
              <div className="showcase-card">
                <h4>破损补全</h4>
                <p>对边缘缺损、污渍区域进行语义补全，保留主体完整性。</p>
              </div>
            </div>
          </section>

          <section id="workflow" className="card">
            <h3>4 步完成修复</h3>
            <div className="step-grid">
              {landingSteps.map((item) => (
                <article key={item.step} className="step-item">
                  <span>{item.step}</span>
                  <h4>{item.title}</h4>
                  <p>{item.desc}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="cta" className="card cta">
            <h3>现在就开始修复你的珍贵回忆</h3>
            <p>注册即送 5 次免费修复额度，无需信用卡。</p>
            <button type="button" onClick={() => setPage('auth')}>
              进入试用
            </button>
          </section>
        </>
      )}

      {!user && page === 'auth' && (
        <form className="card auth-card" onSubmit={submitAuth}>
          <h2>{mode === 'login' ? '登录账号' : '注册账号'}</h2>
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
          <button type="button" className="secondary" onClick={() => setPage('landing')}>
            返回落地页
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      )}

      {user && (
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
