'use strict';
const supabaseUrl='https://mdayxgtxannasfmfhnva.supabase.co';
const publishableKey="sb_publishable_a7zd4PFpYf2-YtJstDOWtg_KKGJdL0t";
const sessionKey='hope-render-auth-v1';
const q=id=>document.getElementById(id);
const roles={
  admin:['مدير الموقع','أدر حسابات العاملين واعتمد صلاحياتهم.'],
  secretary:['السكرتير','تم اعتماد دخولك بصفة سكرتير. ربط سجل الدوام والمهام المشترك ببوابة Render قيد التطوير.'],
  employee:['الموظف','تم اعتماد حسابك. ستظهر السجلات المخصّصة لك عند ربطها بالبوابة.'],
  developer:['مطوّر الموقع','استخدم مساحة التطوير لحفظ ملاحظات الإصدار ومتابعة التغييرات التقنية.'],
  caseworker:['موظف الكفالات','تم اعتماد دخولك بصفة موظف الكفالات.'],
  publisher:['ناشر المحتوى','تم اعتماد دخولك بصفة ناشر محتوى.'],
  finance:['المحاسب','تم اعتماد دخولك بصفة محاسب.']
};
let session;
let chatMessages=[];
let chatRequest=0;
let chatStorageKey=null;
let chatContext;
const embeddedChat=new URLSearchParams(location.search).get('view')==='chat';
if(embeddedChat) document.body.classList.add('chat-embedded');
function say(message){q('notice').textContent=message;}
function saveSession(value){
  session=value?.access_token&&value?.refresh_token?value:null;
  if(session) sessionStorage.setItem(sessionKey,JSON.stringify(session));
  else sessionStorage.removeItem(sessionKey);
}
async function call(path,{method='GET',body,token,preferences}={}){
  const response=await fetch(supabaseUrl+path,{method,headers:{
    apikey:publishableKey,...(token?{Authorization:'Bearer '+token}:{}),
    ...(body?{'Content-Type':'application/json'}:{}),...(preferences?{Prefer:preferences}:{})
  },body:body?JSON.stringify(body):undefined});
  const data=response.status===204?null:await response.json();
  if(!response.ok) throw Object.assign(Error('تعذّر تنفيذ الطلب.'),{status:response.status,code:data?.error_code||data?.code||data?.error});
  return data;
}
async function secured(path,options={}){
  try {return await call(path,{...options,token:session?.access_token});}
  catch(error){
    if(error.status!==401||!session?.refresh_token) throw error;
    try {
      const next=await call('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}});
      saveSession(next);
    } catch(refreshError){saveSession(null);await route();throw refreshError;}
    return call(path,{...options,token:session.access_token});
  }
}
function bind(name,fn,warning='تعذّر تنفيذ الطلب. حاول مجددًا.'){
  const form=q(name);
  form.onsubmit=async event=>{
    event.preventDefault();
    const button=event.submitter;
    button.disabled=true;
    say('');
    try {await fn(Object.fromEntries(new FormData(form)));}
    catch(error){say(error.code==='23505'?'هذا البريد معتمد مسبقًا.':warning);}
    finally {button.disabled=false;}
  };
}
async function listGrants(){
  const grants=await secured('/rest/v1/hope_access_grants?select=email,role,user_id&order=email');
  const rows=grants.map(grant=>{
    const node=document.createElement('li');
    node.textContent=grant.email+' · '+roles[grant.role][0]+' · '+(grant.user_id?'مفعّل':'بانتظار التفعيل');
    return node;
  });
  q('grants').replaceChildren(...rows);
}
async function route(){
  for(const id of ['signedOut','signedIn','accounts','technical','adminLink','development-chat']) q(id).hidden=true;
  q('embeddedAccess').hidden=true;
  if(!session){
    if(embeddedChat){
      q('embeddedMessage').textContent='سجّل الدخول بحساب المدير أو المطوّر لفتح المحادثة.';
      q('embeddedAccess').hidden=false;
    } else q('signedOut').hidden=false;
    return;
  }
  const role=await secured('/rest/v1/rpc/hope_activate_access',{method:'POST',body:{}});
  if(embeddedChat){
    if(role==='admin'||role==='developer'){
      q('development-chat').hidden=false;
      await openChat();
    } else {
      q('embeddedMessage').textContent='مساعد التطوير متاح لحسابات المدير والمطوّر.';
      q('embeddedAccess').hidden=false;
    }
    return;
  }
  q('signedIn').hidden=false;
  q('roleTitle').textContent=roles[role]?.[0]||'حساب بانتظار الاعتماد';
  q('roleDescription').textContent=roles[role]?.[1]||'اطلب من المدير اعتماد بريدك وتحديد دورك، ثم سجّل الدخول مجددًا.';
  if(role==='admin'){
    q('accounts').hidden=false;
    q('adminLink').hidden=false;
    await listGrants();
  }
  if(role==='developer'||role==='admin'){
    const rows=await secured('/rest/v1/hope_workspaces?area=eq.design&select=payload');
    q('designForm').elements.notes.value=rows[0]?.payload?.technicalNotes||'';
    q('technical').hidden=false;
    q('development-chat').hidden=false;
    openChat();
    if(location.hash==='#development-chat') q('development-chat').scrollIntoView();
  }
}
bind('loginForm',async data=>{
  const value=data.identity.trim();
  const identity=value.includes('@')?{email:value.toLowerCase()}:{phone:value};
  const result=await call('/auth/v1/token?grant_type=password',{method:'POST',body:{...identity,password:data.password}});
  saveSession(result);
  q('loginForm').reset();
  await route();
},'تعذّر الدخول. تحقق من بيانات الحساب وتأكيد البريد أولًا.');
bind('signupForm',async data=>{
  const redirect=encodeURIComponent(location.origin+'/login.html');
  const result=await call('/auth/v1/signup?redirect_to='+redirect,{method:'POST',body:{email:data.email.trim().toLowerCase(),password:data.password}});
  if(result.access_token){
    saveSession(result);
    await route();
  } else say('إذا كان البريد قابلًا للتفعيل، سيصلك رابط لتأكيده. افحص البريد غير المرغوب فيه.');
  q('signupForm').reset();
  q('signupForm').hidden=true;
},'تعذّر بدء تفعيل البريد. تحقق من عنوان البريد وحاول مجددًا.');
bind('grantForm',async data=>{
  await secured('/rest/v1/hope_access_grants',{method:'POST',body:{email:data.email.trim().toLowerCase(),role:data.role}});
  q('grantForm').reset();
  await listGrants();
  say('تم اعتماد البريد والدور.');
});
bind('designForm',async data=>{
  const rows=await secured('/rest/v1/hope_workspaces?area=eq.design&select=payload');
  await secured('/rest/v1/hope_workspaces?on_conflict=area',{method:'POST',preferences:'resolution=merge-duplicates',body:{
    area:'design',payload:{...rows[0]?.payload,technicalNotes:data.notes},updated_at:new Date().toISOString()
  }});
  say('تم حفظ ملاحظات التطوير.');
});
const chatPath='/functions/v1/hope-development-chat';
function persistChat(){
  if(!chatStorageKey) return;
  try{
    localStorage.setItem(chatStorageKey,JSON.stringify({
      messages:chatMessages.slice(-60),
      draft:q('chatForm').elements.message.value
    }));
  }catch {}
}
async function openChat(){
  q('chatForm').hidden=false;
  q('sendChat').disabled=true;
  try{
    if(!chatStorageKey){
      const user=await secured('/auth/v1/user');
      chatStorageKey='hope-development-chat:'+user.id;
      const saved=JSON.parse(localStorage.getItem(chatStorageKey)||'{}');
      if(Array.isArray(saved.messages)){
        chatMessages=saved.messages.filter(message=>['user','assistant'].includes(message?.role)&&typeof message.content==='string').slice(-60);
      }
      if(typeof saved.draft==='string') q('chatForm').elements.message.value=saved.draft.slice(0,8000);
      renderChat();
    }
  }catch {}
  loadProjectContext();
  await prepareChat();
}
async function loadProjectContext(){
  const box=q('projectContextBody');
  if(chatContext) return;
  try{
    const result=await fetch('/supabase/functions/hope-development-chat/project-context.json');
    if(!result.ok) throw Error('Context unavailable');
    chatContext=await result.json();
    const element=(tag,text)=>{
      const node=document.createElement(tag);
      node.textContent=text;
      return node;
    };
    box.replaceChildren(element('p',chatContext.baseline),element('p',chatContext.deployment));
    for(const [title,values] of [['الأقسام',chatContext.areas],['ملفات المشروع',chatContext.files],['حالة الربط والصلاحيات',chatContext.constraints]]){
      const list=document.createElement('ul');
      for(const value of values) list.append(element('li',Array.isArray(value)?value.join(' · '):value));
      box.append(element('h3',title),list);
    }
  }catch {box.textContent='تعذّر تحميل مرجع المشروع.';}
}
function showChatStatus(message){q('chatStatus').textContent=message;}
function renderChat(){
  const items=chatMessages.map(message=>{
    const item=document.createElement('li');
    item.dataset.role=message.role;
    const title=document.createElement('strong');
    title.textContent=message.role==='user'?'أنت':'المساعد';
    item.append(title,document.createTextNode(message.content));
    return item;
  });
  const list=q('chatMessages');
  list.replaceChildren(...items);
  list.scrollTop=list.scrollHeight;
}
function resetChat(){
  chatRequest++;
  chatMessages=[];
  q('chatForm').reset();
  showChatStatus('');
  renderChat();
}
async function prepareChat(){
  q('sendChat').disabled=true;
  q('chatSetup').hidden=true;
  showChatStatus('جارٍ التحقق من اتصال المساعد…');
  try{
    const state=await secured(chatPath,{method:'POST',body:{action:'status'}});
    q('sendChat').disabled=!state.configured;
    q('chatSetup').hidden=state.configured;
    showChatStatus(state.configured?'':'مساعد التطوير بانتظار إعداد مفتاح OpenAI API.');
  }catch {showChatStatus('تعذّر التحقق من اتصال المساعد. حدّث الصفحة للمحاولة مجددًا.');}
}
q('chatForm').onsubmit=async event=>{
  event.preventDefault();
  const input=q('chatForm').elements.message;
  const button=event.submitter;
  const message=input.value.trim();
  if(!message||button.disabled) return;
  const request=++chatRequest;
  const pending={role:'user',content:message};
  const context=[...chatMessages.slice(-10),pending];
  chatMessages.push(pending);
  renderChat();
  input.value='';
  button.disabled=true;
  showChatStatus('المساعد يكتب الآن…');
  try{
    const result=await secured(chatPath,{method:'POST',body:{messages:context}});
    if(request!==chatRequest) return;
    chatMessages.push({role:'assistant',content:result.text.slice(0,8000)});
    persistChat();
    renderChat();
    showChatStatus('');
  }catch(error){
    if(request!==chatRequest) return;
    chatMessages.pop();
    renderChat();
    if(!input.value) input.value=message;
    persistChat();
    showChatStatus(error.code==='openai_not_configured'?'يلزم إعداد مفتاح OpenAI API.':'تعذّر الحصول على رد. حاول مجددًا.');
  }finally{button.disabled=false;}
};
q('clearChat').onclick=()=>{
  if((chatMessages.length||q('chatForm').elements.message.value)&&!confirm('هل تريد مسح المحادثة الحالية من هذا المتصفح؟')) return;
  resetChat();
  persistChat();
};
q('retryChat').onclick=prepareChat;
q('chatForm').elements.message.oninput=persistChat;
q('chatFile').onchange=async event=>{
  const file=event.target.files[0];
  event.target.value='';
  if(!file) return;
  if(file.size>64000) {showChatStatus('اختر ملفًا نصيًا أصغر، أو الصق المقتطف المطلوب.');return;}
  const field=q('chatForm').elements.message;
  try{
    const text=await file.text();
    if(text.includes(String.fromCharCode(0))) throw Error('Not text');
    const combined=[field.value,'الملف: '+file.name,text].filter(Boolean).join('\n\n');
    if(combined.length>8000){showChatStatus('الطلب مع المقتطف يتجاوز 8000 حرف. الصق الجزء المعني فقط.');return;}
    field.value=combined;
    persistChat();
    field.focus();
  }catch {showChatStatus('تعذّر قراءة المقتطف النصي.');}
};
q('exportChat').onclick=()=>{
  const content=chatMessages.map(message=>(message.role==='user'?'أنت':'المساعد')+'\n'+message.content).join('\n\n');
  const draft=q('chatForm').elements.message.value;
  if(!content&&!draft){showChatStatus('المحادثة فارغة.');return;}
  const url=URL.createObjectURL(new Blob([content,draft?'\n\nمسودة\n'+draft:''],{type:'text/plain;charset=utf-8'}));
  const download=document.createElement('a');
  download.href=url;
  download.download='nabni-alamal-development-chat.txt';
  download.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
};
q('signupToggle').onclick=()=>{q('signupForm').hidden=!q('signupForm').hidden;};
q('logout').onclick=async ()=>{
  try {await secured('/auth/v1/logout',{method:'POST',body:{}});}catch{}
  persistChat();
  chatStorageKey=null;
  resetChat();
  saveSession(null);
  say('تم تسجيل الخروج.');
  await route();
};
q('googleLogin').onclick=()=>{
  location.assign(supabaseUrl+'/auth/v1/authorize?provider=google&redirect_to='+encodeURIComponent(location.origin+'/login.html'));
};
async function start(){
  const fragment=new URLSearchParams(location.hash.slice(1));
  if(fragment.has('access_token')||fragment.has('error')){
    history.replaceState(null,'',location.pathname);
    if(fragment.has('access_token')){
      const auth={access_token:fragment.get('access_token'),refresh_token:fragment.get('refresh_token')};
      await call('/auth/v1/user',{token:auth.access_token});
      saveSession(auth);
    } else say('تعذّر تأكيد الدخول. اطلب رابط تفعيل جديدًا.');
  } else {
    try {session=JSON.parse(sessionStorage.getItem(sessionKey)||'null');}
    catch {saveSession(null);}
  }
  await route();
  if(embeddedChat) return;
  const settings=await call('/auth/v1/settings');
  q('googleLogin').hidden=!settings.external?.google;
  if(settings.external?.phone) q('identityLabel').textContent='البريد الإلكتروني أو الهاتف الدولي';
  q('signupToggle').hidden=!!settings.disable_signup;
}
start().catch(()=>{if(!embeddedChat) q('signedOut').hidden=false;say('تعذّر إكمال الاتصال. حدّث الصفحة للمحاولة مجددًا.');});
