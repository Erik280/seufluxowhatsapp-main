import React, { useState, useEffect } from 'react';
import './LoginPage.css';

// --- Sub-components ---

function ParticleCanvas() {
  useEffect(() => {
    const canvas = document.getElementById('particle-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    interface Dot { x: number; y: number; vx: number; vy: number; r: number; alpha: number }
    const dots: Dot[] = Array.from({ length: 80 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 1.6 + 0.4,
      alpha: Math.random() * 0.5 + 0.15,
    }));

    const CONN_DIST = 130;
    const GREEN  = '0,255,136';
    const CYAN   = '0,229,204';

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        d.x += d.vx; d.y += d.vy;
        if (d.x < 0 || d.x > canvas.width)  d.vx *= -1;
        if (d.y < 0 || d.y > canvas.height) d.vy *= -1;

        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${i % 2 === 0 ? GREEN : CYAN},${d.alpha})`;
        ctx.fill();

        for (let j = i + 1; j < dots.length; j++) {
          const b = dots[j];
          const dist = Math.hypot(d.x - b.x, d.y - b.y);
          if (dist < CONN_DIST) {
            const opacity = (1 - dist / CONN_DIST) * 0.18;
            ctx.beginPath();
            ctx.moveTo(d.x, d.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(${GREEN},${opacity})`;
            ctx.lineWidth = 0.7;
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas id="particle-canvas" className="particle-canvas" aria-hidden="true" />;
}

// --- Main Login Page ---

export default function LoginPage() {
  const [email, setEmail]     = useState('eriklima.@gmail.com');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]  = useState(false);
  const [shake, setShake]      = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setShake(true);
      setTimeout(() => setShake(false), 600);
      return;
    }
    setLoading(true);
    // TODO: integrate real auth endpoint
    setTimeout(() => setLoading(false), 2000);
  };

  return (
    <div className="login-root">
      <ParticleCanvas />

      {/* Ambient blobs */}
      <div className="blob blob--green" aria-hidden="true" />
      <div className="blob blob--cyan"  aria-hidden="true" />

      <main className={`login-card ${shake ? 'shake' : ''}`} role="main">
        {/* Logo / Brand */}
        <header className="login-header">
          <div className="logo-ring" aria-hidden="true">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <path d="M20 3C10.6 3 3 10.6 3 20s7.6 17 17 17 17-7.6 17-17S29.4 3 20 3z" stroke="url(#gG)" strokeWidth="1.8" fill="none"/>
              <path d="M14 20c0-3.3 2.7-6 6-6s6 2.7 6 6c0 2.3-1.3 4.3-3.2 5.4L24 29h-8l1.2-3.6C15.3 24.3 14 22.3 14 20z" fill="url(#gG2)"/>
              <defs>
                <linearGradient id="gG" x1="3" y1="3" x2="37" y2="37" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#00FF88"/>
                  <stop offset="100%" stopColor="#00E5CC"/>
                </linearGradient>
                <linearGradient id="gG2" x1="14" y1="14" x2="26" y2="30" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#00FF88"/>
                  <stop offset="100%" stopColor="#00E5CC"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className="login-title">
            Seu<span className="brand-accent">Fluxo</span>
          </h1>
          <p className="login-subtitle">WhatsApp Automation Platform</p>
        </header>

        {/* Form */}
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="field-group">
            <label className="field-label" htmlFor="email">E-mail</label>
            <div className="input-wrapper">
              <span className="input-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              </span>
              <input
                id="email"
                type="email"
                className="login-input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                autoComplete="email"
                required
              />
            </div>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="password">Senha</label>
            <div className="input-wrapper">
              <span className="input-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </span>
              <input
                id="password"
                type={showPass ? 'text' : 'password'}
                className="login-input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="toggle-pass"
                onClick={() => setShowPass(p => !p)}
                aria-label={showPass ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPass ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="forgot-row">
            <a href="#" className="forgot-link">Esqueci minha senha</a>
          </div>

          <button
            id="btn-entrar"
            type="submit"
            className={`btn-login ${loading ? 'loading' : ''}`}
            disabled={loading}
          >
            {loading ? (
              <span className="spinner" aria-label="Carregando…" />
            ) : (
              <>
                <span>Entrar</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                  <polyline points="12 5 19 12 12 19"/>
                </svg>
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <footer className="login-footer">
          <p>Powered by <span className="brand-accent">Transforma Futuro</span></p>
        </footer>
      </main>
    </div>
  );
}
