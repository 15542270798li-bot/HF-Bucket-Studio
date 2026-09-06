const HF_ENDPOINT = "https://huggingface.co";
const COOKIE = "hf_bucket_access";
const MAX_AGE = 60 * 60 * 24 * 30;

const encoder = new TextEncoder();
async function signature(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
function cookies(request) {
  return Object.fromEntries((request.headers.get("Cookie") || "").split(";").map(part => part.trim().split("=")).filter(pair => pair.length === 2));
}
async function authorized(request, env) {
  const value = cookies(request)[COOKIE] || "";
  const [expires, token] = value.split(".");
  if (!expires || !token || Number(expires) < Date.now()) return false;
  return token === await signature(expires, env.ACCESS_COOKIE_SECRET);
}
function json(data, status = 200, headers = {}) { return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } }); }
function corsHeaders() { return { "cache-control": "no-store" }; }
async function hf(path, env, init = {}) {
  const response = await fetch(`${HF_ENDPOINT}${path}`, { ...init, headers: { Authorization: `Bearer ${env.HF_ACCESS_TOKEN}`, Accept: "application/json", ...(init.headers || {}) } });
  if (!response.ok) throw new Error(`Hugging Face API ${response.status}: ${(await response.text()).slice(0, 240)}`);
  return response.json();
}
function bucketPath(bucket) { if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(bucket)) throw new Error("Invalid bucket id"); return encodeURIComponent(bucket).replace("%2F", "/"); }
function filePath(path) { if (!path || path.length > 1024 || path.startsWith("/") || path.includes("\0")) throw new Error("Invalid file path"); return path; }
function trpcInput(url) { try { const raw = url.searchParams.get("input"); if (!raw) return {}; const parsed = JSON.parse(raw); return parsed?.json ?? parsed; } catch { return {}; } }
async function handleApi(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  if (request.method === "POST" && new URL(request.url).pathname === "/api/access/login") {
    const body = await request.json().catch(() => ({}));
    if (!env.ACCESS_PASSWORD) return json({ error: "ACCESS_PASSWORD is not configured" }, 503);
    if (typeof body.password !== "string" || body.password !== env.ACCESS_PASSWORD) return json({ error: "Incorrect access password" }, 401);
    const expires = String(Date.now() + MAX_AGE * 1000);
    const token = await signature(expires, env.ACCESS_COOKIE_SECRET);
    return json({ authenticated: true }, 200, { "set-cookie": `${COOKIE}=${expires}.${token}; Max-Age=${MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Lax` });
  }
  if (request.method === "POST" && new URL(request.url).pathname === "/api/access/logout") return json({ authenticated: false }, 200, { "set-cookie": `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax` });
  if (new URL(request.url).pathname === "/api/access/session") return authorized(request, env) ? json({ authenticated: true }) : json({ authenticated: false }, 401);
  if (!(await authorized(request, env))) return json({ error: "Access password required" }, 401);

  const url = new URL(request.url);
  if (url.pathname === "/api/media") {
    const bucket = url.searchParams.get("bucket") || "";
    const path = filePath(url.searchParams.get("path") || "");
    const upstream = await fetch(`${HF_ENDPOINT}/buckets/${bucketPath(bucket)}/resolve/${encodeURIComponent(path)}`, { headers: { Authorization: `Bearer ${env.HF_ACCESS_TOKEN}`, ...(request.headers.get("Range") ? { Range: request.headers.get("Range") } : {}) } });
    const headers = new Headers();
    for (const key of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) { const value = upstream.headers.get(key); if (value) headers.set(key, value); }
    headers.set("cache-control", "private, max-age=300, stale-while-revalidate=60");
    headers.set("content-disposition", `${url.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(path.split("/").pop() || "download")}`);
    return new Response(upstream.body, { status: upstream.status, headers });
  }
  if (!url.pathname.startsWith("/api/trpc/")) return json({ error: "Not found" }, 404);
  const operation = url.pathname.slice("/api/trpc/".length);
  const input = trpcInput(url);
  let result;
  if (operation === "buckets.list") result = await hf("/api/buckets/me", env);
  else if (operation === "buckets.info") result = await hf(`/api/buckets/${bucketPath(input.bucketId)}`, env);
  else if (operation === "buckets.tree") result = await hf(`/api/buckets/${bucketPath(input.bucketId)}/tree?recursive=true${input.prefix ? `&prefix=/${encodeURIComponent(filePath(input.prefix))}` : ""}`, env);
  else if (operation === "buckets.deleteFile") { const response = await fetch(`${HF_ENDPOINT}/api/buckets/${bucketPath(input.bucketId)}/batch`, { method: "POST", headers: { Authorization: `Bearer ${env.HF_ACCESS_TOKEN}`, "Content-Type": "application/x-ndjson" }, body: `${JSON.stringify({ type: "deleteFile", path: filePath(input.path) })}\n` }); if (!response.ok) throw new Error(`Hugging Face API ${response.status}`); result = { success: true }; }
  else return json({ error: "Not found" }, 404);
  return json({ result: { data: { json: result } } });
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env);
      return new Response(APP_HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Request failed" }, 500);
    }
  },
};

export const APP_HTML = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HF Bucket Studio</title><style>
:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#eef0f1;background:#090a0c}*{box-sizing:border-box}body{margin:0;background:#090a0c}button,input{font:inherit}button{cursor:pointer}.auth{min-height:100vh;display:grid;place-items:center;padding:24px}.auth-card{width:min(420px,100%);padding:34px;border:1px solid #ffffff14;border-radius:28px;background:#ffffff0b;box-shadow:0 30px 100px #0008}.brand{display:flex;align-items:center;gap:10px;font-weight:700}.mark{display:grid;place-items:center;width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#ffbc94,#f27b4d);color:#29150d}.eyebrow{margin:28px 0 10px;color:#f39971;font:10px ui-monospace,monospace;letter-spacing:.16em}.auth h1{font-size:36px;line-height:1.08;letter-spacing:-.06em;margin:0}.auth h1 span{color:#ff9f6e}.muted{color:#ffffff8a;font-size:14px;line-height:1.65}.auth input{display:block;width:100%;margin-top:24px;padding:14px 16px;border:1px solid #ffffff18;border-radius:15px;background:#0004;color:white;outline:0}.auth input:focus{border-color:#f27b4d}.primary{margin-top:14px;width:100%;padding:14px 16px;border:0;border-radius:15px;background:#f27b4d;color:#231109;font-weight:700}.shell{min-height:100vh;display:flex}.side{width:250px;flex:0 0 250px;padding:20px 16px;background:#0d0f11;border-right:1px solid #ffffff0d}.side-head{display:flex;align-items:center;justify-content:space-between}.side h3{margin:0;font-size:13px}.tiny{color:#ffffff55;font-size:10px;letter-spacing:.12em;text-transform:uppercase}.side button,.top button{border:0;background:transparent;color:#ffffff7a}.bucket{width:100%;margin-top:24px;padding:11px;border:1px solid #f27b4d22!important;border-radius:12px!important;background:#f27b4d12!important;color:#ffd0ba!important;text-align:left}.main{min-width:0;flex:1}.top{height:68px;padding:0 34px;border-bottom:1px solid #ffffff0d;display:flex;align-items:center;justify-content:space-between;color:#ffffff66}.content{max-width:1450px;margin:auto;padding:52px 40px}.heading{display:flex;justify-content:space-between;align-items:end;gap:20px}.heading h1{font-size:clamp(38px,5vw,62px);letter-spacing:-.07em;margin:8px 0}.heading button{padding:11px 15px;border:1px solid #ffffff18;border-radius:11px;background:#f27b4d;color:#251109;font-weight:700}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:44px}.stat{padding:18px;border:1px solid #ffffff10;border-radius:16px;background:#ffffff05}.stat small{color:#ffffff45;font:10px ui-monospace,monospace}.stat strong{display:block;margin-top:7px;font-size:20px}.files{margin-top:48px}.files-head{display:flex;justify-content:space-between;align-items:center;gap:16px}.search{padding:10px 12px;border:1px solid #ffffff12;border-radius:10px;background:#ffffff08;color:white}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;margin-top:18px}.card{padding:0;border:1px solid #ffffff10;border-radius:15px;overflow:hidden;background:#101214;color:white;text-align:left}.card:hover{border-color:#f27b4d99;transform:translateY(-2px)}.preview{height:145px;display:grid;place-items:center;position:relative;background:radial-gradient(circle at 75% 20%,#f27b4d55,transparent 40%),linear-gradient(135deg,#202928,#1b1519)}.preview b{position:absolute;top:12px;left:12px;padding:5px 8px;border:1px solid #ffffff20;border-radius:99px;background:#0005;color:#fff9;font:9px ui-monospace,monospace}.play{display:grid;place-items:center;width:42px;height:42px;border-radius:99px;background:#fff;color:#2b140c}.card-info{padding:15px}.card-info strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.card-info small{display:block;margin-top:7px;color:#ffffff4d}.modal{position:fixed;inset:0;z-index:5;display:grid;place-items:center;padding:20px;background:#000b;backdrop-filter:blur(12px)}.modal-card{width:min(560px,100%);max-height:calc(100vh - 40px);overflow:auto;padding:20px;border:1px solid #ffffff18;border-radius:18px;background:#111315;box-shadow:0 30px 100px #000b}.modal-head{display:flex;justify-content:space-between;align-items:center}.close{border:0;background:transparent;color:#fff8;font-size:22px}.modal video{width:100%;margin-top:16px;border-radius:12px;background:#000}.actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:15px}.actions button,.actions a{padding:11px;border:1px solid #ffffff14;border-radius:10px;background:#ffffff08;color:#fff;text-align:center;text-decoration:none;font-size:12px}.actions .download{background:#f27b4d;color:#241109;font-weight:700}@media(max-width:720px){.side{display:none}.content{padding:32px 16px}.top{padding:0 16px}.heading{display:block}.heading button{margin-top:16px}.stats{grid-template-columns:1fr}.files-head{display:block}.search{width:100%;margin-top:14px}.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.preview{height:112px}.card-info{padding:11px}}
</style></head><body><div id="app"></div><script>
const app=document.querySelector('#app'),bucket='155422li/manus';let files=[],selected=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bytes=n=>{n=n||0;if(n<1024)return n+' B';if(n<1048576)return (n/1024).toFixed(1)+' KB';if(n<1073741824)return (n/1048576).toFixed(1)+' MB';return (n/1073741824).toFixed(2)+' GB'};
const name=p=>p.split('/').pop()||p;const media=p=>'/api/media?bucket='+encodeURIComponent(bucket)+'&path='+encodeURIComponent(p);
async function api(path,opts){const r=await fetch(path,opts);const b=await r.json().catch(()=>({}));if(!r.ok)throw Error(b.error||'Request failed');return b}
function login(){app.innerHTML='<main class="auth"><form class="auth-card" id="login"><div class="brand"><span class="mark">B</span><span>HF Bucket Studio</span></div><div class="eyebrow">PRIVATE STORAGE ACCESS</div><h1>Your files,<br><span>beautifully in reach.</span></h1><p class="muted">Enter the workspace password configured in Cloudflare. The password is never stored in the browser.</p><input type="password" id="password" placeholder="Access password" autofocus><button class="primary">Unlock workspace →</button></form></main>';document.querySelector('#login').onsubmit=async e=>{e.preventDefault();try{await api('/api/access/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:document.querySelector('#password').value})});await load()}catch(err){alert(err.message)}}}
async function load(){try{const session=await fetch('/api/access/session');if(!session.ok)return login();const raw=await api('/api/trpc/buckets.tree?input='+encodeURIComponent(JSON.stringify({json:{bucketId:bucket}})));files=raw.result.data.json.filter(x=>x.type==='file');render()}catch(err){app.innerHTML='<main class="auth"><div class="auth-card"><h1>Unable to load bucket</h1><p class="muted">'+esc(err.message)+'</p></div></main>'}}
function render(){app.innerHTML='<div class="shell"><aside class="side"><div class="side-head"><div class="brand"><span class="mark">B</span><h3>HF Bucket Studio</h3></div></div><div class="tiny" style="margin-top:38px">BUCKETS</div><button class="bucket">● manus <span style="float:right">'+files.length+'</span></button><div class="muted" style="position:fixed;bottom:24px;font-size:11px">Password-only access<br>Range-streamed playback</div></aside><main class="main"><header class="top"><span>Storage　›　<strong style="color:#fff">manus</strong></span><button id="logout">Log out</button></header><div class="content"><section class="heading"><div><div class="eyebrow" style="margin:0">PRIVATE BUCKET</div><h1>manus</h1><p class="muted">A focused view of your media library, streamed from Hugging Face.</p></div><button id="refresh">Refresh</button></section><section class="stats"><div class="stat"><small>TOTAL STORAGE</small><strong>'+bytes(files.reduce((s,f)=>s+(f.size||0),0))+'</strong></div><div class="stat"><small>OBJECTS</small><strong>'+files.length+'</strong></div><div class="stat"><small>VISIBILITY</small><strong>Private</strong></div></section><section class="files"><div class="files-head"><div><h2>Files <span style="color:#ffffff44">'+files.length+'</span></h2><p class="muted" style="font-size:12px">Browse, preview and download at the edge.</p></div><input class="search" id="search" placeholder="Search files"></div><div class="grid" id="grid"></div></section></div></main></div>';draw(files);document.querySelector('#search').oninput=e=>draw(files.filter(f=>name(f.path).toLowerCase().includes(e.target.value.toLowerCase())));document.querySelector('#refresh').onclick=load;document.querySelector('#logout').onclick=async()=>{await api('/api/access/logout',{method:'POST'});login()}}
function draw(list){document.querySelector('#grid').innerHTML=list.map(f=>'<button class="card" data-path="'+esc(f.path)+'"><div class="preview"><b>VIDEO</b><span class="play">▶</span></div><div class="card-info"><strong>'+esc(name(f.path))+'</strong><small>'+bytes(f.size)+'</small></div></button>').join('');document.querySelectorAll('.card').forEach(el=>el.onclick=()=>openModal(el.dataset.path))}
function openModal(path){const f=files.find(x=>x.path===path);selected=f;const url=media(path);app.insertAdjacentHTML('beforeend','<div class="modal" id="modal"><div class="modal-card"><div class="modal-head"><div class="eyebrow" style="margin:0">FILE DETAILS</div><button class="close" id="close">×</button></div><h2>'+esc(name(path))+'</h2><p class="muted">'+esc(path)+' · '+bytes(f.size)+'</p><video controls preload="metadata" src="'+url+'"></video><div class="actions"><a class="download" href="'+url+'&download=1">Download</a><button id="copy">Copy link</button></div><button class="actions" style="display:block;width:100%;margin-top:10px;color:#ff9999" id="delete">Delete permanently</button></div></div>');document.querySelector('#close').onclick=()=>document.querySelector('#modal').remove();document.querySelector('#modal').onclick=e=>{if(e.target.id==='modal')e.target.remove()};document.querySelector('#copy').onclick=async()=>{await navigator.clipboard.writeText(location.origin+url);alert('Link copied')};document.querySelector('#delete').onclick=async()=>{if(confirm('Delete this file permanently?')){await api('/api/trpc/buckets.deleteFile?input='+encodeURIComponent(JSON.stringify({json:{bucketId:bucket,path}})),{method:'POST'});document.querySelector('#modal').remove();load()}}}
load();</script></body></html>`;
