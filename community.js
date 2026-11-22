/* Separate remote and local guest books. The submit button always states its audience. */
(() => {
  'use strict';
  const KEY='mall-walk-personal-notes-v1';
  const get=id=>document.getElementById(id);
  const form=get('wall-form'),name=get('wall-name'),body=get('wall-text'),send=get('wall-send'),list=get('wall-list');
  const canConnect=/^https?:$/.test(location.protocol);
  let scope='checking',busy=false,reading=0;
  function status(text,error=false){const out=get('wall-status');out.textContent=text;out.dataset.error=String(error);}
  function localNotes(){
    const stored=JSON.parse(localStorage.getItem(KEY)||'[]');
    return Array.isArray(stored)?stored:[];
  }
  function setScope(value){
    scope=value;send.disabled=busy||value==='checking';
    get('wall-reconnect').hidden=value!=='local'||!canConnect;
    send.textContent=value==='local'?'保存到本机':'发表到现场留言墙';
    get('wall-heading').textContent=value==='local'?'这台设备的留言':'最近的现场留言';
    get('wall-scope').textContent=value==='remote'
      ?'点击发表后，本场服务的其他游客可以看到你填写的昵称和留言。'
      :'当前为本机留言簿，内容仅存于这个浏览器。';
  }
  function show(posts){
    list.replaceChildren();
    if(!posts.length){
      const empty=document.createElement('p');empty.className='wall-empty';
      empty.textContent=scope==='local'?'这台设备还没有留言，你可以记下今天最喜欢的一站。':'还没有人留言，欢迎写下第一条亲身体验。';list.append(empty);return;
    }
    for(const p of posts){
      const article=document.createElement('article');article.className='wall-note';
      const header=document.createElement('header'),dot=document.createElement('span'),author=document.createElement('b'),time=document.createElement('time');
      dot.className='wall-dot';dot.setAttribute('aria-hidden','true');dot.textContent=Array.from(String(p.nickname))[0]||'✳';
      author.textContent=p.nickname;const date=new Date(p.at);
      if(!Number.isNaN(date.getTime())){
        time.dateTime=date.toISOString();time.textContent=date.toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
      }
      const identity=document.createElement('div');identity.append(author,time);header.append(dot,identity);
      const text=document.createElement('p');text.textContent=p.text;article.append(header,text);list.append(article);
    }
  }
  async function request(method,payload){
    const res=await fetch('/api/wall',{method,headers:payload?{'Content-Type':'application/json'}:{},
      body:payload?JSON.stringify(payload):undefined,cache:'no-store',signal:AbortSignal.timeout(6000)});
    if(!res.ok)throw new Error('留言服务 '+res.status);
    return res.json();
  }
  async function refresh(initial=false){
    const version=++reading;
    if(canConnect&&scope!=='local'){
      try{
        const result=await request('GET');
        if(version!==reading)return;
        if(!Array.isArray(result.posts))throw new Error('格式异常');
        setScope('remote');show(result.posts);
        status(initial?'':'现场留言已刷新。');
        return;
      }catch{
        if(version!==reading)return;
        if(scope==='remote'){status('暂时无法刷新现场留言。请检查连接后重试。',true);return;}
      }
    }
    setScope('local');
    try{show(localNotes());}
    catch{show([]);status('无法读取本机留言存储，请检查浏览器存储设置。',true);return;}
    if(canConnect && initial)status('当前没有连接现场留言服务。');
    else if(!initial)status('本机留言已刷新。');
  }
  function cap(input,limit){const chars=Array.from(input.value);if(chars.length>limit)input.value=chars.slice(0,limit).join('');}
  body.addEventListener('input',()=>{cap(body,240);get('wall-counter').textContent=Array.from(body.value).length+' / 240';});
  name.addEventListener('input',()=>cap(name,18));
  get('wall-reconnect').onclick=()=>{if(busy)return;scope='checking';send.disabled=true;get('wall-reconnect').hidden=true;status('正在检查现场服务…');refresh(true);};
  get('wall-refresh').onclick=()=>{if(!busy)refresh();};
  form.onsubmit=async event=>{
    event.preventDefault();
    if(busy||scope==='checking')return;
    const nickname=name.value.trim(),text=body.value.trim();
    if(!nickname||!text){status('请填写昵称和留言，不能只写空格。',true);return;}
    const mode=scope;
    reading++;busy=true;send.disabled=true;get('wall-refresh').disabled=true;status(mode==='remote'?'正在发表…':'正在保存…');
    try{
      if(mode==='remote'){
        await request('POST',{nickname,text});body.value='';get('wall-counter').textContent='0 / 240';
        try{const result=await request('GET');if(!Array.isArray(result.posts))throw new Error();show(result.posts);status('已发表到现场留言墙。');}
        catch{status('留言已发表，列表稍后可刷新。');}
      }else{
        const posts=localNotes();posts.unshift({id:globalThis.crypto?.randomUUID?.()||String(Date.now()),nickname,text,at:new Date().toISOString()});
        localStorage.setItem(KEY,JSON.stringify(posts));show(posts);body.value='';get('wall-counter').textContent='0 / 240';status('已保存到这台设备。');
      }
    }catch{status(mode==='local'?'未能保存。请检查浏览器存储设置，草稿仍在。':'未收到发表确认。请先刷新查看留言，再决定是否重试。',true);}
    finally{busy=false;send.disabled=false;get('wall-refresh').disabled=false;}
  };
  refresh(true);
})();
