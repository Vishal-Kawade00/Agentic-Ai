import { useState, useRef, useEffect } from 'react'
import axios from 'axios'

// ── Markdown renderer (uses marked via CDN – loaded in index.html) ──────────
// We inline a tiny renderer to avoid adding a build dep.
// Supports: headings, bold, italic, inline code, code blocks, lists, blockquotes, links
function renderMarkdown(md) {
  if (!md) return ''
  let html = md
    // Fenced code blocks
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
      `<pre class="code-block"><code class="lang-${lang}">${escapeHtml(code.trim())}</code></pre>`
    )
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    // Headings
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2>$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1>$1</h1>')
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,         '<em>$1</em>')
    // Blockquote
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // Unordered list items
    .replace(/^[-*•] (.+)$/gm, '<li>$1</li>')
    // Ordered list items
    .replace(/^\d+\. (.+)$/gm, '<li class="ordered">$1</li>')
    // Wrap consecutive <li> in <ul>/<ol> (simple heuristic)
    .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr/>')
    // Paragraphs (double newline)
    .replace(/\n\n+/g, '</p><p>')
    // Single newlines
    .replace(/\n/g, '<br/>')

  return `<p>${html}</p>`
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// ── Copy-to-clipboard hook ──────────────────────────────────────────────────
function useCopy() {
  const [copied, setCopied] = useState(false)
  const copy = (text) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return [copied, copy]
}

// ── Stat pill ────────────────────────────────────────────────────────────────
function Pill({ label, value, color }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      background: 'rgba(255,255,255,0.05)', border: `1px solid ${color}33`,
      borderRadius: 10, padding: '10px 18px', minWidth: 80
    }}>
      <span style={{ fontSize: 20, fontWeight: 700, color }}>{value}</span>
      <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{label}</span>
    </div>
  )
}

// ── Individual chat bubble ────────────────────────────────────────────────────
function ChatBubble({ msg, index }) {
  const [copied, copy] = useCopy()
  const isUser   = msg.role === 'user'
  const isSystem = msg.role === 'system'
  const isAI     = msg.role === 'ai'

  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 20,
      animation: `fadeSlide 0.3s ease forwards`,
      animationDelay: `${index * 0.04}s`,
      opacity: 0,
    }}>
      {/* Avatar for AI / system */}
      {!isUser && (
        <div style={{
          width: 34, height: 34, borderRadius: '50%',
          background: isAI ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#334155',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, marginRight: 10, flexShrink: 0, marginTop: 4,
          boxShadow: isAI ? '0 0 12px #6366f155' : 'none'
        }}>
          {isAI ? '✦' : 'ℹ'}
        </div>
      )}

      <div style={{ maxWidth: '78%' }}>
        {/* Role label */}
        <div style={{
          fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
          color: isUser ? '#94a3b8' : isAI ? '#818cf8' : '#64748b',
          marginBottom: 5, textAlign: isUser ? 'right' : 'left',
          textTransform: 'uppercase'
        }}>
          {isUser ? 'You' : isAI ? 'Assistant' : 'System'}
        </div>

        {/* Bubble */}
        <div style={{
          padding: '14px 18px',
          borderRadius: isUser ? '18px 4px 18px 18px' : '4px 18px 18px 18px',
          background: isUser
            ? 'linear-gradient(135deg, #4f46e5, #7c3aed)'
            : isSystem ? 'rgba(51,65,85,0.6)' : 'rgba(30,41,59,0.9)',
          color: '#e2e8f0',
          border: isAI ? '1px solid rgba(99,102,241,0.25)' : 'none',
          boxShadow: isAI ? '0 4px 24px rgba(0,0,0,0.2)' : 'none',
          fontSize: 14.5, lineHeight: '1.65',
        }}>
          {isAI ? (
            <div
              className="md-content"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
            />
          ) : (
            <span>{msg.content}</span>
          )}

          {/* Citations */}
          {msg.citations?.length > 0 && (
            <div style={{
              marginTop: 12, paddingTop: 12,
              borderTop: '1px solid rgba(255,255,255,0.1)',
              display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center'
            }}>
              <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>SOURCES</span>
              {msg.citations.map((c, i) => (
                <span key={i} style={{
                  background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)',
                  borderRadius: 6, padding: '2px 9px', fontSize: 12, color: '#a5b4fc',
                  fontWeight: 600
                }}>
                  pg {c.page}
                </span>
              ))}
            </div>
          )}

          {/* Search type badge */}
          {msg.searchType && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{
                fontSize: 11, background: 'rgba(6,182,212,0.15)',
                border: '1px solid rgba(6,182,212,0.3)',
                color: '#22d3ee', borderRadius: 20, padding: '2px 10px', fontWeight: 600
              }}>
                ⚡ {msg.searchType}
              </span>
            </div>
          )}
        </div>

        {/* Copy button for AI messages */}
        {isAI && (
          <button onClick={() => copy(msg.content)} style={{
            marginTop: 6, background: 'none', border: 'none', cursor: 'pointer',
            color: copied ? '#34d399' : '#64748b', fontSize: 11, padding: '2px 0',
            display: 'flex', alignItems: 'center', gap: 4, transition: 'color 0.2s'
          }}>
            {copied ? '✓ Copied' : '⎘ Copy response'}
          </button>
        )}
      </div>

      {/* User avatar */}
      {isUser && (
        <div style={{
          width: 34, height: 34, borderRadius: '50%',
          background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, marginLeft: 10, flexShrink: 0, marginTop: 4,
        }}>
          👤
        </div>
      )}
    </div>
  )
}

// ── Typing indicator ─────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 20 }}>
      <div style={{
        width: 34, height: 34, borderRadius: '50%',
        background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, marginRight: 10, flexShrink: 0,
        boxShadow: '0 0 12px #6366f155'
      }}>✦</div>
      <div style={{
        padding: '14px 20px', borderRadius: '4px 18px 18px 18px',
        background: 'rgba(30,41,59,0.9)', border: '1px solid rgba(99,102,241,0.25)',
        display: 'flex', alignItems: 'center', gap: 6
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 7, height: 7, borderRadius: '50%',
            background: '#818cf8', animation: `bounce 1.2s infinite`,
            animationDelay: `${i * 0.2}s`
          }} />
        ))}
      </div>
    </div>
  )
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [file, setFile]           = useState(null)
  const [pdfUrl, setPdfUrl]       = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isReady, setIsReady]     = useState(false)
  const [query, setQuery]         = useState('')
  const [messages, setMessages]   = useState([])
  const [isTyping, setIsTyping]   = useState(false)
  const [docName, setDocName]     = useState('')
  const [msgCount, setMsgCount]   = useState(0)
  const [sourceCount, setSourceCount] = useState(0)
  const chatEndRef = useRef(null)
  const inputRef   = useRef(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const handleFileChange = (e) => {
    const f = e.target.files[0]
    if (f?.type === 'application/pdf') {
      setFile(f)
      setPdfUrl(URL.createObjectURL(f))
      setDocName(f.name)
      setIsReady(false)
      setMessages([])
    } else {
      alert('Please select a valid PDF file.')
    }
  }

  const handleUpload = async () => {
    if (!file) return
    setIsUploading(true)
    const formData = new FormData()
    formData.append('pdf', file)
    try {
      await axios.post('http://localhost:5000/api/upload', formData)
      setIsReady(true)
      setMessages([{
        role: 'system',
        content: `✅ **${docName}** indexed with Hybrid Search (BM25 + Vector). Ready to answer your questions.`,
        citations: []
      }])
    } catch {
      alert('❌ Failed to process PDF.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleAsk = async () => {
    if (!query.trim() || !isReady || isTyping) return
    const userMsg = query.trim()
    setQuery('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg, citations: [] }])
    setIsTyping(true)
    try {
      const { data } = await axios.post('http://localhost:5000/api/ask', { query: userMsg })
      setMessages(prev => [...prev, {
        role: 'ai',
        content: data.answer,
        citations: data.citations,
        searchType: data.search_type
      }])
      setMsgCount(c => c + 1)
      setSourceCount(c => c + (data.citations?.length || 0))
    } catch {
      setMessages(prev => [...prev, { role: 'system', content: '❌ Error connecting to AI Engine.', citations: [] }])
    } finally {
      setIsTyping(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  const clearChat = () => {
    setMessages([{
      role: 'system',
      content: `🗑️ Chat cleared. **${docName}** is still loaded — ask away!`,
      citations: []
    }])
    setMsgCount(0)
    setSourceCount(0)
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          font-family: 'DM Sans', sans-serif;
          background: #0d1117;
          color: #e2e8f0;
          height: 100vh;
          overflow: hidden;
        }

        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes bounce {
          0%,80%,100% { transform: translateY(0); }
          40%          { transform: translateY(-6px); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulse-ring {
          0%   { box-shadow: 0 0 0 0 rgba(99,102,241,0.4); }
          70%  { box-shadow: 0 0 0 8px rgba(99,102,241,0); }
          100% { box-shadow: 0 0 0 0 rgba(99,102,241,0); }
        }

        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.3); border-radius: 3px; }

        /* Markdown content styles */
        .md-content h1 { font-size: 1.35em; font-weight: 700; margin: 14px 0 8px; color: #c7d2fe; }
        .md-content h2 { font-size: 1.15em; font-weight: 600; margin: 12px 0 6px; color: #c7d2fe; }
        .md-content h3 { font-size: 1em;    font-weight: 600; margin: 10px 0 5px; color: #a5b4fc; }
        .md-content p  { margin: 6px 0; }
        .md-content strong { color: #f1f5f9; font-weight: 600; }
        .md-content em     { color: #cbd5e1; font-style: italic; }
        .md-content ul     { margin: 8px 0 8px 20px; }
        .md-content li     { margin: 4px 0; line-height: 1.6; }
        .md-content blockquote {
          border-left: 3px solid #6366f1;
          padding: 4px 12px;
          margin: 10px 0;
          background: rgba(99,102,241,0.08);
          border-radius: 0 6px 6px 0;
          color: #94a3b8;
        }
        .md-content hr { border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 12px 0; }
        .md-content a  { color: #818cf8; text-decoration: underline; }

        .code-block {
          background: rgba(0,0,0,0.4);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          padding: 12px 14px;
          margin: 10px 0;
          overflow-x: auto;
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          line-height: 1.55;
          color: #a5f3fc;
        }
        .inline-code {
          font-family: 'JetBrains Mono', monospace;
          background: rgba(0,0,0,0.35);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 4px;
          padding: 1px 6px;
          font-size: 0.88em;
          color: #f9a8d4;
        }

        .upload-btn {
          position: relative;
          overflow: hidden;
          padding: 10px 20px;
          background: linear-gradient(135deg,#4f46e5,#7c3aed);
          color: white;
          border: none;
          border-radius: 10px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: opacity 0.2s, transform 0.15s;
          white-space: nowrap;
          font-family: 'DM Sans', sans-serif;
        }
        .upload-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; }
        .upload-btn:not(:disabled):hover { opacity: 0.9; transform: translateY(-1px); }

        .send-btn {
          padding: 0 24px;
          background: linear-gradient(135deg,#059669,#0d9488);
          color: white;
          border: none;
          border-radius: 12px;
          font-weight: 700;
          font-size: 15px;
          cursor: pointer;
          transition: opacity 0.2s, transform 0.15s;
          flex-shrink: 0;
          height: 50px;
          font-family: 'DM Sans', sans-serif;
        }
        .send-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none !important; }
        .send-btn:not(:disabled):hover { opacity: 0.9; transform: translateY(-1px); }

        .clear-btn {
          padding: 7px 14px;
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.25);
          color: #fca5a5;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
          font-family: 'DM Sans', sans-serif;
        }
        .clear-btn:hover { background: rgba(239,68,68,0.2); }

        .chat-input {
          flex: 1;
          padding: 14px 18px;
          background: rgba(30,41,59,0.8);
          border: 1.5px solid rgba(99,102,241,0.25);
          border-radius: 12px;
          color: #e2e8f0;
          font-size: 15px;
          font-family: 'DM Sans', sans-serif;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
          height: 50px;
        }
        .chat-input:focus {
          border-color: rgba(99,102,241,0.6);
          box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
        }
        .chat-input::placeholder { color: #475569; }
        .chat-input:disabled { opacity: 0.5; cursor: not-allowed; }

        .file-label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: rgba(30,41,59,0.8);
          border: 1.5px dashed rgba(99,102,241,0.35);
          border-radius: 10px;
          cursor: pointer;
          font-size: 13.5px;
          color: #94a3b8;
          transition: border-color 0.2s, background 0.2s;
          white-space: nowrap;
          overflow: hidden;
          max-width: 220px;
          text-overflow: ellipsis;
        }
        .file-label:hover {
          border-color: rgba(99,102,241,0.6);
          background: rgba(99,102,241,0.06);
          color: #a5b4fc;
        }

        .panel {
          display: flex;
          flex-direction: column;
          background: #0f172a;
          border-right: 1px solid rgba(255,255,255,0.06);
        }

        .panel-header {
          padding: 20px 24px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          display: flex;
          align-items: center;
          gap: 10px;
          background: rgba(15,23,42,0.95);
          backdrop-filter: blur(10px);
        }

        .ready-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: #34d399;
          animation: pulse-ring 2s infinite;
        }
      `}</style>

      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

        {/* ── LEFT: PDF VIEWER ── */}
        <div className="panel" style={{ width: '44%', minWidth: 360 }}>

          {/* Header */}
          <div className="panel-header">
            <span style={{ fontSize: 20 }}>📄</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#f1f5f9' }}>Document Viewer</div>
              {docName && <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{docName}</div>}
            </div>
            {isReady && <div className="ready-dot" style={{ marginLeft: 'auto' }} title="Indexed & ready" />}
          </div>

          {/* Controls */}
          <div style={{ padding: '16px 20px', display: 'flex', gap: 10, alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <label className="file-label">
              <span>📂</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {file ? file.name : 'Choose PDF…'}
              </span>
              <input type="file" accept="application/pdf" onChange={handleFileChange} style={{ display: 'none' }} />
            </label>

            <button className="upload-btn" onClick={handleUpload} disabled={!file || isUploading}>
              {isUploading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 13, height: 13, border: '2px solid rgba(255,255,255,0.4)',
                    borderTopColor: 'white', borderRadius: '50%',
                    display: 'inline-block', animation: 'spin 0.7s linear infinite'
                  }} />
                  Processing…
                </span>
              ) : '⚡ Index PDF'}
            </button>
          </div>

          {/* PDF iframe */}
          <div style={{ flex: 1, padding: 16, overflow: 'hidden' }}>
            {pdfUrl ? (
              <iframe
                src={pdfUrl}
                width="100%"
                height="100%"
                style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}
              />
            ) : (
              <div style={{
                height: '100%', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                border: '2px dashed rgba(99,102,241,0.2)', borderRadius: 12,
                color: '#475569'
              }}>
                <div style={{ fontSize: 48, marginBottom: 14, opacity: 0.5 }}>📑</div>
                <div style={{ fontWeight: 600, fontSize: 15, color: '#64748b' }}>No document loaded</div>
                <div style={{ fontSize: 13, marginTop: 5 }}>Select a PDF above to get started</div>
              </div>
            )}
          </div>

        </div>

        {/* ── RIGHT: CHAT ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0a0f1e' }}>

          {/* Chat header */}
          <div className="panel-header" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, boxShadow: '0 0 14px #6366f144'
              }}>✦</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Hybrid RAG Assistant</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>BM25 + Vector Search · Powered by Claude</div>
              </div>
            </div>

            {/* Stats + clear */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {isReady && (
                <>
                  <Pill label="Messages" value={msgCount}    color="#818cf8" />
                  <Pill label="Sources"  value={sourceCount} color="#34d399" />
                  <button className="clear-btn" onClick={clearChat}>🗑 Clear</button>
                </>
              )}
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
            {messages.length === 0 ? (
              <div style={{
                height: '100%', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', color: '#334155'
              }}>
                <div style={{ fontSize: 52, marginBottom: 14 }}>💬</div>
                <div style={{ fontWeight: 600, fontSize: 16, color: '#475569' }}>
                  Your conversation will appear here
                </div>
                <div style={{ fontSize: 13, marginTop: 6 }}>
                  Index a PDF on the left, then ask anything about it
                </div>
                <div style={{
                  display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap', justifyContent: 'center'
                }}>
                  {['Summarize the document', 'List key findings', 'What are the conclusions?'].map(s => (
                    <button key={s} onClick={() => { if (isReady) setQuery(s) }} style={{
                      background: 'rgba(99,102,241,0.08)',
                      border: '1px solid rgba(99,102,241,0.2)',
                      borderRadius: 20, padding: '7px 14px', color: '#818cf8',
                      fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                      transition: 'background 0.2s'
                    }}>{s}</button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => <ChatBubble key={i} msg={msg} index={i} />)
            )}
            {isTyping && <TypingIndicator />}
            <div ref={chatEndRef} />
          </div>

          {/* Input bar */}
          <div style={{
            padding: '16px 24px 20px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(10,15,30,0.95)',
            backdropFilter: 'blur(10px)'
          }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                ref={inputRef}
                className="chat-input"
                placeholder={isReady ? 'Ask something about the document…' : 'Index a PDF first to start chatting…'}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAsk()}
                disabled={!isReady || isTyping}
              />
              <button className="send-btn" onClick={handleAsk} disabled={!isReady || isTyping || !query.trim()}>
                {isTyping ? '…' : '↑ Send'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#334155', marginTop: 8, textAlign: 'center' }}>
              Press <kbd style={{
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 4, padding: '1px 5px', fontFamily: 'JetBrains Mono, monospace',
                fontSize: 11, color: '#64748b'
              }}>Enter</kbd> to send &nbsp;·&nbsp; Responses are generated from your document only
            </div>
          </div>

        </div>
      </div>
    </>
  )
}