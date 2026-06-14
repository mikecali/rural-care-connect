import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';

function AiStatusBadge({ status }) {
  const cfg = {
    ready:       { color:'#2e7d32', bg:'#e8f5e9', dot:'#4caf50', text:'AI Handa / Ready' },
    loading:     { color:'#e65100', bg:'#fff3e0', dot:'#ff9800', text:'AI Naglo-load…' },
    unavailable: { color:'#c62828', bg:'#ffebee', dot:'#f44336', text:'AI Hindi Available' },
    checking:    { color:'#1565c0', bg:'#e3f0ff', dot:'#2196f3', text:'Sinusuri…' },
  }[status] || { color:'#1565c0', bg:'#e3f0ff', dot:'#2196f3', text:'Sinusuri…' };
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'3px 10px',
      borderRadius:999, background:cfg.bg, color:cfg.color, fontSize:12, fontWeight:600 }}>
      <span style={{ width:7, height:7, borderRadius:'50%', background:cfg.dot,
        animation: status==='loading'?'pulse 1.5s infinite':'none' }} />
      {cfg.text}
    </span>
  );
}

function SummaryCard({ text, onBook }) {
  // Parse the structured summary out of the model's reply
  const lines = text.split('\n');
  const summaryStart = lines.findIndex(l => l.includes('[PRE-SCREENING SUMMARY]'));
  const summaryLines = summaryStart >= 0 ? lines.slice(summaryStart) : lines;

  return (
    <div style={{ background:'#e8f5ee', border:'2px solid #1a7a4a', borderRadius:12, overflow:'hidden', marginTop:12 }}>
      <div style={{ background:'#1a7a4a', padding:'12px 18px', display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontSize:22 }}>📋</span>
        <div>
          <p style={{ color:'white', fontWeight:700, fontSize:15 }}>Pre-Screening Summary Complete</p>
          <p style={{ color:'rgba(255,255,255,0.8)', fontSize:12 }}>Handa na para sa doktor / Ready for doctor review</p>
        </div>
      </div>
      <div style={{ padding:'16px 18px' }}>
        <pre style={{ fontFamily:'inherit', fontSize:13, lineHeight:1.8, color:'#1f2937',
          whiteSpace:'pre-wrap', wordBreak:'break-word', margin:0 }}>
          {summaryLines.join('\n')}
        </pre>
        {onBook && (
          <button onClick={onBook} className="btn btn-primary" style={{ marginTop:16, width:'100%', justifyContent:'center' }}>
            📅 I-book ang Teleconsultation / Book Teleconsultation with Dr. Mendoza
          </button>
        )}
      </div>
    </div>
  );
}

function ChatMessage({ msg }) {
  const isUser = msg.role === 'user';
  const isEmergency = msg.isEmergency;
  const isSummary = msg.isSummary;

  if (isSummary) return null; // Rendered separately as SummaryCard

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems: isUser ? 'flex-end' : 'flex-start', marginBottom:12 }}>
      {/* Label */}
      <span style={{ fontSize:11, color:'var(--gray-400)', marginBottom:4, paddingLeft:4 }}>
        {isUser ? 'Ikaw / You' : '🤖 Pre-Screening Assistant'}
      </span>

      <div style={{
        maxWidth:'85%', borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        padding:'10px 14px', fontSize:14, lineHeight:1.65,
        background: isEmergency ? '#c62828' : isUser ? '#1a7a4a' : 'white',
        color: isEmergency || isUser ? 'white' : '#1f2937',
        border: isUser || isEmergency ? 'none' : '1px solid var(--gray-200)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}>
        {isEmergency && <p style={{ fontWeight:800, fontSize:15, marginBottom:6 }}>🚨 EMERGENCY / EMERHENSYA</p>}
        {/* Render bold markdown */}
        <span dangerouslySetInnerHTML={{ __html:
          msg.content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br/>')
        }} />
      </div>
    </div>
  );
}

export default function TriagePage({ onBookConsult }) {
  const [messages, setMessages] = useState([]);          // {role, content, isEmergency, isSummary}
  const [history, setHistory]   = useState([]);          // raw {role, content} for API
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [aiStatus, setAiStatus] = useState('checking');
  const [started, setStarted]   = useState(false);
  const [summary, setSummary]   = useState(null);
  const [isEnded, setIsEnded]   = useState(false);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  // Check AI status
  useEffect(() => {
    async function checkStatus() {
      try {
        const s = await api.get('/triage/status');
        setAiStatus(s.status);
        if (s.status === 'loading') setTimeout(checkStatus, 15000);
      } catch { setAiStatus('unavailable'); }
    }
    checkStatus();
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:'smooth' });
  }, [messages, loading]);

  // Start the interview — send a blank opener so AI sends Step 1
  async function startInterview() {
    setStarted(true);
    setLoading(true);
    try {
      const res = await api.post('/triage/chat', { message: 'Hello, I am ready to begin.', history: [] });
      const aiMsg = { role:'assistant', content: res.reply, isEmergency: res.isEmergency, isSummary: res.isSummary };
      setMessages([aiMsg]);
      setHistory([
        { role:'user', content:'Hello, I am ready to begin.' },
        { role:'assistant', content: res.reply },
      ]);
      if (res.isSummary) setSummary(res.reply);
    } catch (e) {
      setMessages([{ role:'assistant', content:'Hindi makakonekta sa AI. Subukan ulit. / Could not connect to AI. Please try again.', isEmergency:false }]);
    } finally { setLoading(false); }
  }

  async function sendMessage(e) {
    e.preventDefault();
    if (!input.trim() || loading || isEnded) return;

    const userText = input.trim();
    setInput('');

    const userMsg = { role:'user', content: userText };
    setMessages(m => [...m, userMsg]);

    const newHistory = [...history, { role:'user', content: userText }];
    setLoading(true);

    try {
      const res = await api.post('/triage/chat', { message: userText, history: newHistory });
      const aiMsg = { role:'assistant', content: res.reply, isEmergency: res.isEmergency, isSummary: res.isSummary };
      setMessages(m => [...m, aiMsg]);
      setHistory([...newHistory, { role:'assistant', content: res.reply }]);

      if (res.isEmergency) setIsEnded(true);
      if (res.isSummary) { setSummary(res.reply); setIsEnded(true); }
    } catch (err) {
      setMessages(m => [...m, { role:'assistant', content:'May error. Subukan ulit. / Error occurred. Please try again.', isEmergency:false }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  function resetInterview() {
    setMessages([]); setHistory([]); setInput('');
    setStarted(false); setSummary(null); setIsEnded(false);
  }

  // ── Not started yet — show intro screen ──────────────────────────
  if (!started) return (
    <div>
      <div className="page-header">
        <div>
          <h2>🤖 AI Pre-Screening Interview</h2>
          <p className="text-muted" style={{ fontSize:13, marginTop:2 }}>
            Structured pre-consultation assessment · Rural Care Connect Project
          </p>
        </div>
        <AiStatusBadge status={aiStatus} />
      </div>
      <div className="page-body" style={{ maxWidth:680 }}>

        {/* Emergency warning */}
        <div style={{ background:'#ffebee', border:'1px solid #ef9a9a', borderRadius:10,
          padding:'14px 16px', marginBottom:20, display:'flex', gap:12 }}>
          <span style={{ fontSize:22, flexShrink:0 }}>🚨</span>
          <div>
            <p style={{ fontWeight:700, color:'#c62828', fontSize:14 }}>HINDI para sa emerhensya / NOT for emergencies</p>
            <p style={{ fontSize:13, color:'#7f1d1d', marginTop:3, lineHeight:1.5 }}>
              Para sa sakit sa dibdib, hirap huminga, o pagkawala ng malay —
              <strong> tumawag agad sa El Nido Community Hospital.</strong><br/>
              For chest pain, difficulty breathing, or loss of consciousness —
              <strong> call El Nido Community Hospital immediately.</strong>
            </p>
          </div>
        </div>

        {/* What to expect */}
        <div className="card">
          <div className="card-title">Ano ang mangyayari / What to expect</div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {[
              { step:'1', text:'Ikukuha kayo ng wika — Filipino o English / Choose your language — Filipino or English' },
              { step:'2', text:'Itatanong ang inyong impormasyon at dahilan ng konsultasyon / Provide personal details and reason for visit' },
              { step:'3', text:'Mag-uulat kayo ng vital signs kung sinukat ng BHW / Report vitals if taken by Barangay Health Worker' },
              { step:'4', text:'Sasagutin ang mga tanong tungkol sa sintomas at gamot / Answer questions about symptoms and medications' },
              { step:'5', text:'Isang buod ang ipapadala sa doktor bago ang konsultasyon / A summary will be sent to the doctor before your consult' },
            ].map(s => (
              <div key={s.step} style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
                <span style={{ width:26, height:26, borderRadius:'50%', background:'var(--green)',
                  color:'white', fontWeight:700, fontSize:13, display:'flex', alignItems:'center',
                  justifyContent:'center', flexShrink:0 }}>{s.step}</span>
                <p style={{ fontSize:14, color:'var(--gray-600)', lineHeight:1.5, paddingTop:3 }}>{s.text}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop:16, padding:'10px 14px', background:'var(--gray-50)', borderRadius:8, fontSize:12, color:'var(--gray-600)' }}>
            ⏱ Karaniwang tumatagal ng 5–10 minuto / Usually takes 5–10 minutes
          </div>
          {aiStatus === 'loading' && (
            <div className="alert" style={{ background:'#e3f0ff', color:'#1565c0', border:'none', marginTop:12 }}>
              ⏳ Naglo-load ang AI model — maaari kang magsimula, mabagal lang ang sagot. / AI is loading — you can start, responses will be slow.
            </div>
          )}
          {aiStatus === 'unavailable' && (
            <div className="alert alert-error" style={{ marginTop:12 }}>
              AI service is currently unavailable. Please try again later or book a consultation directly.
            </div>
          )}
          <button className="btn btn-primary" style={{ marginTop:16, width:'100%', justifyContent:'center', padding:'13px' }}
            onClick={startInterview} disabled={aiStatus === 'unavailable'}>
            🩺 Simulan ang Pre-Screening / Start Pre-Screening Interview
          </button>
        </div>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
    </div>
  );

  // ── Active chat interface ─────────────────────────────────────────
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 0px)' }}>
      {/* Header */}
      <div className="page-header" style={{ flexShrink:0 }}>
        <div>
          <h2>🤖 Pre-Screening Interview</h2>
          <p className="text-muted" style={{ fontSize:13, marginTop:2 }}>
            {isEnded
              ? (summary ? '✅ Kumpleto na / Interview complete — summary ready for doctor'
                         : '🚨 Natukoy ang emerhensya / Emergency detected')
              : 'Aktibong interbyu / Active interview — sagutin ang bawat tanong'}
          </p>
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          <AiStatusBadge status={aiStatus} />
          {(isEnded || messages.length > 2) && (
            <button className="btn btn-secondary btn-sm" onClick={resetInterview}>↺ Bago / New</button>
          )}
        </div>
      </div>

      {/* Chat messages */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px 28px', background:'var(--gray-50)' }}>
        <div style={{ maxWidth:680, margin:'0 auto' }}>

          {/* Interview progress indicator */}
          {!isEnded && messages.length > 0 && (
            <div style={{ textAlign:'center', marginBottom:16 }}>
              <span style={{ fontSize:12, color:'var(--gray-400)', background:'white',
                padding:'4px 14px', borderRadius:999, border:'1px solid var(--gray-200)' }}>
                🔒 Secure pre-screening session · Nire-rekord ang impormasyon / Information being recorded
              </span>
            </div>
          )}

          {messages.map((msg, i) => <ChatMessage key={i} msg={msg} />)}

          {/* Loading indicator */}
          {loading && (
            <div style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:12 }}>
              <span style={{ fontSize:11, color:'var(--gray-400)', marginTop:20 }}>🤖 Pre-Screening Assistant</span>
              <div style={{ background:'white', border:'1px solid var(--gray-200)', borderRadius:'14px 14px 14px 4px',
                padding:'12px 16px', display:'flex', gap:5, alignItems:'center' }}>
                {[0,1,2].map(i => (
                  <span key={i} style={{ width:8, height:8, borderRadius:'50%', background:'var(--green)',
                    animation:`bounce 1.2s ${i*0.2}s infinite`, display:'inline-block' }} />
                ))}
              </div>
            </div>
          )}

          {/* Summary card */}
          {summary && (
            <SummaryCard text={summary} onBook={onBookConsult} />
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input area */}
      <div style={{ flexShrink:0, background:'white', borderTop:'1px solid var(--gray-200)', padding:'14px 28px' }}>
        <div style={{ maxWidth:680, margin:'0 auto' }}>
          {isEnded ? (
            <div style={{ textAlign:'center', padding:'8px 0' }}>
              {summary
                ? <p style={{ color:'var(--green)', fontWeight:600, fontSize:14 }}>
                    ✅ Kumpleto ang pre-screening. I-book ang inyong konsultasyon sa itaas. /
                    Pre-screening complete. Book your consultation above.
                  </p>
                : <p style={{ color:'var(--red)', fontWeight:600, fontSize:14 }}>
                    🚨 Makipag-ugnayan sa El Nido Community Hospital agad. /
                    Contact El Nido Community Hospital immediately.
                  </p>
              }
              <button className="btn btn-secondary btn-sm" style={{ marginTop:8 }} onClick={resetInterview}>
                ↺ Bagong Pre-Screening / Start New Interview
              </button>
            </div>
          ) : (
            <form onSubmit={sendMessage} style={{ display:'flex', gap:10 }}>
              <input ref={inputRef} value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="I-type ang inyong sagot dito / Type your answer here…"
                disabled={loading}
                style={{ flex:1, padding:'11px 16px', borderRadius:10, border:'1.5px solid var(--gray-200)',
                  fontSize:14, fontFamily:'inherit', outline:'none',
                  borderColor: input ? 'var(--green)' : 'var(--gray-200)' }} />
              <button type="submit" disabled={loading || !input.trim()}
                style={{ padding:'11px 20px', borderRadius:10, border:'none', background:'var(--green)',
                  color:'white', fontWeight:700, fontSize:14, cursor:'pointer', flexShrink:0,
                  opacity: loading || !input.trim() ? 0.5 : 1 }}>
                Send ↑
              </button>
            </form>
          )}
          <p style={{ fontSize:11, color:'var(--gray-400)', marginTop:6, textAlign:'center' }}>
            Hindi ito pang-emerhensya. Para sa emergency, tumawag sa El Nido Community Hospital. /
            Not for emergencies. For emergencies call El Nido Community Hospital.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>
    </div>
  );
}
