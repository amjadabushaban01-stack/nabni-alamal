'use strict';
function openDevelopmentChat(){
  tab('developmentChat');
  const frame=document.getElementById('developmentChatFrame');
  if(!frame.hasAttribute('src')) frame.src='/login.html?view=chat';
}

(async()=>{
  if(location.hash!=='#staff-admin') return;
  history.replaceState(null,'',location.pathname);
  try{
    const {access_token}=JSON.parse(sessionStorage.getItem('hope-render-auth-v1')||'{}');
    if(!access_token) throw Error('Missing session');
    const response=await fetch('https://mdayxgtxannasfmfhnva.supabase.co/rest/v1/hope_staff?select=role&enabled=eq.true',{
      headers:{apikey:"sb_publishable_a7zd4PFpYf2-YtJstDOWtg_KKGJdL0t",Authorization:'Bearer '+access_token}
    });
    if(!response.ok||(await response.json())[0]?.role!=='admin') throw Error('Missing access');
    openAdmin();
  }catch {
    location.replace('/login.html');
  }
})();
