import { useState, useRef, useEffect, useCallback } from 'react'

// ── Inline markdown renderer ───────────────────────────────────────────────────
function renderMd(md = '') {
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  let h = md
    .replace(/```(\w*)\n?([\s\S]*?)```/g,(_,l,c)=>`<pre class="mc-pre"><code class="mc-code">${esc(c.trim())}</code></pre>`)
    .replace(/`([^`]+)`/g,'<code class="mc-ic">$1</code>')
    .replace(/^### (.+)$/gm,'<h3 class="mc-h3">$1</h3>')
    .replace(/^## (.+)$/gm,'<h2 class="mc-h2">$1</h2>')
    .replace(/^# (.+)$/gm,'<h1 class="mc-h1">$1</h1>')
    .replace(/\*\*\*(.+?)\*\*\*/g,'<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/^> (.+)$/gm,'<blockquote class="mc-bq">$1</blockquote>')
    .replace(/^[-•] (.+)$/gm,'<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)/g,'<ul class="mc-ul">$1</ul>')
    .replace(/^---$/gm,'<hr class="mc-hr"/>')
    .replace(/\n\n+/g,'</p><p class="mc-p">')
    .replace(/\n/g,'<br/>')
  return `<p class="mc-p">${h}</p>`
}

// ── Citation card (expandable) ─────────────────────────────────────────────────
function CitationCard({ cite, index }) {
  const [open, setOpen] = useState(false)
  return (
    <button onClick={()=>setOpen(o=>!o)} className={`cite-card${open?' cite-open':''}`} title="Click to see source snippet">
      <span className="cite-num">{index+1}</span>
      {/* Handles the new "multi" page boundary gracefully */}
      <span className="cite-pg">{cite.page === 'multi' ? 'Section' : `pg ${cite.page}`}</span>
      {open && cite.text && <span className="cite-snippet">"{cite.text}"</span>}
    </button>
  )
}

// ── Search type badge ──────────────────────────────────────────────────────────
function SearchBadge({ type }) {
  if (!type) return null
  const t = type.toUpperCase()
  // Aligned with the new backend routing logic
  const label = t.includes('AGENTIC') ? '🗺 Agentic Summary' : t.includes('CLARIFY') ? '💬 Clarify' : '⚡ Semantic Search'
  return <span className="search-badge">{label}</span>
}

// ── Streaming cursor ───────────────────────────────────────────────────────────
function Cursor() { return <span className="stream-cursor" aria-hidden>▋</span> }

// ── Chat bubble ────────────────────────────────────────────────────────────────
function Bubble({ msg, streaming }) {
  const user = msg.role === 'user'
  return (
    <div className={`brow ${user?'brow-u':'brow-a'}`}>
      {!user && <div className="av av-a">✦</div>}
      <div className={`bubble ${user?'bubble-u':'bubble-a'}`}>
        {user
          ? <p className="plain">{msg.content}</p>
          : <div className="md-body" dangerouslySetInnerHTML={{__html:renderMd(msg.content)}}/>
        }
        {streaming && <Cursor/>}
        {!streaming && msg.searchType && (
          <div className="meta-row"><SearchBadge type={msg.searchType}/></div>
        )}
        {!streaming && msg.citations?.length > 0 && (
          <div className="cites-area">
            <span className="cites-label">Sources</span>
            <div className="cites-list">
              {msg.citations.map((c,i)=><CitationCard key={i} cite={c} index={i}/>)}
            </div>
          </div>
        )}
      </div>
      {user && <div className="av av-u">U</div>}
    </div>
  )
}

// ── Typing indicator ───────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="brow brow-a">
      <div className="av av-a">✦</div>
      <div className="bubble bubble-a typing-bubble">
        <span className="dot"/><span className="dot"/><span className="dot"/>
      </div>
    </div>
  )
}

// ── Upload / document panel ────────────────────────────────────────────────────
function UploadPanel({ onReady }) {
  const [file, setFile]     = useState(null)
  const [status, setStatus] = useState('idle')
  const [progress, setProgress] = useState('')
  const [docMeta, setDocMeta]   = useState(null)
  const [pdfUrl, setPdfUrl]     = useState(null)
  const pollRef = useRef(null)

  // Aligned with the new ultra-fast backend states
  const LABELS = { queued:'Queued…', processing:'Indexing Document…', completed:'Ready!', failed:'Failed' }

  const stopPoll = () => { if(pollRef.current){ clearInterval(pollRef.current); pollRef.current=null } }

  const pollStatus = useCallback(async id => {
    try {
      const r = await fetch(`http://localhost:5000/api/status/${id}`)
      if(!r.ok) return
      const d = await r.json()
      setProgress(LABELS[d.status]??d.status)
      if(d.status==='completed'){ stopPoll(); setStatus('ready'); setDocMeta(d.metadata); onReady(true) }
      else if(d.status==='failed'){ stopPoll(); setStatus('error'); setProgress(d.error??'Unknown error') }
    } catch{}
  },[onReady])

  const handleFile = f => {
    if(!f||f.type!=='application/pdf') return
    setFile(f); setPdfUrl(URL.createObjectURL(f)); setStatus('idle'); setDocMeta(null); onReady(false)
  }

  const handleUpload = async () => {
    if(!file||status==='uploading'||status==='polling') return
    setStatus('uploading'); setProgress('Uploading…')
    const fd = new FormData(); fd.append('pdf', file)
    try {
      const r = await fetch('http://localhost:5000/api/upload',{method:'POST',body:fd})
      if(!r.ok) throw new Error(`HTTP ${r.status}`)
      const {job_id} = await r.json()
      setStatus('polling'); setProgress('Queued…')
      pollRef.current = setInterval(()=>pollStatus(job_id), 2000) // Lowered polling to 1s because local ingestion is fast
    } catch(e){ setStatus('error'); setProgress(e.message) }
  }

  useEffect(()=>()=>stopPoll(),[])

  return (
    <div className="up-panel">
      <div className="up-header">
        <span className="up-icon">📄</span>
        <div>
          <div className="up-title">Document</div>
          {docMeta?.title && <div className="up-sub" title={docMeta.title}>{docMeta.title.length>38?docMeta.title.slice(0,36)+'…':docMeta.title}</div>}
        </div>
        {status==='ready' && <span className="ready-dot" title="Indexed"/>}
      </div>

      <div className={`drop-zone${file?' drop-filled':''}`} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();handleFile(e.dataTransfer.files[0])}} onClick={()=>document.getElementById('pfinput').click()}>
        <input id="pfinput" type="file" accept="application/pdf" style={{display:'none'}} onChange={e=>handleFile(e.target.files[0])}/>
        {file
          ? <div className="drop-info"><span style={{fontSize:26}}>📑</span><span className="drop-name">{file.name}</span><span className="drop-size">{(file.size/1024/1024).toFixed(1)} MB</span></div>
          : <div className="drop-ph"><span className="drop-arrow">↑</span><span>Drop a PDF or click to browse</span></div>
        }
      </div>

      {file && status!=='ready' && (
        <button className={`up-btn${status==='uploading'||status==='polling'?' up-busy':''}`} onClick={handleUpload} disabled={status==='uploading'||status==='polling'}>
          {status==='uploading'||status==='polling' ? <><span className="spin"/> {progress}</> : 'Index Document'}
        </button>
      )}
      {status==='ready'  && <div className="status-bar status-ok">✓ Indexed{docMeta?.document_type&&' · '+docMeta.document_type}</div>}
      {status==='error'  && <div className="status-bar status-err">⚠ {progress}</div>}

      <div className="pdf-wrap">
        {pdfUrl
          ? <iframe src={pdfUrl} title="PDF preview" className="pdf-frame"/>
          : <div className="pdf-ph"><span style={{fontSize:44,opacity:.15}}>📋</span><span style={{fontSize:12,opacity:.35}}>PDF preview</span></div>
        }
      </div>
    </div>
  )
}

// ── Main App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [isReady, setIsReady]   = useState(false)
  const [isTyping, setIsTyping] = useState(false)

  const [messages, setMessages] = useState(()=>{
    try{ const s=localStorage.getItem('rag_v4_opt'); return s?JSON.parse(s):[] } // Cache key updated for new version
    catch{ return [] }
  })

  const [query, setQuery]             = useState('')
  const [queryHistory, setQueryHistory] = useState([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  const chatEndRef = useRef(null)
  const inputRef   = useRef(null)
  const abortRef   = useRef(null)

  useEffect(()=>{
    chatEndRef.current?.scrollIntoView({behavior:'smooth'})
    try{ localStorage.setItem('rag_v4_opt', JSON.stringify(messages.slice(-60))) }catch{}
  },[messages])

  const clearSession = () => {
    if(abortRef.current) abortRef.current.abort()
    setMessages([]); setIsTyping(false)
    try{ localStorage.removeItem('rag_v4_opt') }catch{}
  }

  const handleKeyDown = e => {
    if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); handleAsk(); return }
    if(e.key==='ArrowUp'){
      e.preventDefault()
      if(!queryHistory.length) return
      const ni = Math.min(historyIndex+1, queryHistory.length-1)
      setHistoryIndex(ni); setQuery(queryHistory[queryHistory.length-1-ni])
    }
    if(e.key==='ArrowDown'){
      e.preventDefault()
      if(historyIndex<=0){ setHistoryIndex(-1); setQuery(''); return }
      const ni = historyIndex-1
      setHistoryIndex(ni); setQuery(queryHistory[queryHistory.length-1-ni])
    }
  }

  const handleAsk = async () => {
    const q = query.trim()
    if(!q||isTyping) return

    setQuery(''); setHistoryIndex(-1)
    setQueryHistory(prev=>[...prev,q])

    const history = messages.filter(m=>m.role!=='system').slice(-6).map(({role,content})=>({role,content}))

    setMessages(prev=>[...prev,{role:'user',content:q},{role:'ai',content:'',citations:[],searchType:''}])
    setIsTyping(true)

    function processLine(line, setter) {
      let p; try{ p=JSON.parse(line) }catch{ return }
      setter(prev=>{
        const msgs=[...prev], last=msgs[msgs.length-1]
        if(!last||last.role!=='ai') return prev
        if(p.type==='meta'){ last.citations=p.data?.citations??[]; last.searchType=p.data?.search_type??'' }
        else if(p.type==='text'){ last.content+=p.text??'' }
        return msgs
      })
    }

    try {
      abortRef.current = new AbortController()
      const resp = await fetch('http://localhost:5000/api/ask',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({query:q, chat_history:history}),
        signal: abortRef.current.signal
      })
      if(!resp.ok) throw new Error(`Server error ${resp.status}`)

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while(true){
        const {done, value} = await reader.read()
        if(done){
          if(buffer.trim()) processLine(buffer.trim(), setMessages)
          break
        }
        buffer += decoder.decode(value,{stream:true})
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for(const line of lines){ if(line.trim()) processLine(line, setMessages) }
      }
    } catch(e){
      if(e.name!=='AbortError'){
        setMessages(prev=>{
          const m=[...prev], last=m[m.length-1]
          if(last?.role==='ai') last.content='⚠ Connection error. Please try again.'
          return m
        })
      }
    } finally {
      setIsTyping(false)
      setTimeout(()=>inputRef.current?.focus(), 80)
    }
  }

  const msgCount = messages.filter(m=>m.role==='user').length
  const lastIsAiEmpty = isTyping && messages[messages.length-1]?.content===''

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&family=DM+Mono:wght@400;500&family=Outfit:wght@300;400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        :root{
          --r:#B54A2A; --rl:#D4603E; --rp:#F5EAE5; --rm:#E8C4B4;
          --ink:#1C1410; --ink2:#3D2B20; --ink3:#6B4C3B; --stone:#8C7B72;
          --fog:#F7F3F0; --wh:#FFFFFF; --bd:#E8DDD8; --bd2:#D4C8C0;
          --sh1:0 1px 3px rgba(28,20,16,.08); --sh2:0 4px 16px rgba(28,20,16,.10);
        }
        body{font-family:'Outfit',sans-serif;background:var(--fog);color:var(--ink);height:100vh;overflow:hidden}
        .shell{display:flex;height:100vh;overflow:hidden}

        /* Upload panel */
        .up-panel{width:390px;min-width:320px;display:flex;flex-direction:column;background:var(--wh);border-right:1px solid var(--bd);box-shadow:var(--sh1)}
        .up-header{display:flex;align-items:center;gap:12px;padding:18px 20px;border-bottom:1px solid var(--bd)}
        .up-icon{font-size:21px}
        .up-title{font-family:'Lora',serif;font-weight:600;font-size:15px;color:var(--ink)}
        .up-sub{font-size:11px;color:var(--stone);margin-top:1px;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .ready-dot{width:9px;height:9px;border-radius:50%;background:#3B9C6A;margin-left:auto;box-shadow:0 0 0 3px rgba(59,156,106,.18);animation:pdot 2s infinite}
        @keyframes pdot{0%,100%{box-shadow:0 0 0 3px rgba(59,156,106,.18)}50%{box-shadow:0 0 0 6px rgba(59,156,106,.07)}}
        .drop-zone{margin:14px 16px 0;border:1.5px dashed var(--bd2);border-radius:12px;padding:18px;cursor:pointer;background:var(--fog);display:flex;align-items:center;justify-content:center;min-height:82px;transition:border-color .2s,background .2s}
        .drop-zone:hover{border-color:var(--r);background:var(--rp)}
        .drop-filled{border-style:solid;border-color:var(--rm);background:var(--rp)}
        .drop-ph{display:flex;flex-direction:column;align-items:center;gap:5px;color:var(--stone);font-size:13px}
        .drop-arrow{font-size:20px;color:var(--r)}
        .drop-info{display:flex;flex-direction:column;align-items:center;gap:3px}
        .drop-name{font-size:12.5px;font-weight:500;color:var(--ink2);text-align:center;word-break:break-all}
        .drop-size{font-size:11px;color:var(--stone)}
        .up-btn{margin:12px 16px 0;padding:11px;background:var(--r);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:500;font-family:'Outfit',sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:background .2s,transform .15s}
        .up-btn:hover:not(:disabled){background:var(--rl);transform:translateY(-1px)}
        .up-btn:disabled{opacity:.6;cursor:not-allowed;transform:none}
        .up-busy{background:var(--ink3)!important}
        .status-bar{margin:10px 16px 0;padding:8px 13px;border-radius:7px;font-size:12.5px;font-weight:500}
        .status-ok{background:#EAF5EE;border:1px solid #A8D9BC;color:#2A7A4F}
        .status-err{background:#FEF0EC;border:1px solid #F2B8A8;color:var(--r)}
        .pdf-wrap{flex:1;margin:12px 16px 16px;border-radius:10px;overflow:hidden;border:1px solid var(--bd);display:flex;align-items:center;justify-content:center;background:var(--fog);min-height:0}
        .pdf-frame{width:100%;height:100%;border:none;display:block}
        .pdf-ph{display:flex;flex-direction:column;align-items:center;gap:8px}

        /* Chat panel */
        .chat-panel{flex:1;display:flex;flex-direction:column;background:var(--fog);min-width:0}
        .chat-header{display:flex;align-items:center;gap:14px;padding:16px 26px;background:var(--wh);border-bottom:1px solid var(--bd);box-shadow:var(--sh1);flex-shrink:0}
        .chat-logo{width:36px;height:36px;background:var(--r);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:17px;color:#fff;box-shadow:0 2px 8px rgba(181,74,42,.28)}
        .ch-text{flex:1}
        .ch-title{font-family:'Lora',serif;font-size:16px;font-weight:600;color:var(--ink)}
        .ch-sub{font-size:11.5px;color:var(--stone);margin-top:1px}
        .h-stats{display:flex;align-items:center;gap:9px}
        .stat-chip{background:var(--rp);border:1px solid var(--rm);border-radius:20px;padding:3px 11px;font-size:12px;font-weight:500;color:var(--r)}
        .clr-btn{padding:6px 13px;background:none;border:1px solid var(--bd2);border-radius:7px;font-size:12px;color:var(--stone);cursor:pointer;font-family:'Outfit',sans-serif;transition:border-color .2s,color .2s}
        .clr-btn:hover{border-color:var(--r);color:var(--r)}

        /* Messages */
        .msgs{flex:1;overflow-y:auto;padding:26px 30px;display:flex;flex-direction:column;gap:6px;min-height:0}
        .msgs::-webkit-scrollbar{width:5px}
        .msgs::-webkit-scrollbar-thumb{background:var(--bd2);border-radius:3px}
        .empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:var(--stone);padding:36px}
        .empty-glyph{width:60px;height:60px;background:var(--rp);border:1.5px solid var(--rm);border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:26px}
        .empty-title{font-family:'Lora',serif;font-size:17px;color:var(--ink2);font-weight:600}
        .empty-sub{font-size:13px;text-align:center;max-width:280px;line-height:1.6}
        .sug-row{display:flex;flex-wrap:wrap;gap:7px;justify-content:center;margin-top:6px}
        .sug{padding:7px 15px;background:var(--wh);border:1.5px solid var(--bd2);border-radius:20px;font-size:12.5px;color:var(--ink3);cursor:pointer;transition:border-color .2s,color .2s,background .2s;font-family:'Outfit',sans-serif}
        .sug:hover{border-color:var(--r);color:var(--r);background:var(--rp)}

        /* Bubbles */
        .brow{display:flex;align-items:flex-start;gap:10px;animation:fin .22s ease forwards}
        @keyframes fin{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        .brow-u{justify-content:flex-end}
        .brow-a{justify-content:flex-start}
        .av{width:31px;height:31px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;flex-shrink:0;margin-top:4px}
        .av-a{background:var(--r);color:#fff;font-size:14px;box-shadow:0 2px 6px rgba(181,74,42,.26)}
        .av-u{background:var(--ink2);color:#fff;font-size:11px}
        .bubble{max-width:73%;padding:13px 17px;border-radius:16px;font-size:14.5px;line-height:1.65;box-shadow:var(--sh1)}
        .bubble-u{background:var(--r);color:#fff;border-radius:16px 4px 16px 16px}
        .bubble-a{background:var(--wh);color:var(--ink);border:1px solid var(--bd);border-radius:4px 16px 16px 16px}
        .plain{margin:0;line-height:1.55}
        .typing-bubble{display:flex;align-items:center;gap:5px;padding:15px 18px}
        .dot{width:7px;height:7px;border-radius:50%;background:var(--rm);display:inline-block;animation:bdot 1.2s infinite ease-in-out}
        .dot:nth-child(2){animation-delay:.15s}.dot:nth-child(3){animation-delay:.30s}
        @keyframes bdot{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px);background:var(--r)}}
        .stream-cursor{display:inline-block;margin-left:2px;color:var(--r);animation:blink .9s step-start infinite}
        @keyframes blink{50%{opacity:0}}
        .meta-row{margin-top:10px;display:flex;align-items:center;gap:7px}
        .search-badge{font-size:11px;font-weight:500;background:var(--rp);border:1px solid var(--rm);color:var(--r);border-radius:20px;padding:2px 9px}

        /* Citations */
        .cites-area{margin-top:11px;padding-top:11px;border-top:1px solid var(--bd)}
        .cites-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);display:block;margin-bottom:5px}
        .cites-list{display:flex;flex-wrap:wrap;gap:5px}
        .cite-card{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;background:var(--fog);border:1px solid var(--bd2);border-radius:20px;font-size:12px;color:var(--ink3);cursor:pointer;font-family:'Outfit',sans-serif;transition:border-color .2s,background .2s;flex-direction:row}
        .cite-card:hover,.cite-open{border-color:var(--r);background:var(--rp)}
        .cite-open{flex-direction:column!important;align-items:flex-start!important;padding:7px 11px!important}
        .cite-num{font-family:'DM Mono',monospace;font-size:9.5px;font-weight:500;background:var(--r);color:#fff;border-radius:50%;width:15px;height:15px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
        .cite-pg{font-size:12px;color:var(--ink3);font-weight:500}
        .cite-snippet{display:block;margin-top:4px;font-size:11px;color:var(--stone);font-style:italic;line-height:1.5;max-width:250px;white-space:normal}

        /* Markdown */
        .md-body .mc-p{margin:4px 0}
        .md-body .mc-h1{font-family:'Lora',serif;font-size:1.2em;font-weight:600;color:var(--ink);margin:12px 0 6px}
        .md-body .mc-h2{font-family:'Lora',serif;font-size:1.05em;font-weight:600;color:var(--ink);margin:10px 0 5px}
        .md-body .mc-h3{font-size:.95em;font-weight:600;color:var(--ink2);margin:8px 0 4px}
        .md-body strong{font-weight:600;color:var(--ink)}
        .md-body em{color:var(--ink3);font-style:italic}
        .md-body .mc-ul{margin:5px 0 5px 17px}
        .md-body li{margin:3px 0}
        .md-body .mc-bq{border-left:3px solid var(--rm);padding:4px 12px;margin:7px 0;background:var(--rp);border-radius:0 4px 4px 0;color:var(--ink3);font-style:italic}
        .md-body .mc-hr{border:none;border-top:1px solid var(--bd);margin:9px 0}
        .md-body .mc-pre{background:var(--fog);border:1px solid var(--bd);border-radius:6px;padding:9px 13px;margin:7px 0;overflow-x:auto}
        .md-body .mc-code{font-family:'DM Mono',monospace;font-size:12.5px;color:var(--r)}
        .md-body .mc-ic{font-family:'DM Mono',monospace;background:var(--fog);border:1px solid var(--bd);border-radius:3px;padding:1px 5px;font-size:.88em;color:var(--r)}

        /* Input */
        .input-bar{padding:14px 26px 18px;background:var(--wh);border-top:1px solid var(--bd);flex-shrink:0}
        .input-wrap{display:flex;gap:9px;align-items:flex-end}
        .chat-input{flex:1;padding:12px 15px;background:var(--fog);border:1.5px solid var(--bd2);border-radius:11px;font-size:14.5px;font-family:'Outfit',sans-serif;color:var(--ink);outline:none;transition:border-color .2s,box-shadow .2s;resize:none;min-height:46px;max-height:120px;line-height:1.5}
        .chat-input:focus{border-color:var(--r);box-shadow:0 0 0 3px rgba(181,74,42,.10);background:var(--wh)}
        .chat-input::placeholder{color:var(--stone)}
        .chat-input:disabled{opacity:.5;cursor:not-allowed}
        .send-btn{padding:12px 20px;background:var(--r);color:#fff;border:none;border-radius:11px;font-size:14px;font-weight:600;font-family:'Outfit',sans-serif;cursor:pointer;white-space:nowrap;transition:background .2s,transform .15s;height:46px;display:flex;align-items:center;gap:6px}
        .send-btn:hover:not(:disabled){background:var(--rl);transform:translateY(-1px)}
        .send-btn:disabled{opacity:.4;cursor:not-allowed;transform:none}
        .input-hint{font-size:11px;color:var(--stone);margin-top:7px;text-align:center}
        kbd{background:var(--fog);border:1px solid var(--bd2);border-radius:3px;padding:1px 5px;font-family:'DM Mono',monospace;font-size:10px;color:var(--ink3)}
        .spin{width:12px;height:12px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:sp .7s linear infinite;display:inline-block}
        @keyframes sp{to{transform:rotate(360deg)}}
      `}</style>

      <div className="shell">
        <UploadPanel onReady={setIsReady}/>

        <div className="chat-panel">
          {/* Header */}
          <div className="chat-header">
            <div className="chat-logo">✦</div>
            <div className="ch-text">
              <div className="ch-title">Hybrid RAG Assistant</div>
              {/* Aligned subtitle with actual optimized stack */}
              <div className="ch-sub">Local Parsing · Semantic Search · Agentic Summary</div>
            </div>
            <div className="h-stats">
              {msgCount>0 && <span className="stat-chip">{msgCount} {msgCount===1?'query':'queries'}</span>}
              {messages.length>0 && <button className="clr-btn" onClick={clearSession}>Clear</button>}
            </div>
          </div>

          {/* Messages */}
          <div className="msgs">
            {messages.length===0 ? (
              <div className="empty">
                <div className="empty-glyph">💬</div>
                <div className="empty-title">Ask your document anything</div>
                <div className="empty-sub">Index a PDF on the left, then ask questions. The AI cites exact passages.</div>
                <div className="sug-row">
                  {['Summarize this document','What are the key findings?','List all recommendations'].map(s=>(
                    <button key={s} className="sug" onClick={()=>{ if(isReady) setQuery(s) }}>{s}</button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg,i)=>(
                <Bubble key={i} msg={msg} streaming={isTyping && i===messages.length-1 && msg.role==='ai'}/>
              ))
            )}
            {lastIsAiEmpty && <TypingDots/>}
            <div ref={chatEndRef}/>
          </div>

          {/* Input */}
          <div className="input-bar">
            <div className="input-wrap">
              <textarea
                ref={inputRef}
                className="chat-input"
                rows={1}
                placeholder={!isReady?'Index a document on the left first…':'Ask a question… (↑ history · Enter send)'}
                value={query}
                onChange={e=>{ setQuery(e.target.value); e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight,120)+'px' }}
                onKeyDown={handleKeyDown}
                disabled={!isReady||isTyping}
              />
              <button className="send-btn" onClick={handleAsk} disabled={!isReady||isTyping||!query.trim()}>
                {isTyping?<><span className="spin"/> Thinking</>: <>Send ↑</>}
              </button>
            </div>
            <div className="input-hint">
              <kbd>Enter</kbd> send · <kbd>↑↓</kbd> history · responses grounded in your document
            </div>
          </div>
        </div>
      </div>
    </>
  )
}