const siteOrigin = 'https://nabni-alamal.onrender.com';
const projectUrl = Deno.env.get('SUPABASE_URL') ?? '';
const projectKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const model = Deno.env.get('OPENAI_MODEL') || 'gpt-5-mini';

function respond(body: object, status = 200) {
  return Response.json(body, { status, headers: {
    'Access-Control-Allow-Origin':siteOrigin,
    'Cache-Control':'no-store',
    'Vary':'Origin'
  }});
}

Deno.serve(async (request) => {
  if (request.headers.get('Origin') !== siteOrigin) return respond({error:'origin_denied'},403);
  if (request.method === 'OPTIONS') return new Response(null,{headers:{
    'Access-Control-Allow-Origin':siteOrigin,
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Access-Control-Allow-Headers':'authorization, apikey, content-type',
    'Vary':'Origin'
  }});
  if (request.method !== 'POST') return respond({error:'method_denied'},405);
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return respond({error:'sign_in_required'},401);

  try {
    const headers = {authorization,apikey:projectKey};
    const userResponse = await fetch(projectUrl+'/auth/v1/user',{headers});
    if (!userResponse.ok) return respond({error:'sign_in_required'},401);
    const user = await userResponse.json();
    const query = new URLSearchParams({select:'role',user_id:'eq.'+user.id,enabled:'eq.true',limit:'1'});
    const accessResponse = await fetch(projectUrl+'/rest/v1/hope_staff?'+query,{headers});
    if (!accessResponse.ok) return respond({error:'access_unavailable'},502);
    const roles = await accessResponse.json();
    if (!['admin','developer'].includes(roles[0]?.role)) return respond({error:'role_denied'},403);

    if (Number(request.headers.get('Content-Length'))>90000) return respond({error:'invalid_message'},413);
    const raw = await request.text();
    if (raw.length>90000) return respond({error:'invalid_message'},413);
    let body;
    try { body=JSON.parse(raw); } catch { return respond({error:'invalid_message'},400); }
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (body?.action==='status') return respond({configured:!!apiKey});
    if (!apiKey) return respond({error:'openai_not_configured'},503);
    const messages = body?.messages;
    if (!Array.isArray(messages)||!messages.length||messages.length>11||
      messages.at(-1)?.role!=='user'||
      messages.some((m)=>!['user','assistant'].includes(m?.role)||typeof m?.content!=='string'||!m.content.trim()||m.content.length>8000)) {
      return respond({error:'invalid_message'},400);
    }
    const input = messages.map(({role,content})=>({role,content}));
    const result = await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},
      signal:AbortSignal.timeout(45000),
      body:JSON.stringify({
        model, input, store:false, max_output_tokens:2200,
        reasoning:{effort:'minimal'},
        instructions:'أنت مساعد تطوير لموقع جمعية نبني الأمل على nabni-alamal.onrender.com. ساعد بالعربية في التخطيط والمراجعة وكتابة النصوص واقتراح تعديلات الكود بناءً على المواد التي يرسلها المستخدم. اذكر الملفات أو المقتطفات الناقصة عند الحاجة. لا تدّع أنك تستطيع قراءة الملفات أو تغيير الموقع أو النشر. وجّه المستخدم إلى التحقق من المقترحات قبل تطبيقها.'
      })
    });
    if (!result.ok) return respond({error:result.status===429?'openai_limit':'openai_unavailable'},502);
    const data = await result.json();
    const text = (data.output||[]).filter((item)=>item.type==='message')
      .flatMap((item)=>item.content||[]).filter((part)=>part.type==='output_text')
      .map((part)=>part.text).join('\n').trim();
    if (!text) return respond({error:'empty_response'},502);
    return respond({text});
  } catch {
    return respond({error:'service_unavailable'},502);
  }
});
