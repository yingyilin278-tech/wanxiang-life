/* Visitor flow for 万象生活遇. All gallery, chat and camera actions are visitor-initiated. */
(() => {
  'use strict';
  const KEY = 'mall-walk-journey-v1';
  const INTERESTS = ['阅读', '咖啡', '潮玩', '手作', '甜品', '运动', '艺术', '自然'];
  const PACES = ['慢慢逛', '随心逛', '想多逛'];
  const MAX_VISIT_MINUTES = 720;
  const MIN_STOP_MINUTES = 7;
  const SHOPS = [
    { id:'paper', name:'纸间书房', floor:1, tags:['阅读','艺术'], stay:12, x:18, y:61 },
    { id:'coffee', name:'靠窗咖啡', floor:1, tags:['咖啡','阅读'], stay:14, x:41, y:72 },
    { id:'toy', name:'奇想玩具局', floor:2, tags:['潮玩','手作'], stay:12, x:49, y:43 },
    { id:'craft', name:'慢作工坊', floor:2, tags:['手作','艺术'], stay:18, x:71, y:46 },
    { id:'dessert', name:'云朵甜品', floor:3, tags:['甜品','咖啡'], stay:13, x:75, y:27 },
    { id:'sport', name:'起跳运动社', floor:3, tags:['运动','潮玩'], stay:16, x:39, y:26 },
    { id:'art', name:'回声画廊', floor:2, tags:['艺术','阅读'], stay:15, x:24, y:40 },
    { id:'garden', name:'屋顶花园', floor:4, tags:['自然','运动'], stay:14, x:65, y:11 }
  ];
  const IP = [
    ['卷卷','长发女生'],['小栗','长发女生'],['桃桃','短发女生'],['阿橙','短发女生'],
    ['云杉','长发男生'],['阿浪','长发男生'],['青豆','短发男生'],['小墨','短发男生']
  ];
  const DEMO = [
    ['d1','阿麦',['阅读','艺术','咖啡'],'慢慢逛',60,'paper'],
    ['d2','汽水',['潮玩','手作','运动'],'想多逛',90,'toy'],
    ['d3','小芋',['甜品','咖啡','手作'],'随心逛',60,'dessert'],
    ['d4','山雀',['自然','运动','摄影'],'慢慢逛',90,'garden'],
    ['d5','阿禾',['艺术','手作','潮玩'],'随心逛',45,'art']
  ].map(([id,nickname,interests,pace,minutes,destination]) => ({id,nickname,interests,pace,minutes,destination,demo:true}));
  const shop = id => SHOPS.find(place => place.id === id);
  const avatarPath = id => 'assets/ip-' + id + '.webp';
  const h = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const now = () => new Date().toISOString();
  const timeOf = iso => new Date(iso).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});
  const signedLocalDate = () => {
    const date = new Date();
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0,16);
  };
  const flow = () => document.getElementById('flow');
  const isServer = () => /^https?:$/.test(location.protocol);
  let state, livePeers = [], liveMessages = [], liveNote = '', liveTimer = null;
  let liveTab = false, chatBusy = false, checkinScan = null, reportBusy = false;
  const conversations = new Map();
  let renderVersion = 0, lastPoll = 0, redeemBusy = false;

  function rosterFor(count,source=[],fallbackNames=[],firstAvatar=1) {
    const taken=new Set(), list=[];
    for(let i=0;i<count;i++){
      const raw=source[i]||{}, preferred=Number(raw.avatarId||(i===0?firstAvatar:i+1));
      const avatarId=Number.isInteger(preferred)&&preferred>=1&&preferred<=IP.length&&!taken.has(preferred)
        ?preferred:IP.findIndex((_,j)=>!taken.has(j+1))+1;
      taken.add(avatarId);
      list.push({name:String(raw.name??fallbackNames[i]??'').trim().slice(0,18),avatarId});
    }
    return list;
  }
  function syncLeader(s){const first=s.members[0];s.nickname=first.name;s.avatarId=s.ip=first.avatarId;}
  function memberNames(){return state.members.map(m=>m.name).filter(Boolean).join('、');}
  function newJourney(mode) {
    return {
      version:1, id:globalThis.crypto?.randomUUID?.()||('trip-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12)), mode, step:'profile', nickname:'', title:'', date:signedLocalDate(),
      interests:[], minutes:60, pace:'随心逛', destination:'', groupType:'朋友',
      avatarId:1, ip:1, members:rosterFor(2), avatarConfirmed:[false,false], avatarMember:0, buddy:null, token:'', game:null, returnScanned:false, scans:[],
      excluded:[], preferred:[], route:[], feedback:'', finish:null, rewardId:'', redemption:null, photos:[], demoThreads:{}, aiText:''
    };
  }
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (!raw || raw.version !== 1 || !['solo','group'].includes(raw.mode)) return null;
      const s = Object.assign(newJourney(raw.mode), raw);
      if (!['profile','match','avatar','game','report','route','finish','album'].includes(s.step)) s.step='profile';
      const existing=Array.isArray(raw.members)&&raw.members.length>0;
      const count=s.mode==='group'&&existing?Math.max(2,Math.min(8,raw.members.length)):2;
      const partner=s.buddy?.nickname||(s.step==='profile'?'':'同行伙伴');
      s.members=rosterFor(count,existing?raw.members:[],[raw.nickname||'',partner],raw.avatarId||raw.ip||1);
      s.avatarConfirmed=Array.from({length:count},(_,i)=>existing?Boolean(raw.avatarConfirmed?.[i]):i===0&&['game','report','route','finish','album'].includes(s.step));
      s.avatarMember=Math.max(0,Math.min(count-1,Number(raw.avatarMember)||0));
      syncLeader(s);
      return s;
    } catch { return null; }
  }
  function save() {
    try { localStorage.setItem(KEY,JSON.stringify(state)); return true; }
    catch {
      // Safari private mode or storage full: preserve scores, visits and progress before optional photos.
      try {
        const compact = {...state, photos:[], game:state.game && {...state.game,photo:undefined},gameDraft:state.gameDraft && {...state.gameDraft,photo:undefined},finish:state.finish && {...state.finish,keepsake:undefined}};
        localStorage.setItem(KEY,JSON.stringify(compact));
      } catch { /* In-memory session remains available. */ }
      return false;
    }
  }
  function stopWork() {
    if (liveTimer !== null) { clearInterval(liveTimer); liveTimer = null; }
    checkinScan?.close();
    window.MallGames?.dispose?.();
  }
  function enter() {
    const home = document.getElementById('home');
    if (home) home.hidden = true;
    flow().hidden = false;
    flow().style.removeProperty('display');
  }
  function showHome() {
    save(); stopWork(); renderVersion++;
    flow().hidden = true;
    window.showMallHome?.();
  }
  function go(step) {
    stopWork(); state.step = step; save(); render();
  }
  function start(mode,count=2) {
    if (!['solo','group'].includes(mode)) return;
    if (load() && !window.confirm('开始新旅程会替换本机保存的上一份旅程。确定开始吗？')) return;
    stopWork(); state = newJourney(mode); liveTab = false; livePeers=[]; liveMessages=[]; liveNote=''; conversations.clear();
    if(mode==='group'&&Number.isInteger(count)&&count>=3&&count<=8){state.members=rosterFor(count);state.avatarConfirmed=state.members.map(()=>false);}
    enter(); go('profile');
  }
  function resume({skipGames=false}={}) {
    const saved = load();
    if (!saved) return false;
    state = saved;
    if(skipGames&&state.step==='game'){
      completeGames(state.gameDraft||{poses:[],poseTotal:null,poseSkipped:4,handScore:null});
      return true;
    }
    save(); enter(); liveTab=Boolean(state.buddy && !state.buddy.demo); render(); return true;
  }
  const stepName = {profile:'入场登记',match:'找到搭子',avatar:'认领形象',game:'装置互动',report:'漫游报告',route:'路线集章',finish:'返馆签名',album:'旅程纪念'};
  function stages() {
    return state.mode === 'solo'
      ? ['profile','match','avatar','game','report','route','finish','album']
      : ['profile','avatar','game','report','route','finish','album'];
  }
  function top(title, subtitle, inner, prev) {
    const steps=stages(), i=steps.indexOf(state.step);
    flow().innerHTML = `<div class="j-shell">
      <nav class="j-nav"><button class="j-home" data-j="home" aria-label="保存并回到首页"><span class="j-brandmark" aria-hidden="true">✳</span>万象生活遇</button><span>${h(state.mode==='solo'?'找搭子漫游':'亲友同行')}<i></i>${h(stepName[state.step])}</span></nav>
      <div class="j-progress" aria-label="第 ${i+1} 步，共 ${steps.length} 步">${steps.map((step,n)=>`<span class="${n<=i?'is-done':''}" title="${stepName[step]}"></span>`).join('')}</div>
      <header class="j-head"><div><p class="j-kicker">${String(i+1).padStart(2,'0')} / ${String(steps.length).padStart(2,'0')} · ${stepName[state.step]}</p><h1>${title}</h1><p class="j-sub">${subtitle}</p></div>${prev?`<button class="j-link" data-j="back" data-prev="${prev}">返回上一步</button>`:''}</header>
      ${inner}
      <footer class="j-foot"><span>万象生活遇 · 商场漫游体验馆</span><button data-j="home">保存并回首页</button></footer>
    </div>`;
    for (const btn of flow().querySelectorAll('[data-j="home"]')) btn.onclick=showHome;
    const back = flow().querySelector('[data-j="back"]');
    if(back) back.onclick=()=>go(back.dataset.prev);
  }
  function render(scroll=true) {
    renderVersion++;
    enter();
    if(scroll) window.scrollTo({top:0,behavior:'instant'});
    const page = {profile:profile,match:match,avatar:avatars,game:games,report:report,route:route,finish:finish,album:album}[state.step];
    page?.();
  }
  function el(id) { return document.getElementById(id); }
  function status(id, message, error=false) {
    const node=el(id);
    if(node) { node.textContent=message; node.dataset.error=String(error); }
  }
  function options(list, name, selected) {
    return list.map(value=>`<label class="j-chip"><input type="radio" name="${name}" value="${h(value)}" ${selected===value?'checked':''}><span>${h(value)}</span></label>`).join('');
  }
  function durationField() {
    return `<div class="j-duration"><label class="j-field">逛街时长
      <span class="j-duration-input"><input name="minutes" type="number" inputmode="numeric" min="1" max="${MAX_VISIT_MINUTES}" step="1" required value="${h(state.minutes)}" aria-describedby="j-duration-help"><span>分钟</span></span></label>
      <small id="j-duration-help">输入 1 至 ${MAX_VISIT_MINUTES} 的整数，例如 75。</small></div>`;
  }
  function profile() {
    const solo=state.mode==='solo';
    top(solo?'先认识一下你。':'一起，往哪儿逛？',solo?'留下你的兴趣和时间，看看谁适合和你一起出发。':'把同行人的兴趣和时间放在一起，找出今天都想走的路线。',`
      <form id="j-profile" class="j-form">
        <div class="j-identity"><div class="j-sticker" aria-hidden="true">✳</div><div><b>${solo?'一个人入场':'已经有同行人'}</b><p>${solo?'按偏好寻找搭子，可先和示例搭子体验。':'直接规划同行路线，朋友、情侣和家人都可以参与。'}</p></div></div>
        ${solo?'':`<fieldset class="j-group-size"><legend>今天几个人一起逛？</legend><div class="j-party-choices">
          <button data-party="duo" type="button" class="j-pill" aria-pressed="${state.members.length===2}">二人同行</button>
          <button data-party="many" type="button" class="j-pill" aria-pressed="${state.members.length>2}">多人同行 · 3–8 人</button>
          ${state.members.length>2?`<label>同行人数 <select id="j-group-count" aria-label="同行人数">${[3,4,5,6,7,8].map(n=>`<option value="${n}" ${n===state.members.length?'selected':''}>${n} 人</option>`).join('')}</select></label>`:''}</div></fieldset>`}
        <div class="j-cols j-member-fields"><label class="j-field">${solo?'你的昵称':'第 1 位 · 你的昵称'}<input name="nickname" data-member-name="0" maxlength="18" required placeholder="大家怎么称呼你？" value="${h(state.nickname)}"></label>
        ${solo?'':state.members.slice(1).map((m,i)=>`<label class="j-field">第 ${i+2} 位 · 同行昵称<input data-member-name="${i+1}" name="member-${i+1}" maxlength="18" required placeholder="为这位同行者起个昵称" value="${h(m.name)}"></label>`).join('')}</div>
        <label class="j-field">旅程名字<input name="title" maxlength="30" placeholder="例如，周末放风计划" value="${h(state.title)}"></label>
        <div class="j-cols"><label class="j-field">出发日期和时间<input type="datetime-local" name="date" required value="${h(state.date)}"></label>
        <label class="j-field">最想去的一站<select name="destination" required><option value="">选一个目的地</option>${SHOPS.map(s=>`<option value="${s.id}" ${s.id===state.destination?'selected':''}>L${s.floor} · ${s.name}</option>`).join('')}</select></label></div>
        ${solo?'':`<fieldset><legend>跟谁一起？</legend><div class="j-chips">${options(['朋友','家人','亲子','情侣'],'groupType',state.groupType)}</div></fieldset>`}
        <fieldset><legend>${solo?'你喜欢什么？':'你们共同喜欢什么？'} <small>可多选</small></legend>
        <div class="j-chips">${INTERESTS.map(i=>`<label class="j-chip"><input type="checkbox" name="interest" value="${i}" ${state.interests.includes(i)?'checked':''}><span>${i}</span></label>`).join('')}</div></fieldset>
        <div class="j-cols">${durationField()}
        <fieldset><legend>喜欢什么节奏？</legend><div class="j-chips">${options(PACES,'pace',state.pace)}</div></fieldset></div>
        <p id="j-profile-status" role="status" class="j-status"></p>
        <div class="j-actions"><button class="j-primary" type="submit">${solo?'看看我的搭子':'为每人选 IP 形象'} <b>↗</b></button></div>
      </form>`);
    const form=el('j-profile');
    function readForm() {
      const f=new FormData(form);
      return {nickname:String(f.get('nickname')||'').trim(),title:String(f.get('title')||'').trim(),date:String(f.get('date')||''),destination:String(f.get('destination')||''),groupType:String(f.get('groupType')||state.groupType),interests:f.getAll('interest').map(String),minutes:f.get('minutes')===''?'':Number(f.get('minutes')),pace:String(f.get('pace'))};
    }
    function readMembers(){
      for(const field of form.querySelectorAll('[data-member-name]'))state.members[Number(field.dataset.memberName)].name=field.value.trim();
      syncLeader(state);
    }
    form.oninput=()=>{ Object.assign(state,readForm());readMembers();save(); };
    function resizeParty(count){
      if(count===state.members.length)return;
      Object.assign(state,readForm());readMembers();
      state.members=rosterFor(count,state.members);state.avatarConfirmed=state.members.map((_,i)=>Boolean(state.avatarConfirmed[i]));
      state.avatarMember=Math.min(count-1,state.avatarMember);syncLeader(state);save();render(false);
    }
    for(const b of form.querySelectorAll('[data-party]'))b.onclick=()=>resizeParty(b.dataset.party==='duo'?2:Math.max(3,state.members.length));
    if(el('j-group-count'))el('j-group-count').onchange=e=>resizeParty(Number(e.target.value));
    form.onsubmit=e=>{
      e.preventDefault(); const fields=readForm();readMembers();
      if(!solo&&state.members.some(m=>!m.name)){status('j-profile-status','请为每位同行者填写昵称。',true);return;}
      if(!fields.nickname || !fields.interests.length) { status('j-profile-status',!fields.nickname?'请输入昵称。':'至少选一个感兴趣的方向。',true); return; }
      if(state.token && state.sharedProfileKey!==profileKey(fields)){
        state.retiredToken=state.token;state.token='';state.buddy=null;livePeers=[];conversations.clear();
        liveNote='资料已更新，再次加入现场名单时会替换之前的资料。';
      }
      Object.assign(state,fields);
      if(!state.title) state.title=solo?state.nickname+'的漫游日':state.members.length+' 人漫游日';
      state.route=[]; state.aiText='';
      go(solo?'match':'avatar');
    };
  }
  function profileKey(person){
    return JSON.stringify([person.nickname,person.interests,person.minutes,person.pace,person.destination]);
  }
  function matchDetail(p) {
    const theirs=Array.isArray(p.interests)?p.interests:[];
    const common=state.interests.filter(i=>theirs.includes(i));
    const interest=Math.round(50*common.length/Math.max(1,state.interests.length));
    const time=Math.max(0,Math.round(20*(1-Math.abs(state.minutes-Number(p.minutes||60))/90)));
    const pace=Math.max(0,15-7*Math.abs(PACES.indexOf(state.pace)-PACES.indexOf(p.pace)));
    const d=shop(p.destination), own=shop(state.destination);
    const place=d && own ? d.id===own.id?15:d.tags.some(t=>own.tags.includes(t))?8:0:0;
    return {total:interest+time+pace+place, interest,time,pace,place,common};
  }
  async function api(path,method='GET',payload) {
    const headers={'Content-Type':'application/json'};
    if(state.token) headers.Authorization='Bearer '+state.token;
    const res=await fetch('/api/'+path,{method,headers,body:payload?JSON.stringify(payload):undefined,cache:'no-store',signal:AbortSignal.timeout(path==='report'?42000:9000)});
    if(!res.ok) { const error=new Error('HTTP '+res.status); error.status=res.status; throw error; }
    return res.json();
  }
  function sampleReply(text,peer) {
    const destination=shop(peer.destination)?.name||'体验馆';
    if(/哪|路线|去|想逛/.test(text)) return '我想去'+destination+'，也愿意陪你去'+(shop(state.destination)?.name||'你选的地方')+'。';
    if(/兴趣|喜欢|爱好/.test(text)) return '我喜欢'+peer.interests.join('、')+'，你呢？';
    if(/多久|时间|分钟|慢|快/.test(text)) return '我大约有'+peer.minutes+'分钟，喜欢'+peer.pace+'。';
    if(/见|在哪|集合/.test(text)) return '可以先在体验馆圆桌集合，一起做开场游戏。';
    return '收到！我叫'+peer.nickname+'，可以和我聊聊想去哪儿、喜欢什么，或者在哪里集合。';
  }
  function threadMarkup(messages) {
    return messages.length?messages.map(m=>`<p class="j-bubble ${m.mine?'mine':''}"><small>${m.mine?'你':h(state.buddy.nickname)}</small>${h(m.text)}</p>`).join(''):'<p class="j-hint">还没有消息。打个招呼，商量第一站吧。</p>';
  }
  function peerRows() {
    const src=liveTab?livePeers:DEMO;
    const sorted=src.map(p=>({p,m:matchDetail(p)})).sort((a,b)=>Number(Boolean(b.p.lastIncomingAt))-Number(Boolean(a.p.lastIncomingAt))||b.m.total-a.m.total);
    return sorted.map(({p,m})=>`<article class="j-peer">
      <span class="j-peer-face" aria-hidden="true">${h(Array.from(p.nickname||'搭')[0])}</span>
      <div><b>${h(p.nickname)}</b><p>${h(p.interests.join(' · '))} · ${Number(p.minutes)} 分钟</p>
      <details><summary>为什么是 ${m.total} 分？</summary>兴趣 ${m.interest}/50，时间 ${m.time}/20，节奏 ${m.pace}/15，目的地 ${m.place}/15。</details>
      ${p.lastIncomingAt?'<small>对方发过消息</small>':''}</div>
      <button class="j-pill" data-peer="${h(p.id)}">${state.buddy?.id===p.id?'已选择':'聊一聊'}</button>
      </article>`).join('');
  }
  function match() {
    const p=state.buddy;
    const chat=p?`<section class="j-paper j-chat"><h2>和${h(p.nickname)}聊聊</h2><p class="j-hint">${p.demo?'这是一位示例搭子，回复由本地规则生成。':'消息会发送给已加入本场体验的对方。'}</p>
      <div id="j-thread" class="j-thread" role="log" aria-live="polite">${threadMarkup(p.demo?(state.demoThreads[p.id]||[]):(conversations.get(p.id)||[]))}</div>
      <form id="j-chat-form" class="j-chat-entry"><input name="text" maxlength="300" required aria-label="给搭子发消息" placeholder="问问对方想去哪里…"><button type="submit" class="j-pill">发送</button></form><p id="j-chat-note" class="j-status" role="status"></p>
      <button class="j-primary" id="j-confirm-buddy">选好搭子，去选形象 <b>↗</b></button></section>`:'';
    top('找到同频的人。','兴趣占 50 分，时间占 20 分，逛街节奏和目的地各占 15 分。',`
      <section class="j-paper"><div class="j-tabs" role="group" aria-label="匹配对象来源"><button id="j-demo" aria-pressed="${!liveTab}">示例搭子库</button><button id="j-live" aria-pressed="${liveTab}">现场搭子</button></div>
      <p class="j-hint">${liveTab?'加入后，现场游客可看到你的昵称、兴趣、时间、节奏和目的地。':'示例人物用于体验匹配和聊天，这些人物不会收到你的消息。'}</p>
      ${liveTab&&!state.token?`<button class="j-pill" id="j-join">同意展示资料并加入</button>`:''}
      ${liveTab&&state.token?'<button class="j-pill" id="j-leave">退出现场搭子库</button>':''}
      <div class="j-peer-list" id="j-peer-list">${peerRows()}</div><p id="j-live-note" class="j-status" role="status">${h(liveNote)}</p></section>${chat}`,'profile');
    el('j-demo').onclick=()=>{ stopWork(); liveTab=false; liveNote=''; state.buddy=null; save(); render(false); };
    el('j-live').onclick=()=>{ stopWork(); liveTab=true; liveNote=isServer()?'':'现场匹配需要用本项目的服务地址打开，或切换示例搭子库继续。'; state.buddy=null; save(); render(false); };
    el('j-peer-list').onclick=e=>{
      const button=e.target.closest('[data-peer]'); if(!button)return;
      state.buddy=(liveTab?livePeers:DEMO).find(p=>String(p.id)===button.dataset.peer)||null; save(); stopWork(); render(false);
      el('j-chat-form')?.scrollIntoView({block:'center',behavior:'smooth'});
    };
    if(el('j-join')) el('j-join').onclick=async()=>{
      if(!isServer()){status('j-live-note','请用本项目服务地址进入现场匹配，或用示例搭子体验。',true);return;}
      const version=renderVersion; const b=el('j-join'); b.disabled=true;
      try{
        if(state.retiredToken){
          const retired=await fetch('/api/leave',{method:'POST',headers:{Authorization:'Bearer '+state.retiredToken,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(9000)});
          if(!retired.ok&&retired.status!==401)throw new Error();
          if(version!==renderVersion)return;state.retiredToken='';save();
        }
        const {token}=await api('visitors','POST',{nickname:state.nickname,interests:state.interests,pace:state.pace,minutes:state.minutes,destination:state.destination});
        if(version!==renderVersion)return;
        if(!token)throw new Error();
        state.token=token;state.sharedProfileKey=profileKey(state);save();liveNote='已加入，正在寻找现场搭子…';render(false);
      }catch{if(version===renderVersion){status('j-live-note','现场匹配服务暂未连接。可以重试或选择示例搭子。',true);b.disabled=false;}}
    };
    if(el('j-leave'))el('j-leave').onclick=async()=>{
      if(!window.confirm('退出后将撤下你的资料并结束本次现场聊天。确定退出吗？'))return;
      const version=renderVersion,b=el('j-leave');b.disabled=true;
      try{
        await api('leave','POST',{});
        if(version!==renderVersion)return;stopWork();state.token='';state.buddy=null;livePeers=[];conversations.clear();liveNote='已退出现场搭子库。';save();render(false);
      }catch{if(version===renderVersion){status('j-live-note','退出请求未完成，请稍后重试。',true);b.disabled=false;}}
    };
    if(p){
      el('j-confirm-buddy').onclick=()=>{
        if(state.buddyKey!==p.id)state.avatarConfirmed[1]=false;
        state.members[1].name=p.nickname;state.buddyKey=p.id;go('avatar');
      };
      el('j-chat-form').onsubmit=async e=>{
        e.preventDefault(); const input=e.target.elements.text, msg=input.value.trim();
        if(!msg||chatBusy)return;
        if(p.demo){
          const thread=state.demoThreads[p.id]||[];
          thread.push({mine:true,text:msg},{mine:false,text:sampleReply(msg,p)});
          state.demoThreads[p.id]=thread.slice(-100);save();input.value='';el('j-thread').innerHTML=threadMarkup(state.demoThreads[p.id]);el('j-thread').scrollTop=el('j-thread').scrollHeight;return;
        }
        const version=renderVersion;chatBusy=true;
        try{ await api('messages','POST',{peerId:p.id,text:msg}); if(version===renderVersion){input.value='';status('j-chat-note','已发送。');await pollLive(version);} }
        catch{if(version===renderVersion)status('j-chat-note','消息发送失败，草稿仍在。请重试。',true);}
        finally{chatBusy=false;}
      };
    }
    if(liveTab&&state.token){
      const version=renderVersion; pollLive(version);
      liveTimer=setInterval(()=>pollLive(version),4000);
    }
  }
  async function pollLive(version) {
    const poll=++lastPoll;
    try {
      const selected=state.buddy;
      const [list,thread]=await Promise.all([api('peers'),selected&&!selected.demo?api('messages?peerId='+encodeURIComponent(selected.id)):null]);
      if(version!==renderVersion||poll!==lastPoll||state.step!=='match')return;
      livePeers=(list.peers||[]).filter(p=>p.id&&typeof p.nickname==='string'&&Array.isArray(p.interests));
      el('j-peer-list').innerHTML=peerRows();status('j-live-note',livePeers.length?'现场名单每 4 秒更新。':'暂时只有你在线。可在此等待，或先和示例搭子体验。');
      if(thread&&selected?.id===state.buddy?.id){
        const t=thread.messages||[],key=JSON.stringify(t);
        if(key!==JSON.stringify(conversations.get(selected.id))){ conversations.set(selected.id,t); el('j-thread').innerHTML=threadMarkup(t); el('j-thread').scrollTop=el('j-thread').scrollHeight; }
      }
    } catch(error) {
      if(version!==renderVersion)return;
      if(error.status===401){stopWork();state.token='';state.buddy=null;livePeers=[];liveNote='现场会话已过期，请重新加入。';save();render(false);}
      else if(error.status===400&&state.buddy&&!state.buddy.demo){stopWork();state.buddy=null;liveNote='原先选择的搭子已经离场，请重新选择。';save();render(false);}
      else status('j-live-note','现场连接暂时中断，将自动重试。',true);
    }
  }
  function avatars() {
    const index=Math.min(state.members.length-1,state.avatarMember||0),member=state.members[index], solo=state.mode==='solo';
    const remaining=state.avatarConfirmed.filter(done=>!done).length;
    const ready=solo?state.avatarConfirmed[0]:remaining===0;
    top('每人，选一个角色。',`${state.members.length} 位同行者各有一张角色卡。点昵称可切换，选择别人已持有的角色时，两人的形象会对调。`,`
      <div class="j-member-tabs" role="group" aria-label="正在为谁选角色">${state.members.map((m,i)=>`<button data-member-tab="${i}" type="button" aria-pressed="${i===index}"><img src="${avatarPath(m.avatarId)}" alt=""><span><b>${h(m.name)}</b><small>${state.avatarConfirmed[i]?'已选 · '+IP[m.avatarId-1][0]:'等待选角'}</small></span></button>`).join('')}</div>
      <div class="j-pick-head"><h2>为${h(member.name)}选形象</h2><p>当前是${IP[member.avatarId-1][0]}。</p></div>
      <div class="j-avatar-grid" role="group" aria-label="为${h(member.name)}选择漫游形象">${IP.map(([name,type],i)=>{
        const owner=state.members.findIndex(m=>m.avatarId===i+1);
        return `<button data-avatar="${i+1}" class="j-avatar" aria-pressed="${member.avatarId===i+1}"><span class="j-avatar-art"><img src="${avatarPath(i+1)}" alt="${name}的全身插画"></span><small>${type}</small><strong>${name}</strong><span class="j-owner">${owner===index?'当前角色':owner>=0?'与'+h(state.members[owner].name)+'对调':'可选择'}</span></button>`;
      }).join('')}</div>
      <div class="j-actions"><button class="j-pill" id="j-confirm-ip">${state.avatarConfirmed[index]?'保留此角色':'确认这个角色'}${remaining>1?'，轮到下一位':''}</button>
      <button class="j-primary" id="j-games" ${ready?'':'disabled'}>${ready?'全员入馆':'等待选角'} <b>↗</b></button>
      ${solo?'<small class="j-hint">搭子可自行换角色，也可一起确认当前搭配入馆。</small>':''}</div>`,solo?'match':'profile');
    for(const b of flow().querySelectorAll('[data-member-tab]'))b.onclick=()=>{state.avatarMember=Number(b.dataset.memberTab);save();render(false);};
    for(const b of flow().querySelectorAll('[data-avatar]'))b.onclick=()=>{
      const id=Number(b.dataset.avatar),old=member.avatarId,other=state.members.findIndex((m,i)=>i!==index&&m.avatarId===id);
      if(other>=0){state.members[other].avatarId=old;state.avatarConfirmed[other]=false;}
      member.avatarId=id;state.avatarConfirmed[index]=true;syncLeader(state);save();render(false);
    };
    el('j-confirm-ip').onclick=()=>{
      state.avatarConfirmed[index]=true;
      const next=state.avatarConfirmed.findIndex(done=>!done);
      if(next>=0)state.avatarMember=next;
      save();render(false);
    };
    el('j-games').onclick=()=>{if(solo)state.avatarConfirmed=state.members.map(()=>true);syncLeader(state);delete state.gameDraft;go('game');};
  }
  function completeGames(result) {
    state.game=result;
    delete state.gameDraft;
    state.aiText='';state.route=buildRoute();go('report');
  }
  function games() {
    flow().innerHTML='';
    window.MallGames.start(state,completeGames,()=>go('avatar'),result=>{
      state.gameDraft=result;save();
    });
  }
  function dwell(s) {
    const base=s.stay+(state.pace==='慢慢逛'?3:state.pace==='想多逛'?-3:0);
    const available=state.minutes-2*walking(1,s.floor);
    return Math.max(MIN_STOP_MINUTES,Math.min(base,available));
  }
  const walking=(a,b)=>3+Math.abs(a-b)*2;
  function buildRoute() {
    let pending=SHOPS.filter(s=>!state.excluded.includes(s.id)&&!state.scans.some(v=>v.id===s.id));
    let floor=1,t=0;const result=[];
    for(const entry of state.scans){
      const visited=shop(entry.id); if(!visited)continue;
      t+=walking(floor,visited.floor)+dwell(visited);floor=visited.floor;result.push(visited.id);
    }
    const favorites=s=>s.tags.reduce((v,tag)=>v+(state.interests.includes(tag)?7:0),0);
    while(pending.length && result.length<SHOPS.length){
      const sorted=pending.map(s=>({s,value:(s.id===state.destination?100:0)+(state.preferred.includes(s.id)?140:0)+favorites(s)-Math.abs(floor-s.floor)*3})).sort((a,b)=>b.value-a.value);
      const candidate=sorted.map(o=>o.s).find(s=>t+walking(floor,s.floor)+dwell(s)+walking(s.floor,1)<=state.minutes);
      if(!candidate)break;
      result.push(candidate.id);t+=walking(floor,candidate.floor)+dwell(candidate);floor=candidate.floor;
      pending=pending.filter(s=>s!==candidate);
    }
    return result;
  }
  function routeTimes() {
    let floor=1,t=0;
    const stops=state.route.map(id=>shop(id)).filter(Boolean).map(s=>{
      const walk=walking(floor,s.floor);t+=walk;const arrival=t;
      t+=dwell(s);floor=s.floor;return {s,walk,arrival,leave:t};
    });
    return {stops,total:t+(stops.length?walking(floor,1):0)};
  }
  const STORE_CARDS={
    paper:{title:'翻页书签',tint:'#f8d6b0',action:'从书架上挑一本封面让你想翻开的书',together:'每人猜一句故事开头，再翻开第一页看看',paths:'<path d="M12 27q13-6 23 1 11-7 23-1v25q-11-5-23 0-11-5-23 0zM35 29v22M16 33q8-2 14 1M40 34q6-3 13-2M16 39q8-2 14 1M40 40q6-3 13-2"/><path d="M22 16v6m-5-2 3 2m7-4-2 4"/>'},
    coffee:{title:'靠窗一杯',tint:'#dfcbb8',action:'找到一款香气最吸引你的咖啡豆',together:'让同伴各选一个形容香气的词，再比较答案',paths:'<path d="M14 30h35v8c0 12-7 18-17 18s-18-6-18-18zM49 32h4a6 6 0 0 1 0 12h-5M11 59h46M22 24c-5-5 5-6 0-12m10 12c-5-5 5-6 0-12m10 12c-5-5 5-6 0-12"/>'},
    toy:{title:'怪趣玩伴',tint:'#badaef',action:'找一个造型最意外的玩具，先不给大家看标签',together:'每人为它想一个名字，再揭晓原名',paths:'<rect x="16" y="26" width="38" height="27" rx="7"/><path d="M35 25v-8m-19 18h-5v10h5m38-10h5v10h-5M26 53v5m18-5v5M29 45q6 4 12 0"/><circle cx="35" cy="13" r="3"/><circle cx="26" cy="36" r="2"/><circle cx="44" cy="36" r="2"/>'},
    craft:{title:'手心工坊',tint:'#dbc9ef',action:'在工坊展示台选一件想亲手做的小物',together:'一起找出它用了哪两种材料，再交换最想改的颜色',paths:'<circle cx="21" cy="43" r="8"/><circle cx="28" cy="55" r="7"/><path d="M26 37 52 15 33 42m0 6 25-12-29 4M35 20l5 2m11 33 3 4"/>'},
    dessert:{title:'云顶甜点',tint:'#f2cdda',action:'从展示柜选一款颜色最像今天心情的甜点',together:'轮流给它起一个菜单上没有的新名字',paths:'<path d="M14 49q2 8 21 8t21-8zM18 47l5-18h25l5 18zM23 29q7 6 13 2t12-2"/><circle cx="36" cy="23" r="6"/><path d="M36 16q1-6 7-7M13 60h44"/>'},
    sport:{title:'轻快步点',tint:'#bedebf',action:'挑一双最像你走路节奏的运动鞋',together:'一起用手拍出三拍节奏，让大家猜它适合散步还是冲刺',paths:'<path d="M12 42q8-2 9-16l10 6 5-7 5 10q7 5 15 7l3 8c-14 5-27 2-47-1zm1 4q30 7 43-1M34 33l-5 5m11-1-5 5"/>'},
    art:{title:'回声画签',tint:'#ebcbbb',action:'在展墙前找一幅愿意多看十秒的作品',together:'每人说一个先注意到的细节，听听大家看到的有什么不同',paths:'<rect x="12" y="22" width="46" height="33" rx="2"/><path d="m14 49 11-9 8 5 9-13 13 16M24 22l11-9 11 9"/><circle cx="24" cy="32" r="3"/>'},
    garden:{title:'屋顶嫩芽',tint:'#d8e8ba',action:'沿步道找一株叶形特别的植物',together:'轮流描述叶子的形状，让同伴在不触碰植物的情况下猜是哪一株',paths:'<path d="M35 58V39M35 48Q13 49 14 31q21 0 21 17zm0-9q-1-20 20-21-1 20-20 21zM21 58h28M25 61h20"/><circle cx="18" cy="17" r="3"/>'}
  };
  function promptFor(id,index) {
    const s=shop(id),c=STORE_CARDS[id],lead=state.members[index%state.members.length];
    const common=s.tags.find(t=>state.interests.includes(t));
    const reason=common?'你们选了「'+common+'」，':'这站换个口味，';
    return `到 L${s.floor} 的${s.name}，${reason}请${lead.name}${c.action}。${c.together}。按「${state.pace}」的节奏留约 ${dwell(s)} 分钟，离店前扫门店码收下「${c.title}」卡。`;
  }
  function promptBook(interactive=true) {
    return `<section class="j-prompt-book" id="j-prompts"><div class="j-book-title"><div><p class="j-kicker">随路线更新</p><h2>旅途提示词</h2></div>${interactive&&state.route.length?'<button type="button" class="j-pill" data-copy-prompt="all">复制全部提示词</button>':''}</div>
      ${state.route.length?`<ol>${state.route.map((id,i)=>`<li data-prompt-stop="${id}"><div><small>第 ${i+1} 站 · L${shop(id).floor}</small><strong>${shop(id).name}</strong></div><p>${h(promptFor(id,i))}</p>${interactive?`<button type="button" class="j-text-btn" data-copy-prompt="${id}">复制本站</button>`:''}</li>`).join('')}</ol>`:'<p>选择至少一站后，这里会出现沿途任务。</p>'}
      ${interactive?'<p id="j-copy-note" class="j-status" role="status"></p>':''}</section>`;
  }
  function bindPrompts() {
    for(const b of flow().querySelectorAll('[data-copy-prompt]'))b.onclick=async()=>{
      const ids=b.dataset.copyPrompt==='all'?state.route:[b.dataset.copyPrompt];
      const text=ids.map(id=>'【'+shop(id).name+'】'+promptFor(id,state.route.indexOf(id))).join('\n\n');
      let copied=false;
      if(isServer()&&navigator.clipboard?.writeText){
        try{await navigator.clipboard.writeText(text);copied=true;}catch{/* Continue with manual selection. */}
      }
      if(!copied){
        const field=document.createElement('textarea');field.value=text;field.setAttribute('readonly','');field.setAttribute('aria-label','可手动复制的旅途提示词');
        const note=el('j-copy-note');if(!note)return;note.replaceChildren(field);field.focus();field.select();
        try{copied=document.execCommand('copy');}catch{/* Keep the selected text available. */}
        if(!copied){note.prepend(document.createTextNode('已选中提示词，可以使用系统复制操作。'));return;}
      }
      if(copied)status('j-copy-note','已复制旅途提示词。');
    };
  }
  const ipNotes=['喜欢先观察，再把沿途的小发现收进口袋。','擅长为新认识的人记住一处小细节。','爱找展架上看起来最出乎意料的东西。','愿意带队拐一个弯，看看下一排橱窗。','想慢慢走，把喜欢的颜色和形状记下来。','喜欢听同伴讲故事，也爱发现新声音。','走到岔路口，总能想起一个有趣的提议。','擅长把细碎的发现拼成一张完整地图。'];
  function cardArt(id) {
    return `<svg class="j-shop-art" viewBox="0 0 70 70" fill="none" stroke="currentColor" stroke-width="2.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${STORE_CARDS[id].paths}</svg>`;
  }
  function collection(interactive=true,embed=false) {
    const roleCards=state.members.map((m,i)=>{
      const owned=Boolean(state.avatarConfirmed[i]),key='ip-'+m.avatarId;
      const expression=state.game?.memberExpressions?.find(e=>e.avatarId===m.avatarId)?.expression||(i===0?state.game?.expression:'');
      const src=embed?safeData(window.MallAvatarImages?.[m.avatarId-1]):avatarPath(m.avatarId);
      const face=`<span class="j-card-visual">${src?`<img src="${src}" alt="${IP[m.avatarId-1][0]}的角色插画">`:''}</span><small>角色卡 · ${owned?'已获得':'待认领'}</small><strong>${IP[m.avatarId-1][0]}</strong><span class="j-card-owner">${h(m.name)}</span>`;
      const back=`<b>${h(m.name)} · ${IP[m.avatarId-1][1]}</b><p>${ipNotes[m.avatarId-1]}</p>${expression?`<small>体验馆表情 · ${h(expression)}</small>`:''}${owned?'':'<p>这份存档还没有该成员的选角记录。</p>'}`;
      return collectible(key,face,back,owned,interactive,'#d9ece7');
    }).join('');
    const stops=[...new Set([...state.route,...state.scans.map(x=>x.id)])].filter(id=>shop(id));
    const storeCards=stops.map(id=>{
      const c=STORE_CARDS[id],s=shop(id),v=state.scans.find(x=>x.id===id);
      const face=`<span class="j-card-visual">${cardArt(id)}</span><small>门店卡 · ${v?'已获得':'未解锁'}</small><strong>${c.title}</strong><span class="j-card-owner">L${s.floor} · ${s.name}</span>`;
      const back=v?`<b>${h(v.label)} · +${v.points} 分</b><p>${h(new Date(v.at).toLocaleString('zh-CN'))} 在${s.name}获得。</p><small>同行 · ${h(memberNames())}</small>`:`<b>解锁条件</b><p>按路线到${s.name}扫门店码。只到访也能收下这张卡。</p>`;
      return collectible('shop-'+id,face,back,Boolean(v),interactive,c.tint);
    }).join('');
    return `<section class="j-collection" id="j-cards"><div class="j-book-title"><div><p class="j-kicker">本趟旅程</p><h2>我的收藏卡</h2></div><span>${state.avatarConfirmed.filter(Boolean).length+state.scans.length} 张已获得</span></div>
      <div class="j-decks"><div><h3>同行角色卡</h3><div class="j-card-grid">${roleCards}</div></div><div><h3>路线门店卡</h3>
      ${storeCards?`<div class="j-card-grid">${storeCards}</div>`:'<p>选好路线后，会在这里看到可以收集的门店卡。</p>'}</div></div>${interactive?'<p class="j-hint">点卡面可查看持有人、获得记录或解锁条件。</p>':''}</section>`;
  }
  function collectible(key,face,back,earned,interactive,tint) {
    const tag=interactive?'details':'article',front=interactive?'summary':'div';
    return `<${tag} class="j-collect-card ${earned?'earned':'locked'}" data-card-key="${key}" data-earned="${earned}" style="--card-tint:${tint}"><${front} class="j-card-front">${face}</${front}><div class="j-card-back">${back}</div></${tag}>`;
  }
  function quickLinks(){
    return '<nav class="j-quick" aria-label="本页内容"><a href="#j-cards">查看收藏卡</a><a href="#j-prompts">查看旅途提示词</a></nav>';
  }
  function frameResult() {
    const game=state.game, skipped=Math.max(0,Math.min(4,Math.trunc(Number(game?.poseSkipped)||0)));
    if(!game||skipped===4)return {score:null,max:0,label:'已跳过',summary:'油画框已跳过'};
    const completed=4-skipped, max=completed*25;
    const score=Math.round(Math.max(0,Math.min(max,Number(game.poseTotal)||0)));
    const label=skipped?`已完成 ${completed}/4 项，跳过 ${skipped} 项`:'画框得分';
    return {score,max,label,summary:`油画框 ${score}/${max} 分`+(skipped?'（'+label+'）':'')};
  }
  function photoPoints() {return state.game?.photoBonus===10?10:0;}
  function activityPoints() {return (frameResult().score??0)+(Number(state.game?.handScore)||0)+photoPoints();}
  function legacyPoints() {
    const previousVisits=state.scans.filter(s=>!Array.isArray(s.entries)).reduce((n,s)=>n+s.points,0);
    return previousVisits+(state.game?.pointRule===2?0:activityPoints());
  }
  function points() {return legacyPoints()+window.MallPoints.ledger(state).reduce((n,m)=>n+m.total,0);}
  function personalTable() {
    const rows=window.MallPoints.ledger(state), old=legacyPoints();
    return `<section class="j-paper j-personal"><h3>每个人的积分</h3><table><thead><tr><th>成员</th><th>动作起始分</th><th>合照</th><th>逛店</th><th>消费</th><th>总分</th></tr></thead><tbody>${rows.map(m=>`<tr><th>${h(m.name)}</th><td>${m.initial}</td><td>${m.photo}</td><td>${m.visits}</td><td>${m.spending}</td><td><b>${m.total}</b></td></tr>`).join('')}</tbody></table>
      <p class="j-hint">合作厨房按全队实得分记入每位成员；画框按本人动作记分。首次主动保存合照另加 10 分。</p>
      ${old?`<p>旧版公共记录 ${old} 分，计入旅程合计。</p>`:''}</section>`;
  }
  function rewardPreview(){
    const wallets=window.MallPoints.ledger(state);
    return `<section class="j-paper"><h3>积分可以换什么？</h3><p class="j-hint">试点拟定权益。以下按个人积分估算可选档位，领取以现场库存和预约为准。</p>
      <ul>${window.MallPoints.rewards.map(r=>`<li><b>${r.cost} 分 · ${r.name}</b>　${r.detail}</li>`).join('')}</ul>
      ${wallets.map(m=>{const item=window.MallPoints.rewards.filter(r=>m.total>=r.cost).at(-1);return `<p>${h(m.name)} · ${m.total} 分，${item?'最高可选「'+item.name+'」':'距角色贴纸还差 '+(30-m.total)+' 分'}。</p>`;}).join('')}</section>`;
  }
  function activityBreakdown() {
    const game=state.game||{}, frame=frameResult(), kitchen=game.kitchenProgress;
    const methods={camera:'镜头手势',touch:'手动描画',keys:'键盘辅助',watch:'观看成片'};
    const dishes=Array.isArray(kitchen?.earnedByDish)?(window.MallMedia?.dishes||[]).flatMap((dish,i)=>{
      const score=kitchen.earnedByDish[i];
      if(!Number.isInteger(score))return [];
      const method=methods[kitchen.methods?.[i]]||'';
      return [dish.dish+' '+score+'/10'+(method?' · '+method:'')];
    }):[];
    const handLabel=game.handActivity==='kitchen'?'厨房手势':'手势游戏';
    const skippedKitchen=game.handActivity==='kitchen'&&kitchen&&!dishes.length&&!game.handScore;
    const handResult=game.handScore==null||skippedKitchen?'已跳过':(Number(game.handScore)||0)+'/30 分';
    const poses=(game.poses||[]).map(p=>p.name+' '+(Number(p.score)||0)+'/25'+(p.mode?' · '+p.mode:''));
    return `<ul class="j-game-split">
      <li><span>${handLabel}</span><strong>${handResult}</strong>${dishes.length?`<small>${h(dishes.join('　/　'))}</small>`:''}</li>
      <li><span>油画框动作</span><strong>${frame.score===null?'已跳过':frame.score+'/'+frame.max+' 分'}</strong>${poses.length?`<small>${h(poses.join('　/　'))}${game.poseSkipped?' · '+frame.label:''}</small>`:''}</li>
      ${game.photoBonus!=null?`<li><span>合照奖励</span><strong>+${photoPoints()} 分</strong></li>`:''}
    </ul>`;
  }
  function routeSketch() {
    const stops=state.route.map(shop).filter(Boolean), coords=[[10,87],...stops.map(s=>[s.x,s.y]),[10,87]];
    return `<figure class="j-map" aria-label="多楼层线路示意图"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path class="map-floor" d="M7 83 80 88 93 78M8 65 81 70 93 62M8 45 81 50 92 41M10 24 79 30 91 22"/>
      <polyline points="${coords.map(p=>p.join(',')).join(' ')}"/></svg>
      <span class="map-dot map-home" style="left:10%;top:87%" title="体验馆">馆</span>
      ${stops.map((s,i)=>`<span class="map-dot ${state.scans.some(v=>v.id===s.id)?'visited':''}" style="left:${s.x}%;top:${s.y}%" title="${s.name}">${i+1}</span>`).join('')}
      <figcaption>楼层路线示意 · 体验馆出发及返回</figcaption></figure>`;
  }
  function routeList() {
    const {stops,total}=routeTimes();
    if(!stops.length){
      const eligible=SHOPS.filter(s=>!state.excluded.includes(s.id));
      const shortest=Math.min(...eligible.map(s=>2*walking(1,s.floor)+MIN_STOP_MINUTES));
      const reason=eligible.length?`你留了 ${state.minutes} 分钟。到最近的一站逛一圈并返馆，至少需要 ${shortest} 分钟。`:'目前所有门店都已勾选跳过。';
      return `<div class="j-route-info"><h2>暂时没有合适的路线</h2><p class="j-hint">${reason}可以在下方调整时长或门店，再点「重新规划」。</p></div>`;
    }
    return `<div class="j-route-info"><div class="j-map-head"><b>今天的路线</b><span>${stops.length} 站 · 预计 ${total} 分钟</span></div>${routeSketch()}
      <ol class="j-stoplist">${stops.map(({s,walk,arrival},i)=>`<li><span>${String(i+1).padStart(2,'0')}</span><div><b>${s.name}</b><small>L${s.floor} · 步行约 ${walk} 分钟 · 停留约 ${dwell(s)} 分钟</small></div><i>${state.scans.some(v=>v.id===s.id)?'已盖章':'+'+arrival+' 分'}</i></li>`).join('')}</ol>
      <p class="j-hint">你预留了 ${state.minutes} 分钟。路线用时已包含店间步行和返馆，依照演示门店的位置估算。</p></div>`;
  }
  function localReport() {
    const dest=shop(state.destination),common=state.buddy?matchDetail(state.buddy).common:[];
    const companion=state.mode==='group'?'你们'+state.members.length+'人以'+state.groupType+'的身份同行。':state.buddy?'你和'+state.buddy.nickname+'结伴，'+(common.length?'都喜欢'+common.join('、')+'。':'可以互相介绍各自的兴趣。'):'你选择了找搭子模式。';
    const styles=[
      {label:'灵感观察员',tags:['阅读','艺术']},{label:'手作探索家',tags:['手作','潮玩']},
      {label:'街角品尝家',tags:['咖啡','甜品']},{label:'户外探路员',tags:['运动','自然']}
    ];
    const style=styles.map(x=>({...x,match:state.interests.filter(i=>x.tags.includes(i)).length})).sort((a,b)=>b.match-a.match)[0];
    const visit=state.route.map(shop).find(s=>s&&!state.scans.some(v=>v.id===s.id));
    const recommendation=visit?'下一站可以去'+visit.name+'，体验'+visit.tags.join('或')+'。':state.scans.length?'你可以回到体验馆整理沿途的印章。':'调整逛街时长或门店选择后，就能重新规划路线。';
    const change=state.excluded.length?'路线已经跳过'+state.excluded.map(id=>shop(id)?.name).filter(Boolean).join('、')+'。':dest?'你把'+dest.name+'列为想去的目的地。':'';
    return `${memberNames()}，你们今天的组合像「${style.label}」。你们选了${state.interests.join('、')}，希望用 ${state.minutes} 分钟${state.pace}。${companion}${change}${recommendation}`;
  }
  function report() {
    if(!state.route.length)state.route=buildRoute();
    const frame=frameResult();
    top('你们的漫游报告。','看看每个人的角色、动作成绩和接下来的路线。',`
      ${quickLinks()}
      <div class="j-report-grid"><section class="j-report-card"><div class="j-report-top"><div><small>${state.members.length} 人旅程档案</small><h2>${h(state.title)}</h2><p>${h(memberNames())}</p></div></div>
        <div class="j-score"><strong>${activityPoints()}<small>分</small></strong><span>合作互动成绩（含合照）</span></div>
        ${activityBreakdown()}
        <h3 id="j-comment-title">${state.aiText?'AI 旅程评语':'本地偏好评语'}</h3><p class="j-comment" id="j-comment">${h(state.aiText||localReport())}</p>
        ${isServer()?`<button class="j-pill" id="j-ai">生成 AI 评语</button><p class="j-hint">点击后将昵称、偏好、路线与得分交给服务端生成评语。</p>`:''}<p id="j-ai-note" class="j-status" role="status"></p></section>
        <section class="j-paper">${routeList()}</section></div>
      ${personalTable()}${collection()}${promptBook()}
      <section class="j-paper"><h2>想换一站？</h2><p class="j-hint">勾选不想去的站，或写下“不想去甜品，想去书房”。已盖章的门店会保留。</p>
        <form id="j-feedback"><div class="j-chips">${SHOPS.map(s=>`<label class="j-chip"><input type="checkbox" name="exclude" value="${s.id}" ${state.excluded.includes(s.id)?'checked':''} ${state.scans.some(x=>x.id===s.id)?'disabled':''}><span>跳过${s.name}</span></label>`).join('')}</div>
        ${state.scans.length?'':durationField()}
        <label class="j-field">路线反馈<input name="text" maxlength="100" value="${h(state.feedback)}" placeholder="例如，不想去甜品，想去屋顶花园"></label>
        <button class="j-pill">重新规划</button><p id="j-feedback-note" role="status" class="j-status"></p></form></section>
      <div class="j-actions"><button id="j-depart" class="j-primary" ${state.route.length?'':'disabled'}>拿着路线去集章 <b>↗</b></button></div>`,'avatar');
    el('j-feedback').onsubmit=e=>{
      e.preventDefault();const data=new FormData(e.target),text=String(data.get('text')||'').trim();
      const ignored=new Set(data.getAll('exclude')),preferred=new Set(),unmatched=[];
      const words={
        paper:['书房','书店','书','阅读'],coffee:['咖啡'],dessert:['甜品','甜点'],craft:['工坊','手作'],toy:['玩具','潮玩'],sport:['运动','起跳'],garden:['花园','屋顶','自然'],art:['画廊','艺术']
      };
      for(const clause of text.split(/[，,。；;、\n]|(?:但是|但想|然后)/).map(s=>s.trim()).filter(Boolean)){
        const negative=/不想|不爱|不喜欢|不去|不喝|不吃|不逛|别去|不要|跳过|去掉|排除|太吵/.test(clause);
        let found=false;
        for(const s of SHOPS){
          if(![s.name,...words[s.id]].some(word=>clause.includes(word)))continue;
          found=true;if(negative) ignored.add(s.id); else preferred.add(s.id);
        }
        if(!found)unmatched.push(clause);
      }
      const before=state.route.join(',');
      if(data.has('minutes'))state.minutes=Number(data.get('minutes'));
      state.excluded=[...ignored].filter(id=>!state.scans.some(x=>x.id===id));state.preferred=[...preferred];state.feedback=text;state.aiText='';
      state.route=buildRoute();save();render(false);
      const result=!state.route.length?'当前时长和门店选择无法排出一站，请调整后再试。':before===state.route.join(',')?'已重新核算，当前路线仍最合适。':'已更新路线。';
      status('j-feedback-note',result+(unmatched.length?' 未识别“'+unmatched.join('、')+'”，可以直接勾选要跳过的门店。':''));
    };
    bindPrompts();el('j-depart').onclick=()=>go('route');
    if(el('j-ai'))el('j-ai').onclick=async()=>{
      if(reportBusy)return;
      reportBusy=true;const version=renderVersion;const btn=el('j-ai');btn.disabled=true;status('j-ai-note','正在生成评语…');
      try{
        const r=await api('report','POST',{nickname:state.nickname,interests:state.interests,pace:state.pace,minutes:state.minutes,destination:state.destination,poseTotal:frame.score,memberCount:state.members.length,route:state.route.map(id=>shop(id).name)});
        if(version!==renderVersion)return;if(!r.text)throw new Error(); state.aiText=String(r.text);save();el('j-comment-title').textContent='AI 旅程评语';el('j-comment').textContent=state.aiText;status('j-ai-note','已生成。');
      }catch{if(version===renderVersion)status('j-ai-note','此服务暂未提供 AI 评语，上方仍可查看本地偏好报告。');}
      finally{reportBusy=false;if(version===renderVersion)btn.disabled=false;}
    };
  }
  function route() {
    const visited=new Set(state.scans.map(s=>s.id));
    const remaining=state.route.filter(id=>!visited.has(id)).length;
    top('走一站，收一张卡。','到店扫码后，勾选实际到场的成员，按各自消费金额记分。',`
      ${quickLinks()}
      <div class="j-route-dashboard"><div><small>旅程合计</small><strong>${points()} <em>分</em></strong></div>
      <div><small>已集印章</small><strong>${state.scans.length} <em>/ ${state.route.length} 站</em></strong></div>
      <button class="j-primary" id="j-scan" ${state.route.length?'':'disabled'}>扫门店码 <b>⌾</b></button></div>
      <div class="j-report-grid"><section class="j-paper">${routeList()}</section>
      <section class="j-paper"><h2>我的印章簿</h2>${state.scans.length?`<div class="j-stamps">${state.scans.map(v=>`<div class="j-stamp ${v.color}"><b>${h(shop(v.id)?.name)}</b><span>${h(v.label)}</span><small>+${v.points} 分 · ${timeOf(v.at)}</small></div>`).join('')}</div>`:'<p class="j-hint">还没有印章。到店扫码后，第一枚印章会出现在这里。</p>'}
      <p class="j-hint">每人每店首访 +10 分。消费按该成员在本店累计实付择一档加分，补登仅补档差。</p><details><summary>查看消费分档</summary><ul>${window.MallPoints.tiers.map(t=>`<li>${t.label} 元，加 ${t.bonus} 分</li>`).join('')}</ul></details><p class="j-hint">消费 0 元时保留到访分。</p>
      <div class="j-return"><h3>回体验馆</h3><p class="j-hint">${state.scans.length?(remaining?'已有印章，随时可以提前返馆结算。':'你集齐了路线上的印章。'):'至少完成一个门店打卡，即可返馆签名。'}</p><button class="j-pill" id="j-return" ${state.scans.length?'':'disabled'}>扫返馆码</button></div>
      <a class="j-codes" href="站点码.html" target="_blank" rel="noopener">打开可打印的演示站点码 ↗</a></section></div>
      ${personalTable()}${rewardPreview()}<p id="j-route-status" role="status" class="j-status"></p>${collection()}${promptBook()}`,'report');
    bindPrompts();
    el('j-scan').onclick=()=>openScanner('shop');
    el('j-return').onclick=()=>openScanner('return');
  }
  function openScanner(kind) {
    checkinScan?.close();const isReturn=kind==='return';
    const dialog=document.createElement('dialog');dialog.className='j-dialog';
    dialog.innerHTML=`<div class="j-modal-top"><h2>${isReturn?'返馆核验':'门店打卡'}</h2><button class="j-x" id="j-scan-close" aria-label="关闭扫码">×</button></div>
      <div id="j-scan-body"><p class="j-hint">${isReturn?'请扫体验馆出口的返馆码。':'请扫路线内门店的站点码。'} 开启摄像头后，画面只在本机识别。</p>
      <video id="j-scan-video" playsinline muted hidden></video>
      <div class="j-scan-tools"><button id="j-cam" class="j-pill">开启摄像头扫码</button><label class="j-pill j-file-btn">识别二维码图片<input type="file" id="j-qr-file" accept="image/*"></label></div>
      <form id="j-code-form"><label class="j-field">手动输入站点码<input name="code" maxlength="100" required autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${isReturn?'填写返馆牌上的代码':'填写门店牌上的代码'}"></label><button class="j-primary">核验站点码</button></form>
      <a class="j-codes" href="站点码.html" target="_blank" rel="noopener">查看演示用站点码与二维码 ↗</a></div>
      <p id="j-scan-note" class="j-status" role="status"></p>`;
    document.body.appendChild(dialog);
    if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');
    let stream=null,timer=null,alive=true,checkingOut=false,nativeDetector=null,scannerReady=false;
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
    const video=el('j-scan-video');
    const stopCamera=()=>{
      if(timer)clearTimeout(timer);timer=null;
      stream?.getTracks().forEach(t=>t.stop());stream=null;video.pause();video.srcObject=null;video.hidden=true;
    };
    function close() {
      if(!alive)return; alive=false; stopCamera();
      if(dialog.open&&dialog.close)dialog.close();
      dialog.remove();checkinScan=null;
    }
    checkinScan={close};el('j-scan-close').onclick=close;
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
    function verified(raw) {
      if(!alive||checkingOut)return false;
      const code=String(raw||'').trim().toUpperCase();
      if(isReturn){
        if(code!=='MALL:RETURN'||!state.scans.length){status('j-scan-note','这个码不是当前旅程的有效返馆码。',true);return false;}
        state.returnScanned=true;save();close();go('finish');return true;
      }
      const match=/^MALL:SHOP:([A-Z0-9_-]+)$/.exec(code);
      const id=match?.[1].toLowerCase(), store=shop(id);
      if(!store){status('j-scan-note','没有找到这个门店。请扫描项目的门店码。',true);return false;}
      if(!state.route.includes(id)){status('j-scan-note',store.name+'不在本趟路线中。可先回报告调整路线。',true);return false;}
      const previous=state.scans.find(x=>x.id===id);
      if(previous&&!Array.isArray(previous.entries)){status('j-scan-note','此店已按旧规则盖章，原得分已保留。',true);return false;}
      checkingOut=true;stopCamera();status('j-scan-note','');
      const inputs=state.members.map((m,i)=>{
        const prior=previous?.entries[i], selected=!!prior||(!previous&&i===0);
        return `<div class="j-visit-member"><label><input type="checkbox" data-attend="${i}" ${selected?'checked':''} ${prior?'disabled':''}> ${h(m.name)} 到场</label>
          <label class="j-field">本店累计实付（元）<input type="number" data-amount="${i}" name="${i===0?'amount':'amount-'+i}" min="${prior?.amount||0}" max="999999" step=".01" value="${prior?.amount||0}" ${selected?'required':'disabled'}></label><small data-preview="${i}"></small></div>`;
      }).join('');
      el('j-scan-body').innerHTML=`<div class="j-store-verified"><small>站点核验成功</small><h3>${store.name}</h3><p>L${store.floor} · ${store.tags.join(' / ')}</p></div>
        <form id="j-spend">${inputs}<p class="j-hint">填每人实际支付的金额。多人分摊一笔订单时，各填自己的份额。首次到店每人 +10；在本店再次登记时填累计金额。</p>
        <p class="j-status" role="status" id="j-spend-status"></p><button class="j-primary">确认记分 <b>✳</b></button></form>`;
      const form=el('j-spend');
      function updateFields(){
        state.members.forEach((m,i)=>{
          const present=form.querySelector('[data-attend="'+i+'"]').checked;
          const input=form.querySelector('[data-amount="'+i+'"]');
          input.disabled=!present;input.required=present;
          const label=form.querySelector('[data-preview="'+i+'"]');
          if(!present||!input.validity.valid){label.textContent='';return;}
          const a=window.MallPoints.award(input.valueAsNumber);
          label.textContent='到访 '+a.visit+' ＋ 消费 '+a.bonus+' 分（本次新增 '+(a.points-(previous?.entries[i]?.points||0))+' 分）';
        });
      }
      form.oninput=updateFields;updateFields();
      form.onsubmit=e=>{
        e.preventDefault();if(!alive||!form.reportValidity())return;
        const entries=state.members.map((_,i)=>{
          if(!form.querySelector('[data-attend="'+i+'"]').checked)return null;
          const amount=form.querySelector('[data-amount="'+i+'"]').valueAsNumber;
          return {amount,...window.MallPoints.award(amount)};
        });
        const attendees=entries.filter(Boolean);
        if(!attendees.length){status('j-spend-status','请勾选至少一位到场成员。',true);return;}
        const amount=Math.round(attendees.reduce((v,a)=>v+a.amount,0)*100)/100;
        const credit=attendees.reduce((v,a)=>v+a.points,0);
        const largest=Math.max(...attendees.map(a=>a.bonus));
        const record={id,amount,entries,points:credit,color:largest===0?'red':largest<=30?'blue':'gold',label:largest===0?'到访红章':largest<=30?'体验蓝章':'珍藏金章',at:previous?.at||now()};
        const delta=credit-(previous?.points||0);
        if(previous)Object.assign(previous,record);else state.scans.push(record);
        save();close();render(false);status('j-route-status',store.name+'已登记，本次新增 '+delta+' 分。');
      };
      return true;
    }
    async function initReader() {
      if(scannerReady)return; scannerReady=true;
      if('BarcodeDetector' in window){try{nativeDetector=new BarcodeDetector({formats:['qr_code']});}catch{/* Use jsQR below. */}}
    }
    async function read(image,width,height) {
      await initReader();
      if(nativeDetector){try {const found=await nativeDetector.detect(image); if(found[0]?.rawValue)return found[0].rawValue;}catch{nativeDetector=null;}}
      if(typeof window.jsQR!=='function')return '';
      const scale=Math.min(1,1000/Math.max(width,height));
      canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
      ctx.drawImage(image,0,0,canvas.width,canvas.height);
      const data=ctx.getImageData(0,0,canvas.width,canvas.height);
      return window.jsQR(data.data,data.width,data.height,{inversionAttempts:'attemptBoth'})?.data||'';
    }
    el('j-code-form').onsubmit=e=>{e.preventDefault();verified(e.target.elements.code.value);};
    el('j-cam').onclick=async()=>{
      const b=el('j-cam');b.disabled=true;
      if(!navigator.mediaDevices?.getUserMedia){status('j-scan-note','此页面无法访问摄像头，可以上传码图或手动填写。',true);b.disabled=false;return;}
      try{
        await initReader();
        if(!nativeDetector&&typeof window.jsQR!=='function')throw new Error('noreader');
        const opened=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
        if(!alive||checkingOut){opened.getTracks().forEach(t=>t.stop());return;}
        stream=opened;video.srcObject=stream;video.hidden=false;await video.play();
        status('j-scan-note','请让二维码完整出现在画面中。');
        async function tick(){
          if(!alive||!stream)return;
          if(video.readyState>=2){
            try{const code=await read(video,video.videoWidth,video.videoHeight);if(code&&verified(code))return;}
            catch{/* The next frame can recover from autofocus. */}
          }
          if(alive&&stream)timer=setTimeout(tick,220);
        }
        tick();
      }catch{if(alive){stopCamera();b.disabled=false;status('j-scan-note','摄像头或识别器暂不可用，请上传清晰码图或手动填写。',true);}}
    };
    el('j-qr-file').onchange=async e=>{
      const file=e.target.files?.[0];if(!file)return;
      const url=URL.createObjectURL(file);
      try{
        const image=await loadImage(url);const code=await read(image,image.naturalWidth,image.naturalHeight);
        if(!alive)return;
        if(code)verified(code);else status('j-scan-note','没有读到二维码，请选择完整清晰的码图，或手动填写。',true);
      }catch{if(alive)status('j-scan-note','无法读取这张图片，请重试。',true);}
      finally{URL.revokeObjectURL(url);}
    };
    // Opening the scan station is the visitor's camera action; manual entry stays available.
    if(navigator.mediaDevices?.getUserMedia)el('j-cam').click();
  }
  function finish() {
    if(!state.returnScanned||!state.scans.length){go('route');return;}
    flow().innerHTML='';
    window.MallGames.finish(state, result=>{
      state.finish=result||{};state.rewardId=state.rewardId||makeRewardId();
      go('album');
      if(isServer())syncRedemption();
    },()=>go('route'));
  }
  function makeRewardId(){
    const bytes=new Uint8Array(5);
    if(globalThis.crypto?.getRandomValues) crypto.getRandomValues(bytes);
    else for(let i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*256);
    return 'DG-'+[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
  }
  function loadImage(src) {
    return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=src;});
  }
  function safeData(url) {return typeof url==='string'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(url)?url:'';}
  function detailsForAlbum() {
    const photos=[state.game?.photo,...state.photos].map(safeData).filter(Boolean);
    return {photos,signature:safeData(state.finish?.signature),keepsake:safeData(state.finish?.keepsake)};
  }
  const collectionStyles=`.j-collection,.j-prompt-book{margin:0 0 18px;padding:clamp(17px,2.8vw,30px);color:#172c2d;background:#fffdf3;border:1.5px solid #172c2d;border-radius:18px;font-family:"DM Sans","PingFang SC","Microsoft YaHei",sans-serif}
.j-collection h2,.j-prompt-book h2{font-size:clamp(24px,3vw,34px);line-height:1.2;margin:2px 0 8px;letter-spacing:-.045em}
.j-collection h3{font-size:15px;margin:12px 0 7px}
.j-book-title{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.j-book-title .j-kicker{margin:0;color:#456255;font-size:12px}
.j-book-title>span{border:1px solid #536d5e;background:#d9f263;border-radius:2em;padding:4px 10px;font-size:13px;font-weight:700}
.j-decks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.j-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(125px,100%),1fr));gap:12px;align-items:start}
.j-collect-card{border:1.4px solid #284839;border-radius:13px;overflow:hidden;background:#fffcf2;box-shadow:2px 2px 0 #698778;min-width:0;break-inside:avoid}
.j-card-front{display:block;cursor:pointer;padding:10px 12px 11px;list-style:none;color:#18372f}
.j-card-front::-webkit-details-marker{display:none}
.j-card-front:focus-visible{outline:3px solid #007e8d;outline-offset:-4px}
.j-card-front>small,.j-card-front>strong,.j-card-owner{display:block;overflow-wrap:anywhere}
.j-card-front>strong{font-size:18px;line-height:1.35;font-weight:850}
.j-card-front>small,.j-card-owner{font-size:12px;line-height:1.6}
.j-card-visual{display:flex;align-items:center;justify-content:center;position:relative;height:88px;margin:-10px -12px 7px;border-bottom:1px solid #71917c;background:var(--card-tint,#d9ece7)}
.j-card-visual:before,.j-card-visual:after{content:"";position:absolute;width:12px;height:12px;border-radius:50%;border:1px solid #233b302b;top:8px;left:8px}
.j-card-visual:after{top:auto;left:auto;bottom:8px;right:8px}
.j-card-visual img{display:block;height:87%;width:85%;object-fit:contain;mix-blend-mode:multiply}
.j-shop-art{width:73px;height:73px;color:#294733}
.j-collect-card.locked{border-style:dashed;box-shadow:none}
.j-collect-card.locked .j-card-visual{background:repeating-linear-gradient(135deg,#e5e8db 0 7px,#eef0e7 7px 13px);border-bottom-style:dashed}
.j-collect-card.locked .j-shop-art{color:#6c7c70}
.j-card-back{padding:10px 12px;border-top:1px solid #bac6b6;font-size:13px;background:#f1f5e7;line-height:1.55;overflow-wrap:anywhere}
.j-card-back p{margin:5px 0}
.j-card-back small{color:#486251;font-size:12px}
.j-prompt-book{background:#e2efed}
.j-prompt-book ol{margin:6px 0 0;padding:0;list-style:none}
.j-prompt-book li{border-top:1px solid #a6bbaf;display:grid;grid-template-columns:minmax(90px,.65fr) minmax(0,2.8fr) auto;align-items:start;gap:14px;padding:12px 0;break-inside:avoid}
.j-prompt-book li small,.j-prompt-book li strong{display:block}
.j-prompt-book li small{font-size:12px;color:#466052}
.j-prompt-book li p{margin:0;font-size:14px;line-height:1.7;overflow-wrap:anywhere}
.j-text-btn{border:0;border-bottom:1px solid #537965;padding:2px 0;background:transparent;color:#234f3a;font-size:13px!important;white-space:nowrap}
#j-copy-note textarea{width:100%;min-height:4.5em}
@media(max-width:820px){.j-decks{grid-template-columns:1fr;gap:0}}
@media(max-width:620px){.j-card-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.j-card-visual{height:77px}.j-prompt-book li{grid-template-columns:1fr auto;gap:4px 9px}.j-prompt-book li p{grid-column:1/-1;grid-row:2}.j-prompt-book li .j-text-btn{grid-column:2;grid-row:1}.j-card-front>strong{font-size:16px}}
@media print{.j-decks{display:block}.j-collection,.j-prompt-book{break-inside:auto!important}.j-card-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:5mm}.j-collect-card{box-shadow:none}.j-card-front{cursor:default}.j-collection,.j-prompt-book,.j-collect-card{-webkit-print-color-adjust:exact;print-color-adjust:exact}.j-card-visual{height:56px}.j-prompt-book .j-pill,.j-prompt-book .j-text-btn,.j-collection>.j-hint,#j-copy-note{display:none!important}}
`;
  const albumStyles=`
    .j-game-split{list-style:none;padding:0;margin:.6em 0}.j-game-split li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.2em 1em;border-bottom:1px solid #a7afa1;padding:.4em 0}.j-game-split small{grid-column:1/-1}
    .j-album-doc{max-width:790px;margin:auto;background:#fffaf0;border:2px solid #203335;color:#203335;font:16px/1.65 "PingFang SC","Microsoft YaHei",sans-serif;padding:clamp(22px,5vw,55px);border-radius:20px}
    .j-album-doc *{box-sizing:border-box}.j-album-doc h1,.j-album-doc h2,.j-album-doc p{margin:.35em 0}.j-album-doc h1{font-size:clamp(30px,5vw,52px);line-height:1.1}.j-album-doc h2{font-size:21px;margin-top:1.2em}
    .j-album-cover{display:flex;align-items:center;justify-content:space-between;gap:20px}.j-album-cover img{width:85px;height:100px;object-fit:contain}.j-album-cover small{font-weight:700;letter-spacing:.05em}
    .j-album-doc table{border-collapse:collapse;width:100%;margin-top:12px}.j-album-doc td,.j-album-doc th{border-bottom:1px solid #a7afa1;padding:8px 4px;text-align:left;font-size:14px}
    .j-album-photos{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.j-album-photos img{width:100%;max-height:320px;object-fit:contain;background:#e9e9dc}
    .j-album-sign{max-width:210px;max-height:92px;object-fit:contain}.j-album-doc section,.j-album-doc figure,.j-album-doc tr{break-inside:avoid}.j-album-cover-team{display:flex;flex-wrap:wrap;justify-content:flex-end;max-width:43%;gap:2px}.j-album-doc .j-album-cover-team img{width:38px;height:56px;object-fit:contain}.j-album-doc footer{margin-top:1.3em;border-top:1px solid #bcc1b5;padding-top:1em;font-size:13px}
    @media print{.j-album-doc{border:none;border-radius:0;padding:8mm;max-width:none}.j-album-doc table{page-break-inside:auto}}
  `;
  function albumMarkup(standalone=false) {
    const {photos,signature,keepsake}=detailsForAlbum();
    const portraits=state.members.map(m=>{
      const src=standalone?safeData(window.MallAvatarImages?.[m.avatarId-1]):avatarPath(m.avatarId);
      return src?`<img src="${src}" alt="${h(m.name)}的${IP[m.avatarId-1][0]}角色">`:'';
    }).join('');
    const names=state.route.map(id=>shop(id)?.name).filter(Boolean).join(' → ');
    return `<article class="j-album-doc"><header class="j-album-cover"><div><small>万象生活遇 · ${state.members.length} 人漫游纪念册</small><h1>${h(state.title)}</h1><p>${h(memberNames())}　${h(state.date.replace('T',' '))}</p></div><div class="j-album-cover-team">${portraits}</div></header>
      <section><h2>这趟旅程</h2><p>${h(state.mode==='solo'?'与'+(state.buddy?.nickname||'搭子')+'同行':'和'+state.groupType+'同行')} · 旅程合计 ${points()} 分</p>
      <p>${h(state.aiText||localReport())}</p><h3>互动积分 · ${activityPoints()} 分</h3>${activityBreakdown()}</section>${personalTable()}${rewardPreview()}
      <section><h2>路线和印章</h2><p>体验馆 → ${h(names)} → 体验馆</p><table><thead><tr><th>时间</th><th>门店</th><th>印章</th><th>积分</th></tr></thead><tbody>${state.scans.map(s=>`<tr><td>${timeOf(s.at)}</td><td>${h(shop(s.id)?.name)}</td><td>${h(s.label)}</td><td>+${s.points}</td></tr>`).join('')}</tbody></table></section>
      ${collection(!standalone,standalone)}${promptBook(!standalone)}
      ${photos.length?`<section><h2>沿途留影</h2><div class="j-album-photos">${photos.map((src,i)=>`<img src="${src}" alt="旅程照片 ${i+1}">`).join('')}</div></section>`:''}
      ${keepsake?`<section><h2>返馆纪念</h2><div class="j-album-photos"><img src="${keepsake}" alt="返馆哈气签名纪念图"></div></section>`:signature?`<section><h2>我的签名</h2><img class="j-album-sign" src="${signature}" alt="手写签名"></section>`:''}
      <footer>纪念编号 ${h(state.rewardId)} · 返馆已核验 · ${h(new Date(state.finish?.createdAt||state.scans.at(-1).at).toLocaleDateString('zh-CN'))}</footer></article>`;
  }
  function download(blob,name){
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
  function fileTitle(){return (state.title.replace(/[\/\\:*?"<>|]/g,'').slice(0,32)||'万象生活遇');}
  async function exportInk() {
    const c=document.createElement('canvas');c.width=800;c.height=480;
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,800,480);ctx.fillStyle='#111';
    ctx.strokeStyle='#151515';ctx.lineWidth=5;ctx.strokeRect(15,15,770,450);
    ctx.font='bold 24px sans-serif';ctx.fillText('万象生活遇　漫游纪念牌',42,60);ctx.font='bold 38px sans-serif';ctx.fillText(state.title,42,120,685);
    ctx.font='24px sans-serif';ctx.fillText(state.members.length+' 人同行　·　'+points()+' 分　·　'+state.scans.length+' 枚印章',42,177,650);
    ctx.font='22px sans-serif';state.scans.slice(0,6).forEach((s,i)=>ctx.fillText(shop(s.id).name,42+(i%3)*190,236+Math.floor(i/3)*40,180));
    ctx.font='16px sans-serif';state.members.forEach((m,i)=>ctx.fillText(m.name+' · '+IP[m.avatarId-1][0],42+(i%4)*180,325+Math.floor(i/4)*27,170));
    const signature=safeData(state.finish?.signature);
    if(signature){try{const img=await loadImage(signature);const ratio=Math.min(225/img.width,85/img.height);ctx.drawImage(img,506,365,img.width*ratio,img.height*ratio);}catch{/* Text keepsake still exports. */}}
    ctx.font='18px monospace';ctx.fillText(state.rewardId,42,421);
    const pixels=ctx.getImageData(0,0,c.width,c.height);
    for(let i=0;i<pixels.data.length;i+=4){ const mono=pixels.data[i]*.3+pixels.data[i+1]*.59+pixels.data[i+2]*.11>172?255:0;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=mono; }
    ctx.putImageData(pixels,0,0);
    const blob=await new Promise(r=>c.toBlob(r,'image/png'));if(!blob)throw new Error('png');
    download(blob,fileTitle()+'-墨水屏.png');
  }
  async function userPhoto(file) {
    if(!file || !file.type.startsWith('image/')) throw new Error();
    const url=URL.createObjectURL(file);
    try{
      const img=await loadImage(url),ratio=Math.min(1,850/Math.max(img.width,img.height));
      const canvas=document.createElement('canvas'); canvas.width=Math.max(1,Math.round(img.width*ratio));canvas.height=Math.max(1,Math.round(img.height*ratio));
      const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
      return canvas.toDataURL('image/jpeg',.76);
    }finally{URL.revokeObjectURL(url);}
  }
  function redemptionText() {
    const result=state.redemption;
    if(!result)return '本机已生成电子凭证。现场实物交付请向工作人员出示凭证。';
    if(result.status==='dispensed')return '现场设备已确认出物，请在取物口领取。';
    if(result.status==='queued')return '已登记，正在等待现场设备确认出物。';
    return '电子凭证已登记。当前服务未连接出物机，可向现场工作人员出示。';
  }
  async function syncRedemption() {
    if(!state.finish||!state.returnScanned||!isServer()||redeemBusy)return;
    const trip=state;redeemBusy=true;
    status('j-redeem-status','正在核对返馆凭证…');
    try{
      const result=await api('redemptions','POST',{tripId:state.id,kind:'纪念签',stopCount:state.scans.length,points:points()});
      if(trip!==state||!result.code) return;
      state.redemption={id:result.id,code:result.code,status:result.status};
      state.rewardId=result.code;save();
      if(state.step==='album'&&!flow().hidden){
        el('j-reward-code').textContent=state.rewardId;
        el('j-reward-desc').textContent=redemptionText();
        el('j-album-preview').innerHTML=albumMarkup();bindPrompts();
        status('j-redeem-status','已更新领取状态。');
      }
    }catch{if(trip===state&&state.step==='album')status('j-redeem-status','暂时连不上现场服务。本机纪念册可以使用，稍后可再核对。');}
    finally{redeemBusy=false;}
  }
  function album(){
    if(!state.finish||!state.rewardId){go(state.returnScanned?'finish':'route');return;}
    top('把今天带回家。','返馆签名已完成，电子纪念册已经生成。',`
      <section class="j-reward"><div><small>返馆纪念凭证</small><strong id="j-reward-code">${h(state.rewardId)}</strong><p id="j-reward-desc">${h(redemptionText())}</p>${isServer()?'<button class="j-pill" id="j-redeem-check">核对领取状态</button>':''}<p class="j-status" id="j-redeem-status" role="status"></p></div><span aria-hidden="true">✳</span></section>
      <div class="j-album-tools"><button id="j-export" class="j-primary">下载电子纪念册 <b>↓</b></button><button id="j-ink" class="j-pill">导出墨水屏图</button>
      <button id="j-print" class="j-pill">纸质纪念册 · 25 元</button><label class="j-pill j-file-btn">补一张旅途照片<input type="file" accept="image/*" id="j-album-photo"></label></div>
      <p class="j-hint">纸质版由现场柜台收费、打印；本页可生成打印稿。黑白 PNG 供工作人员写入墨水屏。</p>
      <p><a class="j-codes" href="漫游墙.html" target="_blank" rel="noopener">去漫游留言墙，分享一条逛街心得 ↗</a></p>
      <p id="j-album-status" class="j-status" role="status"></p><div id="j-album-preview">${albumMarkup()}</div>`);
    bindPrompts();if(el('j-redeem-check'))el('j-redeem-check').onclick=syncRedemption;
    el('j-export').onclick=()=>{
      const content='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+h(state.title)+' · 旅程纪念册</title><style>body{background:#eff1e5;margin:0;padding:20px}'+albumStyles+collectionStyles+'</style></head><body>'+albumMarkup(true)+'</body></html>';
      download(new Blob([content],{type:'text/html;charset=utf-8'}),fileTitle()+'-纪念册.html');status('j-album-status','纪念册已导出，可离线打开。');
    };
    el('j-ink').onclick=async()=>{try{await exportInk();status('j-album-status','800 × 480 黑白纪念图已导出。');}catch{status('j-album-status','导出失败，请重试。',true);}};
    el('j-print').onclick=()=>{window.print();};
    el('j-album-photo').onchange=async e=>{
      const file=e.target.files?.[0];if(!file)return;
      if(state.photos.length>=5){status('j-album-status','本册最多可补充五张照片。',true);return;}
      try{const image=await userPhoto(file);state.photos.push(image);const kept=save();el('j-album-preview').innerHTML=albumMarkup();bindPrompts();status('j-album-status',kept?'照片已加入本册。':'照片已加入本次页面，浏览器存储空间不足，请立即导出纪念册。');}
      catch{status('j-album-status','此图片无法读取，请选 JPG、PNG 或 WebP。',true);}
    };
  }
  function reset() {
    if(!window.confirm('确定清除本机保存的旅程吗？已下载的纪念册仍可打开。'))return false;
    stopWork();renderVersion++;try{localStorage.removeItem(KEY);}catch{/* Storage unavailable. */}
    state=null;flow().hidden=true;window.showMallHome?.();return true;
  }
  let printCards=[];
  window.addEventListener('beforeprint',()=>{
    printCards=[...document.querySelectorAll('#j-album-preview details:not([open])')];
    for(const card of printCards)card.open=true;
  });
  window.addEventListener('afterprint',()=>{for(const card of printCards)card.open=false;printCards=[];});
  window.addEventListener('pagehide',stopWork);
  window.MallJourney={getCardExample:()=>({title:STORE_CARDS.paper.title,shop:shop("paper").name,floor:shop("paper").floor,art:cardArt("paper"),action:STORE_CARDS.paper.action,together:STORE_CARDS.paper.together}),start,resume,reset,hasSaved:()=>Boolean(load()),shops:SHOPS.map(s=>({...s})),getSummary:()=>{const s=load();return s?{title:s.title||'尚未命名的旅程',step:stepName[s.step],canSkipGames:s.step==='game',mode:s.mode}:null;}};
  const style=document.createElement('style');style.textContent=albumStyles+collectionStyles;document.head.appendChild(style);
})();
