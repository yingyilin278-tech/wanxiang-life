/* 万象生活遇 · 本地体验馆。入场后使用浏览器标准权限请求，设备流仅在本机处理。 */
(() => {
  'use strict';
  const mediaBase = new URL('vendor/vision/', document.currentScript.src);
  const assetBase = new URL('assets/', document.currentScript.src);
  const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  const avg = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const raf = window.requestAnimationFrame.bind(window);
  const labels=['捏捏表情','手势厨房','全员油画框'];
  const poses=[
    {name:'合心举手',hint:'从左到右结对，外侧手臂越过头顶，与身旁的队友拼成一颗心。'},
    {name:'默契击掌',hint:'从左到右结对，举起靠近队友的一只手，在肩膀上方击掌。'},
    {name:'镜像展翼',hint:'面向镜头，每个人都把双臂向两侧伸平，让手腕与肩膀大致等高。'},
    {name:'全员胜利 V',hint:'每个人同时向两侧斜上方举起双臂，摆出自己的大 V。'}
  ];
  let active=null, filesetPromise;
  function loadVision() {
    if (!filesetPromise) filesetPromise=import(new URL('vision_bundle.mjs',mediaBase).href).then(async vision=>({
      vision,files:await vision.FilesetResolver.forVisionTasks(new URL('wasm',mediaBase).href)
    })).catch(err=>{filesetPromise=null;throw err;});
    return filesetPromise;
  }
  const configs={
    face:['FaceLandmarker','face_landmarker.task',{numFaces:1,outputFaceBlendshapes:true}],
    hand:['HandLandmarker','hand_landmarker.task',{numHands:1}],
    pose:['PoseLandmarker','pose_landmarker_lite.task',{minPoseDetectionConfidence:.42,minPosePresenceConfidence:.42,minTrackingConfidence:.45}]
  };
  function closeResources(s) {
    s.epoch++;
    for(const stop of s.stops.splice(0)) {try {stop();}catch(_){}}
  }
  function releaseStream(s) {
    s.streamGeneration++;
    s.stream?.getTracks().forEach(t=>t.stop());
    s.stream=null;
  }
  function dispose() {
    const s=active;if(!s)return;
    active=null;closeResources(s);releaseStream(s);
    s.observer?.disconnect();window.removeEventListener('pagehide',s.leave);
  }
  function membersOf(state) {
    const raw=Array.isArray(state.members)&&state.members.length>=2?state.members:[
      {name:state.nickname,avatarId:state.avatarId},
      {name:state.buddy?.name||'同行搭子',avatarId:state.avatarId===2?3:2}
    ];
    return raw.slice(0,8).map((m,i)=>({name:String(m.name||'成员 '+(i+1)),avatarId:clamp(Math.round(Number(m.avatarId))||1,1,8)}));
  }
  function captureGroupPhoto(s,video) {
    if(active!==s||video.readyState<2||!video.videoWidth||!video.videoHeight)return false;
    const canvas=document.createElement('canvas');
    canvas.width=Math.min(640,video.videoWidth);
    canvas.height=Math.max(1,Math.round(canvas.width*video.videoHeight/video.videoWidth));
    try{
      const ctx=canvas.getContext('2d');
      ctx.translate(canvas.width,0);ctx.scale(-1,1);
      ctx.drawImage(video,0,0,canvas.width,canvas.height);
      const image=canvas.toDataURL('image/jpeg',.74);
      if(!image.startsWith('data:image/jpeg;base64,'))return false;
      s.photo=image;
      s.photoBonus=10;
      return true;
    }catch{return false;}
  }
  function session(state,done,back,onFrameProgress) {
    dispose();
    const root=document.getElementById('flow'),members=membersOf(state);
    const s={state,done,back,onFrameProgress,root,members,memberIndex:0,memberExpressions:[],epoch:0,stops:[],phase:0,
      handScore:0,poses:[],photo:null,stream:null,streamRequest:null,streamError:null,streamGeneration:0};
    active=s;s.leave=()=>dispose();window.addEventListener('pagehide',s.leave);
    s.observer=new MutationObserver(()=>{
      if(active===s&&(!root.querySelector('.ig-wrap')||root.hidden))dispose();
    });
    s.observer.observe(root,{childList:true,attributes:true,attributeFilter:['hidden']});
    return s;
  }
  function paint(s,title,detail,content,finish=false) {
    closeResources(s);s.root.hidden=false;
    s.root.innerHTML='<article class="ig-wrap"><header class="ig-top"><button class="ig-exit ig-ghost" type="button">← 返回上一步</button><span class="ig-kicker"></span></header><div class="ig-heading"><div class="ig-eyebrow"></div><h1></h1><p></p></div><div class="ig-inner"></div></article>';
    const get=q=>s.root.querySelector(q);
    get('.ig-kicker').textContent=finish?'返馆 · 雾面签名':'体验馆 · 开场装置';
    get('.ig-eyebrow').textContent=finish?'RETURN STUDIO':'装置 '+(s.phase+1)+' / 3';
    get('.ig-heading h1').textContent=title;
    get('.ig-heading p').textContent=detail;
    get('.ig-inner').innerHTML=content;
    get('.ig-exit').onclick=()=>{
      if(!finish&&s.phase>0){s.phase--;showStation(s);}
      else {const cb=s.back;dispose();if(cb)cb();else window.showMallHome?.();}
    };
    s.root.scrollIntoView?.({block:'start',behavior:'instant'});
    return get;
  }
  function imageFor(id) {
    const image=new Image(),number=clamp(Number(id)||1,1,8);
    image.src=window.MallAvatarImages?.[number-1]||new URL('ip-'+number+'.webp',assetBase).href;
    return image;
  }
  function showEarnedPoints(s){
    const total=s.handScore+(s.photoBonus||0)+s.poses.reduce((sum,pose)=>sum+pose.score,0);
    s.root.querySelector('.ig-kicker').textContent=(s.preview?'试玩积分':'本趟互动积分')+' · '+total+' 分';
  }
  function stationChoice(buttonClass, note) {
    return `<nav class="ig-station-choice" aria-label="装置去向">
      <span>${note}</span><button class="${buttonClass}" type="button"></button>
    </nav>`;
  }
  async function obtainStream(s) {
    if(s.stream?.getVideoTracks().some(t=>t.readyState==='live'))return s.stream;
    if(s.streamError)throw s.streamError;
    if(location.protocol==='file:'||!navigator.mediaDevices?.getUserMedia)throw new Error('local');
    if(!s.streamRequest){
      const version=s.streamGeneration;
      s.streamRequest=navigator.mediaDevices.getUserMedia({
        video:{facingMode:'user',width:{ideal:1280},height:{ideal:720}},audio:false
      }).then(st=>{
        if(active!==s||version!==s.streamGeneration){st.getTracks().forEach(t=>t.stop());throw new Error('left');}
        s.stream=st;return st;
      }).catch(e=>{if(version===s.streamGeneration)s.streamError=e;throw e;}).finally(()=>{s.streamRequest=null;});
    }
    return s.streamRequest;
  }
  function sensorReason(e) {
    if(e.name==='NotAllowedError')return '摄像头未获授权。';
    if(e.name==='NotFoundError'||e.name==='NotReadableError')return '没有可用的摄像头。';
    if(e.message==='local')return '本页未连接本地摄像头服务。';
    return '镜头识别暂时不可用。';
  }
  async function makeDetector(kind,mode,count=1) {
    const {vision,files}=await loadVision(),[klass,file,options]=configs[kind];
    return vision[klass].createFromOptions(files,{
      baseOptions:{modelAssetPath:new URL(file,mediaBase).href,delegate:'CPU'},
      runningMode:mode,...options,...(kind==='pose'?{numPoses:count}:{}),
      ...(kind==='pose'&&mode==='IMAGE'?{minPoseDetectionConfidence:.34,minPosePresenceConfidence:.38}:{})
    });
  }
  // One permission request / live track across the three installation rooms.
  // Detectors belong to a room; leaving a room cancels its inference and releases its WASM resources.
  function watch(s,kinds,video,callbacks,number=1) {
    const epoch=s.epoch,detectors=new Map();let id,ended=false;
    const current=()=>active===s&&epoch===s.epoch&&!ended;
    function stop(){
      if(ended)return;ended=true;cancelAnimationFrame(id);
      video.pause();video.srcObject=null;
      for(const detector of detectors.values()){try{detector.close();}catch(_){}}
      detectors.clear();
    }
    s.stops.push(stop);
    (async()=>{
      try{
        const stream=await obtainStream(s);if(!current())return;
        video.srcObject=stream;video.muted=true;video.playsInline=true;await video.play();
        if(!current())return;
        for(const kind of kinds){
          const d=await makeDetector(kind,'VIDEO',number);
          if(!current()){d.close();return;}detectors.set(kind,d);
        }
        callbacks.ready?.();let last=-1,lastTime=-1;
        function loop(now){
          if(!current())return;
          if(!document.hidden&&video.readyState>=2&&video.currentTime!==lastTime&&now-last>=82){
            lastTime=video.currentTime;last=now;
            try{
              const result={};for(const [kind,d] of detectors)result[kind]=d.detectForVideo(video,now);
              callbacks.frame(result,now);
            }catch(e){stop();callbacks.failed(sensorReason(e));return;}
          }
          id=raf(loop);
        }
        id=raf(loop);
      }catch(e){if(current()){stop();callbacks.failed(sensorReason(e));}}
    })();
    return stop;
  }
  // The separate return studio keeps its opt-in mirror switch.
  function hookCamera(s,kind,video,button,status,onFrame,onReady,afterStop) {
    let end=null;const name=button.textContent;
    button.onclick=()=>{
      if(end){end();end=null;releaseStream(s);button.textContent=name;afterStop?.();status.textContent='镜头已关闭。';return;}
      s.streamError=null;button.disabled=true;status.textContent='正在打开镜头…';
      end=watch(s,[kind],video,{
        ready(){button.disabled=false;button.textContent='关闭镜头';onReady?.();},
        failed(reason){button.disabled=false;button.textContent=name;end=null;afterStop?.();status.textContent=reason;},
        frame(result,now){onFrame(result[kind],now);}
      });
    };
  }
  function frameLoop(s,draw) {let id;const loop=t=>{draw(t);id=raf(loop);};id=raf(loop);s.stops.push(()=>cancelAnimationFrame(id));}
  function next(s){s.phase++;showStation(s);}
  function showStation(s){[faceStation,kitchenStation,poseStation][s.phase](s);}
  function handShape(p) {
    if (!p || p.length<21) return null;
    const span=Math.max(.025,dist(p[0],p[9]));
    const extended=[8,12,16,20].map(t=>dist(p[0],p[t])>dist(p[0],p[t-2])+span*.17);
    return {open:extended.every(Boolean), closed:extended.every(v=>!v),
      point:extended[0] && !extended[1] && !extended[2] && !extended[3],
      pinch:dist(p[4],p[8])/span};
  }
  function faceStation(s) {
    const get=paint(s,labels[0],'轮到谁，谁站在镜头前。捏住空气往旁边拉，看看自己的角色会变成什么样。',`
      <div class="ig-grid"><div class="ig-stage ig-face-stage"><canvas class="ig-face" tabindex="0" width="660" height="510" aria-label="角色表情镜，左右拖动可以拉伸脸颊"></canvas><video class="ig-face-preview" autoplay muted playsinline hidden></video><span class="ig-sticker"></span><output class="ig-face-label"></output></div>
      <div class="ig-tools ig-steps"><div class="ig-round"></div><h2 class="ig-member-heading"></h2><p>看向镜头，眨眼、微笑或张嘴，角色会跟着你做。用拇指和食指捏住空气，再向左或向右拉，就能拉长角色的脸颊。</p><div class="ig-member-row" aria-label="参与成员"></div>
      <p class="ig-status" role="status">正在请求镜头权限，请看向镜头。</p><button class="ig-next" type="button"></button></div></div>`);
    const canvas=get('.ig-face'),status=get('.ig-status'),video=get('video'),out=get('output'),ctx=canvas.getContext('2d');
    const faceAnchors=[
      [.435,.56,.145,.503,.174],[.437,.568,.216,.50,.252],[.368,.622,.163,.491,.213],[.415,.57,.195,.50,.23],
      [.56,.72,.16,.64,.195],[.455,.606,.163,.532,.191],[.48,.618,.17,.55,.206],[.375,.585,.177,.48,.226]
    ];
    const skinColors=['#78cdf0','#ff8c91','#ffd45d','#cba9df','#56bf88','#ff9e42','#86a9f1','#bee669'];
    const names=['原样微笑','灿烂笑脸','拉长脸','眨眼笑','惊喜脸'];
    let member,image,anchors,skin,sampled=false,shape=0,value=1,pull=0,drag=null,pinchStart=null;
    let stamp=0,settled=-1,cameraReady=false,failed=false,lastMeaningful='原样微笑';
    function setFace(n,amount=1,stretch=pull) {
      if(n!==shape||Math.abs(amount-value)>.025||Math.abs(stretch-pull)>.01)stamp=performance.now();
      shape=n;value=amount;pull=stretch;
      const text=Math.abs(pull)>.12?(pull>0?'右颊拉长':'左颊拉长'):names[n];
      if(text!=='原样微笑')lastMeaningful=text;
      if(out.textContent!==text)out.textContent=text;
    }
    function changeMember() {
      member=s.members[s.memberIndex];image=imageFor(member.avatarId);anchors=faceAnchors[member.avatarId-1];skin=skinColors[member.avatarId-1];
      sampled=false;settled=-1;stamp=performance.now();pinchStart=drag=null;
      lastMeaningful=s.memberExpressions[s.memberIndex]?.expression||'原样微笑';setFace(0,1,0);
      get('.ig-member-heading').textContent=member.name+'，到你啦';
      get('.ig-round').textContent='成员 '+(s.memberIndex+1)+' / '+s.members.length;
      get('.ig-sticker').textContent=member.name+'的表情镜';
      get('.ig-next').textContent=s.memberIndex===s.members.length-1?'全员就绪，去手势厨房 →':'换 '+s.members[s.memberIndex+1].name+' →';
      get('.ig-member-row').replaceChildren(...s.members.map((m,i)=>{
        const chip=document.createElement('span');chip.className='ig-member'+(i===s.memberIndex?' ig-current':'');
        const portrait=imageFor(m.avatarId);portrait.alt='';chip.append(portrait,document.createTextNode(m.name));return chip;
      }));
    }
    function draw(now) {
      if(image.complete && image.naturalWidth && now-stamp>570 && settled===stamp)return;
      if(image.complete && image.naturalWidth && now-stamp>570)settled=stamp;
      ctx.clearRect(0,0,660,510);
      ctx.save();ctx.translate(330,438);
      ctx.fillStyle='rgba(26,39,39,.12)';ctx.beginPath();ctx.ellipse(0,8,105,14,0,0,Math.PI*2);ctx.fill();
      if (image.complete&&image.naturalWidth) {
        const sc=Math.min(340/image.width,382/image.height), h=image.height*sc, w=image.width*sc;
        const wave=Math.sin((now-stamp)*.018)*Math.exp(-Math.max(0,now-stamp)*.005)*.05;
        const phase=shape===1?.34*value:shape===2?-.24*value:shape===3?.045:shape===4?.10:0;
        const warped=t=>1+(phase+wave)*Math.exp(-Math.pow((t-anchors[4])/.145,2))+Math.abs(pull)*1.05*Math.exp(-Math.pow((t-anchors[4])/.10,2));
        const cheekAt=t=>Math.exp(-Math.pow((t-anchors[4])/.10,2));
        const squeezeAt=t=>(shape===3?Math.sin(t*Math.PI)*6:0)+pull*38*cheekAt(t);
        const xy=(u,t)=>({x:(u-.5)*w*warped(t)+squeezeAt(t),y:-h+t*h});
        for(let j=0;j<96;j++){
          const t=j/96, localScale=warped(t);
          const dy=-h+t*h, squeeze=squeezeAt(t);
          ctx.drawImage(image,0,t*image.height,image.width,Math.max(1,image.height/96),-w*localScale/2+squeeze,dy,w*localScale,h/96+.8);
        }
        if(!sampled){
          sampled=true;
          try{
            const probe=document.createElement('canvas');probe.width=probe.height=1;
            const pc=probe.getContext('2d',{willReadFrequently:true});
            pc.drawImage(image,Math.floor(anchors[3]*image.width),Math.floor((anchors[4]+.045)*image.height),1,1,0,0,1,1);
            const rgb=pc.getImageData(0,0,1,1).data;skin='rgb('+rgb[0]+','+rgb[1]+','+rgb[2]+')';
          }catch(_){}
        }
        const mouth=xy(anchors[3],anchors[4]);
        if(shape===4){
          ctx.fillStyle=skin;ctx.beginPath();ctx.ellipse(mouth.x,mouth.y,17,10,0,0,Math.PI*2);ctx.fill();
          const opening=6+Math.max(.15,value)*8;
          ctx.fillStyle='#242523';ctx.beginPath();ctx.ellipse(mouth.x,mouth.y+2,9.5,opening,0,0,Math.PI*2);ctx.fill();
          ctx.fillStyle='#ff8fa3';ctx.beginPath();ctx.ellipse(mouth.x,mouth.y+opening*.65,5.2,3.6,0,0,Math.PI*2);ctx.fill();
        }else if(shape===3){
          for(const u of anchors.slice(0,2)){
            const p=xy(u,anchors[2]);ctx.fillStyle=skin;ctx.beginPath();ctx.ellipse(p.x,p.y,5.8,5.3,0,0,Math.PI*2);ctx.fill();
            ctx.strokeStyle='#192522';ctx.lineWidth=2.3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(p.x-4,p.y+1);ctx.quadraticCurveTo(p.x,p.y-3,p.x+4,p.y+1);ctx.stroke();
          }
        }else if(shape===1){
          ctx.fillStyle=skin;ctx.beginPath();ctx.ellipse(mouth.x,mouth.y,14,8,0,0,Math.PI*2);ctx.fill();
          ctx.strokeStyle='#192522';ctx.lineWidth=3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(mouth.x-10,mouth.y-3);
          ctx.quadraticCurveTo(mouth.x,mouth.y+9+value*2,mouth.x+10,mouth.y-3);ctx.stroke();
          ctx.fillStyle='rgba(247,107,127,.6)';
          for(const u of [anchors[0]-.032,anchors[1]+.032]){
            const p=xy(u,anchors[2]+.028);ctx.beginPath();ctx.ellipse(p.x,p.y,4.3,2.5,0,0,Math.PI*2);ctx.fill();
          }
        }
      }
      ctx.restore();
    }
    function touchPull(dx){setFace(0,1,clamp(dx/84,-1.35,1.35));}
    canvas.onpointerdown=e=>{drag=e.clientX;canvas.setPointerCapture(e.pointerId);};
    canvas.onpointermove=e=>{if(drag!==null)touchPull(e.clientX-drag);};
    canvas.onpointerup=canvas.onpointercancel=()=>{drag=null;};
    canvas.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();touchPull(e.key==='ArrowLeft'?-75:75);}};
    const originalBack=get('.ig-exit').onclick;
    get('.ig-exit').onclick=()=>{if(s.memberIndex>0){s.memberIndex--;changeMember();}else originalBack();};
    get('.ig-next').onclick=()=>{
      s.memberExpressions[s.memberIndex]={...member,expression:lastMeaningful};
      if(s.memberIndex+1<s.members.length){s.memberIndex++;changeMember();}else next(s);
    };
    changeMember();frameLoop(s,draw);
    watch(s,['face','hand'],video,{
      ready(){cameraReady=true;video.hidden=false;status.textContent='镜头已开启，请把脸和一只手放进画面。';},
      failed(reason){failed=true;status.textContent=reason+' 直接左右拖动角色脸颊；也可聚焦角色后按方向键。';},
      frame(result){
        if(drag!==null)return;
        const p=result.hand.landmarks?.[0],hand=handShape(p);
        if(hand?.pinch<.28&&pinchStart===null)pinchStart=1-(p[4].x+p[8].x)/2;
        if(!hand||hand.pinch>.53)pinchStart=null;
        const stretch=pinchStart!==null?clamp((1-(p[4].x+p[8].x)/2-pinchStart)*5.0,-1.45,1.45):0;
        const cats=result.face.faceBlendshapes?.[0]?.categories, scores=Object.fromEntries((cats||[]).map(c=>[c.categoryName,c.score]));
        if(scores.jawOpen>.28)setFace(4,clamp(scores.jawOpen*1.8,.4,1.6),stretch);
        else if(Math.max(scores.eyeBlinkLeft||0,scores.eyeBlinkRight||0)>.39)setFace(3,1,stretch);
        else if(Math.max(scores.mouthSmileLeft||0,scores.mouthSmileRight||0)>.30)setFace(1,1,stretch);
        else setFace(0,1,stretch);
        const hint=pinchStart!==null?'已捏住。保持两指捏合，把手向左或向右移动。':cats?'再试试看：捏合后往外拉，角色的脸颊会跟着变长。':'请看向镜头；镜头中暂时没有识别到脸。';
        if(status.textContent!==hint)status.textContent=hint;
      }
    });
    const waiting=setTimeout(()=>{if(!cameraReady&&!failed)status.textContent='正在等待镜头权限；现在也可以直接拖动脸颊。';},5500);
    s.stops.push(()=>clearTimeout(waiting));
  }
  const kitchenKeys={
    pasta:['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'],
    wok:['ArrowUp','ArrowDown'],
    hotpot:['ArrowDown','ArrowUp']
  };
  const keyArrows={ArrowRight:'→',ArrowDown:'↓',ArrowLeft:'←',ArrowUp:'↑'};

  // Fit a complete loop or an out-and-back stroke. Size and position can vary
  // between visitors; radial deviation, direction changes, and drift reduce the fit.
  function assessCookingStroke(motion,points) {
    let live=0;
    // A short lead-in allows the hand to settle without scoring isolated pieces of a scribble.
    const leadIn=Math.min(12,Math.floor(points.length*.30));
    for(let i=0;i<=leadIn&&i<points.length-2;i++){
      const stroke=points.slice(i),start=stroke[0],end=stroke.at(-1);
      let quality,coverage,complete;
      if(motion==='pasta'){
        const xs=stroke.map(p=>p.x),ys=stroke.map(p=>p.y);
        const left=Math.min(...xs),top=Math.min(...ys),w=Math.max(...xs)-left,h=Math.max(...ys)-top;
        if(w<.09||h<.06||h/w<.25||w/h<.32)continue;
        let net=0,turn=0,radiusError=0,largestTurn=0,lastAngle;
        for(const p of stroke){
          const x=2*(p.x-left)/w-1,y=2*(p.y-top)/h-1;
          const angle=Math.atan2(y,x);
          radiusError+=Math.pow(Math.hypot(x,y)-1,2);
          if(lastAngle!==undefined){
            const delta=Math.atan2(Math.sin(angle-lastAngle),Math.cos(angle-lastAngle));
            net+=delta;turn+=Math.abs(delta);largestTurn=Math.max(largestTurn,Math.abs(delta));
          }
          lastAngle=angle;
        }
        const sweep=Math.abs(net),consistency=turn?sweep/turn:0;
        const gap=Math.hypot((end.x-start.x)*2/w,(end.y-start.y)*2/h);
        quality=clamp(1-1.55*Math.sqrt(radiusError/stroke.length))*consistency;
        coverage=clamp(sweep/(2*Math.PI));
        complete=stroke.length>=8&&sweep>=1.85*Math.PI&&gap<=.46&&consistency>.87&&largestTurn<1.10;
      }else{
        const dx=motion==='wok'?Math.SQRT1_2:0,dy=motion==='wok'?-Math.SQRT1_2:1;
        let peak=0,along=0,lateralError=0,length=0,largestStep=0;
        let previous=start;
        for(const p of stroke){
          const x=p.x-start.x,y=p.y-start.y;
          along=x*dx+y*dy;peak=Math.max(peak,along);
          lateralError+=Math.pow(y*dx-x*dy,2);
          const step=dist(previous,p);length+=step;largestStep=Math.max(largestStep,step);previous=p;
        }
        if(peak<.035)continue;
        const returned=clamp(1-Math.abs(along)/peak);
        const directness=clamp((2*peak-along)/Math.max(length,.001));
        quality=clamp(1-1.8*Math.sqrt(lateralError/stroke.length)/peak)*directness;
        coverage=clamp(peak/.18)*(.5+.5*returned);
        complete=stroke.length>=6&&peak>=.15&&returned>=.86&&dist(start,end)<=peak*.28&&directness>.80&&largestStep<=peak*.57;
      }
      if(complete&&quality>=.52)return {score:Math.round(10*quality),complete:true};
      live=Math.max(live,coverage*quality);
    }
    return {score:Math.min(9,Math.round(live*10)),complete:false};
  }
  function kitchenStation(s) {
    const dishes=window.MallMedia.dishes;
    if(!s.kitchen){
      s.kitchen={served:0,cooking:false,earnedByDish:dishes.map(()=>null),methods:dishes.map(()=>null)};
      s.handActivity='kitchen';
    }
    const kitchen=s.kitchen;
    const get=paint(s,labels[1],'跟着片头的虚线，用食指为三家餐厅各做一道菜。',`
      ${stationChoice('ig-skip-kitchen',s.preview?'可随时结束本次试玩':'已获得的积分会保留')}
      <div class="ig-kitchen"><div class="ig-cook-screen"></div>
      <section class="ig-cook-ticket" aria-label="餐厅手势任务">
        <div class="ig-cook-head"><span class="ig-course"></span></div>
        <h2 class="ig-restaurant"></h2><p class="ig-dish-name"></p>
        <div class="ig-cook-ledger"><div class="ig-cook-live"><span>本轮动作拟合</span><strong><b>0</b> / 10</strong></div>
          <div><span>厨房动作累计</span><strong class="ig-cook-score"></strong></div>
          <div><span>旅程合照</span><strong class="ig-cook-photo-points"></strong></div></div>
        <div class="ig-gesture-panel"><video class="ig-film-camera" playsinline muted autoplay hidden></video>
          <canvas class="ig-cook-pad" width="480" height="240" tabindex="0" aria-describedby="ig-cook-hint ig-cook-keys"></canvas></div>
        <p class="ig-cook-hint" id="ig-cook-hint"></p><p class="ig-cook-keys" id="ig-cook-keys"></p>
        <p class="ig-cook-status" role="status"></p>
        <div class="ig-cook-photo-row"><button type="button" class="ig-alt ig-cook-photo" disabled>拍合照 +10</button><small class="ig-cook-photo-note" role="status">正在连接镜头</small></div>
        <div class="ig-cook-controls"><button type="button" class="ig-alt ig-resume-film" hidden>播放影片</button>
          <button type="button" class="ig-cook-watch">直接看成片</button></div>
        <div class="ig-cook-sound"><audio preload="auto"></audio><button type="button" class="ig-sound-toggle">播放录屏原声</button><button type="button" class="ig-sound-rewind" hidden>从头听</button></div>
        <button type="button" class="ig-next" hidden>进入全员油画框 →</button>
      </section></div>`);
    const epoch=s.epoch,screen=get('.ig-cook-screen'),pad=get('.ig-cook-pad'),ctx=pad.getContext('2d');
    const camera=get('.ig-film-camera'),status=get('.ig-cook-status'),watchOnly=get('.ig-cook-watch'),play=get('.ig-resume-film'),nextBtn=get('.ig-next');
    const keys=get('.ig-cook-keys'),skip=get('.ig-skip-kitchen'),photo=get('.ig-cook-photo'),photoNote=get('.ig-cook-photo-note');
    const liveLabel=get('.ig-cook-live span'),liveValue=get('.ig-cook-live b');
    const audio=get('.ig-cook-sound audio'),soundButton=get('.ig-sound-toggle'),rewind=get('.ig-sound-rewind');
    audio.src=new URL('kitchen/recording.m4a',assetBase).href;
    function soundLabel(){
      soundButton.textContent=audio.ended?'重播录屏原声':audio.paused?
        (audio.currentTime>.1?'继续播放原声':'播放录屏原声'):'暂停录屏原声';
      rewind.hidden=audio.ended||audio.currentTime<=.1;
    }
    function playSound(fromStart=false){
      if(fromStart||audio.ended)audio.currentTime=0;
      kitchen.soundPaused=false;
      audio.play().catch(()=>{if(!audio.error)soundLabel();});
    }
    soundButton.onclick=()=>{if(audio.paused||audio.ended)playSound();else{kitchen.soundPaused=true;audio.pause();}};
    rewind.onclick=()=>playSound(true);
    audio.onloadedmetadata=()=>{
      if(kitchen.soundTime>0&&kitchen.soundTime<audio.duration)audio.currentTime=kitchen.soundTime;
      soundLabel();
    };
    audio.onplay=audio.onpause=audio.ontimeupdate=audio.onended=soundLabel;
    audio.onerror=()=>{soundButton.textContent='录屏原声暂时不可用';soundButton.disabled=true;rewind.hidden=true;};
    if(!kitchen.soundPaused)playSound();
    function leavePreview(){const exit=s.back;dispose();exit?.();}
    if(s.preview){
      get('.ig-kicker').textContent='体验馆 · 厨房试玩';get('.ig-eyebrow').textContent='手势互动';
      get('.ig-exit').textContent='← 返回体验馆';get('.ig-exit').onclick=leavePreview;nextBtn.textContent='返回体验馆 →';
    }
    let movie=null,customURL=null,loadRevision=0,firstLoop=true,failure=false,keyStep=0,pointer=null,traceSource='',trace=[];
    let lastInput=0,lastPlayTime=0,lastTick=0,readyForGesture=false,leaving=false,keyErrors=0;
    const here=()=>active===s&&s.epoch===epoch&&!leaving;
    const finished=()=>kitchen.served>=dishes.length;
    const course=()=>dishes[Math.min(kitchen.served,dishes.length-1)];
    const playingAction=()=>kitchen.cooking||finished();
    const boundary=()=>Number.isFinite(movie?.duration)?movie.duration/3:2;
    const methodLabel={camera:'镜头拟合',touch:'拖动拟合',keys:'键盘辅助',watch:'直接看片'};
    function displayFit(label,value){
      if(liveLabel.textContent!==label)liveLabel.textContent=label;
      if(liveValue.textContent!==String(value))liveValue.textContent=String(value);
    }
    function refreshTicket(){
      showEarnedPoints(s);
      const i=Math.min(kitchen.served,dishes.length-1),value=kitchen.earnedByDish?.[i];
      if(value!=null)displayFit(methodLabel[kitchen.methods?.[i]]||'本轮得分',value);
      else displayFit(finished()?'本轮记录':'本轮动作拟合',finished()?'—':0);
      get('.ig-cook-score').textContent=s.handScore+' / 30';
      get('.ig-cook-photo-points').textContent=(s.photoBonus||0)+' / 10';
      photo.textContent=s.photoBonus?'重拍合照':'拍合照 +10';
      const destination=s.preview?'返回体验馆':'进入全员油画框';
      skip.textContent=(finished()?'':s.preview?'跳过试玩，':'跳过装置 2，')+destination;
      nextBtn.hidden=!finished();watchOnly.hidden=finished()||(!failure&&kitchen.cooking);
      get('.ig-gesture-panel').hidden=finished()&&camera.hidden;keys.hidden=finished();
    }
    function saveKitchen(){s.onFrameProgress?.(gameResult(s));}
    function cameraReady(){
      const available=camera.readyState>=2&&camera.videoWidth>0&&camera.srcObject?.getVideoTracks().some(t=>t.readyState==='live');
      photo.disabled=!available;
      if(available){camera.hidden=false;get('.ig-gesture-panel').hidden=false;photoNote.textContent='全程首张合照加 10 分，重拍可换照片。';}
      return available;
    }
    function keyboardHint(){
      const code=kitchenKeys[course().motion];
      keys.replaceChildren(document.createTextNode('也可在虚线上拖动，或按 '),...code.map((key,i)=>{
        const el=document.createElement('kbd');el.textContent=keyArrows[key];if(i<keyStep)el.className='active';return el;
      }));
    }
    function clearTrace(){trace=[];traceSource='';lastInput=0;}
    function drawPad(){
      const W=pad.width,H=pad.height;
      ctx.clearRect(0,0,W,H);ctx.lineWidth=4;ctx.lineCap='round';ctx.lineJoin='round';
      ctx.strokeStyle=camera.hidden?'#3d6459':'#d2ffbe';ctx.setLineDash([8,10]);
      ctx.beginPath();const motion=course().motion;
      if(motion==='pasta')ctx.ellipse(W*.5,H*.51,W*.24,H*.29,0,0,Math.PI*2);
      else if(motion==='wok'){ctx.moveTo(W*.31,H*.76);ctx.lineTo(W*.69,H*.25);}
      else{ctx.moveTo(W*.5,H*.19);ctx.lineTo(W*.5,H*.79);}
      ctx.stroke();ctx.setLineDash([]);
      if(trace.length){
        ctx.beginPath();ctx.strokeStyle=camera.hidden?'#d8683d':'#ffd15d';ctx.lineWidth=5;
        for(const [i,p] of trace.entries()){if(i)ctx.lineTo(p.x*W,p.y*H);else ctx.moveTo(p.x*W,p.y*H);}
        ctx.stroke();const tip=trace.at(-1);ctx.beginPath();ctx.arc(tip.x*W,tip.y*H,7,0,Math.PI*2);ctx.fillStyle=ctx.strokeStyle;ctx.fill();
      }
    }
    function playCurrent(){
      const target=movie;if(!target||failure||finished())return;
      target.play().then(()=>{if(target===movie)play.hidden=true;}).catch(error=>{
        if(here()&&target===movie&&error.name!=='AbortError')play.hidden=false;
      });
    }
    function loopDemonstration(){
      if(!readyForGesture||playingAction()||failure||!movie||movie.seeking)return;
      if(movie.currentTime>=boundary()-.015){
        firstLoop=false;movie.currentTime=0;if(movie.paused)playCurrent();
      }
    }
    function startCooking(points,method){
      if(finished()||kitchen.cooking||failure)return;
      kitchen.cooking=true;
      if(kitchen.earnedByDish[kitchen.served]==null){
        kitchen.earnedByDish[kitchen.served]=points;kitchen.methods[kitchen.served]=method;
        s.handScore=Math.min(30,s.handScore+points);
      }
      saveKitchen();
      if(!firstLoop&&movie.readyState>=1)movie.currentTime=boundary();
      status.textContent=points?methodLabel[method]+'，本轮 +'+points+' 分。':'开始看成片，本轮 0 分。';
      clearTrace();drawPad();refreshTicket();playCurrent();
    }
    function record(point,source,now){
      if(playingAction()||failure)return;
      if(traceSource!==source||now-lastInput>470)clearTrace();
      if(trace.length&&dist(trace.at(-1),point)<.008)return;
      lastInput=now;traceSource=source;
      trace.push({...point,t:now});
      while(trace.length>85||now-trace[0].t>5000)trace.shift();
      drawPad();
      const fit=assessCookingStroke(course().motion,trace);
      displayFit(methodLabel[source],fit.score);
      if(fit.complete)startCooking(fit.score,source);
    }
    function endDish(){
      if(finished())return;
      kitchen.served++;kitchen.cooking=false;clearTrace();
      saveKitchen();
      if(finished()){
        loadRevision++;play.hidden=true;refreshTicket();
        get('.ig-course').textContent='三道菜已上齐';get('.ig-cook-hint').textContent='';
        status.textContent=s.preview?'三道餐厅手势已体验完毕。':'厨房体验完成，可以进油画框了。';
      }else showDish();
    }
    function releaseMovie(){
      if(movie){movie.onloadedmetadata=movie.onerror=movie.onended=movie.ontimeupdate=null;
        movie.pause();movie.removeAttribute('src');movie.load();movie.remove();movie=null;}
      if(customURL){URL.revokeObjectURL(customURL);customURL=null;}
    }
    function loadMovie(blob,revision){
      if(!here()||revision!==loadRevision)return;
      releaseMovie();failure=false;readyForGesture=false;play.hidden=true;
      const target=document.createElement('video');movie=target;
      target.className='ig-main-film';target.playsInline=true;target.muted=true;target.preload='auto';
      target.setAttribute('aria-label',course().name+' · '+course().dish);
      if(!blob)target.poster=course().poster;
      screen.append(target);
      function mediaFailed(){
        if(!here()||movie!==target)return;
        if(blob){loadMovie(null,revision);return;}
        failure=true;watchOnly.textContent='跳过这道菜';refreshTicket();play.hidden=true;
        status.textContent='这一道的影片暂时无法播放，可以跳到下一步。';
      }
      target.onerror=mediaFailed;
      target.ontimeupdate=loopDemonstration;
      target.onloadedmetadata=()=>{
        if(!Number.isFinite(target.duration)||target.duration<=0){mediaFailed();return;}
        if(finished()){target.currentTime=Math.max(0,target.duration-.06);return;}
        if(kitchen.cooking&&!firstLoop)target.currentTime=boundary();
        readyForGesture=true;playCurrent();
      };
      target.onended=()=>{
        if(kitchen.cooking){endDish();return;}
        if(!finished()){firstLoop=false;target.currentTime=0;playCurrent();}
      };
      if(blob)customURL=URL.createObjectURL(blob);
      lastTick=performance.now();lastPlayTime=0;target.src=customURL||course().src;target.load();
    }
    function showDish(){
      const revision=++loadRevision,dish=course(),resuming=kitchen.cooking;
      firstLoop=!kitchen.cooking;keyStep=0;keyErrors=0;clearTrace();failure=false;
      get('.ig-course').textContent=finished()?'三道菜已上齐':'第 '+(kitchen.served+1)+' 道，共 '+dishes.length+' 道';
      get('.ig-restaurant').textContent=dish.name;get('.ig-dish-name').textContent=dish.dish;
      get('.ig-cook-hint').textContent=finished()?'':dish.hint;
      pad.setAttribute('aria-label',dish.dish+'触控手势区');
      keyboardHint();status.textContent=finished()?'三道菜已上齐。':kitchen.cooking?'正在播放成片。':'沿虚线做完整个动作，按轨迹拟合度计分。';
      watchOnly.textContent='直接看成片';refreshTicket();drawPad();loadMovie(null,revision);
      window.MallMedia.getVideo(dish.id).then(blob=>{
        if(blob&&here()&&revision===loadRevision&&(!kitchen.cooking||resuming))loadMovie(blob,revision);
      }).catch(()=>{});
    }
    function pointerPoint(e){
      const r=pad.getBoundingClientRect();return {x:clamp((e.clientX-r.left)/r.width),y:clamp((e.clientY-r.top)/r.height)};
    }
    pad.onpointerdown=e=>{if(!e.isPrimary)return;pointer=e.pointerId;clearTrace();pad.focus({preventScroll:true});pad.setPointerCapture(pointer);record(pointerPoint(e),'touch',performance.now());};
    pad.onpointermove=e=>{if(e.pointerId===pointer)record(pointerPoint(e),'touch',performance.now());};
    pad.onpointerup=e=>{if(e.pointerId===pointer){record(pointerPoint(e),'touch',performance.now());pointer=null;}};
    pad.onpointercancel=()=>{pointer=null;clearTrace();drawPad();};
    function keyInput(e){
      if(!here()||playingAction()||failure||!Object.hasOwn(keyArrows,e.key)||e.altKey||e.metaKey||e.ctrlKey)return;
      e.preventDefault();if(e.repeat)return;
      const code=kitchenKeys[course().motion];
      clearTrace();if(e.key!==code[keyStep])keyErrors++;
      keyStep=e.key===code[keyStep]?keyStep+1:Number(e.key===code[0]);keyboardHint();
      const score=Math.round(10*keyStep/(code.length+keyErrors));
      displayFit('键盘辅助',score);
      if(keyStep===code.length)startCooking(Math.max(1,score),'keys');
    }
    document.addEventListener('keydown',keyInput);
    play.onclick=playCurrent;watchOnly.onclick=()=>{if(failure)endDish();else startCooking(0,'watch');};
    skip.onclick=()=>{if(!here())return;if(s.preview)leavePreview();else next(s);};
    photo.onclick=()=>{
      if(!cameraReady()||!captureGroupPhoto(s,camera)){photoNote.textContent='正在等待可用的镜头画面。';return;}
      get('.ig-cook-photo-points').textContent=s.photoBonus+' / 10';photo.textContent='重拍合照';photoNote.textContent='合照已保存，旅程合照分 10 分。';showEarnedPoints(s);saveKitchen();
    };
    camera.onloadeddata=camera.onplaying=cameraReady;
    nextBtn.onclick=()=>{if(finished()){if(s.preview)leavePreview();else next(s);}};
    showDish();saveKitchen();
    watch(s,['hand'],camera,{
      ready(){cameraReady();drawPad();},
      failed(){
        camera.hidden=true;photo.disabled=true;photoNote.textContent='镜头不可用，可继续手势游戏。';drawPad();
        if(s.stream?.getVideoTracks().some(t=>t.readyState==='live')){camera.srcObject=s.stream;camera.play().catch(()=>{});}
      },
      frame(result,now){
        if(playingAction()||failure||pointer!==null)return;
        const landmarks=result.hand.landmarks?.[0],tip=landmarks?.[8];
        if(tip&&dist(landmarks[0],tip)>dist(landmarks[0],landmarks[6])+.008)record({x:1-tip.x,y:tip.y},'camera',now);
      }
    });
    frameLoop(s,now=>{
      if(finished()||failure||!movie)return;
      if(trace.length&&now-lastInput>700){clearTrace();drawPad();displayFit('本轮动作拟合',0);}
      loopDemonstration();
      if(movie.currentTime!==lastPlayTime){lastPlayTime=movie.currentTime;lastTick=now;}
      if(now-lastTick>10000&&(!readyForGesture||(!movie.paused&&kitchen.cooking))){
        if(customURL){loadMovie(null,loadRevision);return;}
        failure=true;status.textContent='影片读取时间较长，可以跳过这道菜。';watchOnly.textContent='跳过这道菜';refreshTicket();
      }
    });
    s.stops.push(()=>{
      leaving=true;loadRevision++;document.removeEventListener('keydown',keyInput);releaseMovie();
      camera.onplaying=camera.onloadeddata=null;camera.pause();camera.srcObject=null;
      kitchen.soundTime=audio.ended?0:audio.currentTime;
      audio.onloadedmetadata=audio.onplay=audio.onpause=audio.ontimeupdate=audio.onended=audio.onerror=null;
      audio.pause();audio.removeAttribute('src');audio.load();
    });
  }
  // Measurements use mirrored, aspect-correct image space, then each person's own torso scale.
  function body(points,aspect) {
    if(!points||points.length<25)return null;
    const p=points.map(v=>({x:(1-v.x)*aspect,y:v.y,v:v.visibility??1}));
    if([11,12].some(i=>!Number.isFinite(p[i].x+p[i].y)||p[i].v<.40))return null;
    const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
    const c=mid(p[11],p[12]),hips=mid(p[23],p[24]);
    const scale=Math.max(.022,dist(p[11],p[12]),Math.min(p[23].v,p[24].v)>.5?dist(c,hips)*.65:0);
    const arms=[[p[11],p[13],p[15]],[p[12],p[14],p[16]]].sort((a,b)=>a[0].x-b[0].x);
    return {c,scale,arms};
  }
  function distinctBodies(raw,aspect) {
    const all=raw.map(p=>body(p,aspect)).filter(Boolean).sort((a,b)=>a.c.x-b.c.x);
    const result=[];
    for(const b of all){
      if(!result.some(a=>dist(a.c,b.c)<.42*Math.min(a.scale,b.scale)))result.push(b);
    }
    return result;
  }
  const near=(n,ideal,tolerance)=>clamp(1-Math.abs(n-ideal)/tolerance);
  const positive=(n,start,best)=>clamp((n-start)/(best-start));
  function straight([a,b,c]){return clamp(dist(a,c)/Math.max(.003,dist(a,b)+dist(b,c)));}
  function poseTasks(n,index) {
    if(index>=2)return Array.from({length:n},(_,i)=>({members:[i],form:index===2?'wings':'v'}));
    const tasks=[];for(let i=0;i+1<n;i+=2)tasks.push({members:[i,i+1],form:index===0?'heart':'five'});
    if(n%2)tasks.push(index===0?{members:[n-1],form:'soloheart'}:{members:[n-2,n-1],form:'five'});
    return tasks;
  }
  function groupFit(people,index,number) {
    if(people.length!==number)return null;
    const features=people.map(()=>[]), wrists=[],sizes=[],owners=[];
    function armOf(i,side){
      const arm=people[i].arms[side];
      if(arm.some(p=>p.v<.40||!Number.isFinite(p.x+p.y)))return null;
      wrists.push(arm[2]);sizes.push(people[i].scale);owners.push(i);return arm;
    }
    for(const task of poseTasks(number,index)){
      const [a,b]=task.members,form=task.form;
      if(task.members.length===2){
        const arms=[armOf(a,form==='heart'?0:1),armOf(b,form==='heart'?1:0)];
        if(arms.some(v=>!v))return null;
        const overlap=near(dist(arms[0][2],arms[1][2])/avg([people[a].scale,people[b].scale]),0,form==='heart'?1.6:1.25);
        [a,b].forEach((id,j)=>{
          const [sh,el,wr]=arms[j],u=people[id].scale,dir=j===0?1:-1,rise=(sh.y-wr.y)/u;
          if(form==='heart')features[id].push(overlap,positive(rise,.12,1.18),positive((wr.x-el.x)*dir/u,.02,.54),positive((sh.y-el.y)/u,.01,.58));
          else features[id].push(overlap,positive(rise,.04,.7),positive((wr.x-sh.x)*dir/u,.08,.72),positive((el.y-wr.y)/u,0,.37));
        });
      }else{
        const arms=[armOf(a,0),armOf(a,1)];if(arms.some(v=>!v))return null;
        const u=people[a].scale;
        if(form==='soloheart')features[a].push(near(dist(arms[0][2],arms[1][2])/u,0,1.15));
        arms.forEach((arm,j)=>{
          const [sh,el,wr]=arm,dir=j===0?-1:1,reach=(wr.x-sh.x)*dir/u,rise=(sh.y-wr.y)/u;
          if(form==='wings')features[a].push(near(rise,0,.8),positive(reach,.18,1.28),positive(straight(arm),.64,.94));
          else if(form==='v')features[a].push(positive(rise,.15,1.04),positive(reach,.05,.75),near(Math.atan2(rise,Math.max(.01,reach)),.88,.88),positive(straight(arm),.65,.94));
          else features[a].push(positive(rise,.14,1.1),positive((el.x-wr.x)*dir/u,.01,.43));
        });
      }
    }
    const individual=features.map(x=>avg(x));
    return {quality:avg(individual),individual,wrists,sizes,owners};
  }
  function targetDrawing(canvas,n,index) {
    const ctx=canvas.getContext('2d'),w=800,h=460;
    canvas.width=w;canvas.height=h;ctx.fillStyle='#fff7e6';ctx.fillRect(0,0,w,h);
    const cell=(w-70)/n, scale=Math.min(1.12,cell/107),sy=242;
    const spacing=Math.min(cell,108*scale),left=(w-n*spacing)/2;
    const persons=Array.from({length:n},(_,i)=>({cx:left+(i+.5)*spacing,arms:[]}));
    const palette=['#8ccfed','#ffafca','#eacc62','#b7a5ef','#9bd59a','#eaa57d','#a6ced5','#d1d969'];
    function arm(person,side,elbow,wrist,heart=false){person.arms[side]=[elbow,wrist,heart];}
    for(const task of poseTasks(n,index)){
      const [a,b]=task.members;
      if(task.members.length===2){
        const mid=(persons[a].cx+persons[b].cx)/2;
        [a,b].forEach((id,i)=>{
          const person=persons[id],dir=i===0?1:-1,dx=(mid-person.cx)/scale;
          if(task.form==='heart')arm(person,i,[dir*-31,-59],[dx,-81],true);
          else arm(person,i===0?1:0,[dir*31,-18],[dx,-46]);
        });
      }else{
        const p=persons[a];
        for(const j of [0,1]){const dir=j===0?-1:1;
          if(task.form==='wings')arm(p,j,[dir*37,0],[dir*Math.min(53,cell/scale*.48),0]);
          else if(task.form==='v')arm(p,j,[dir*31,-31],[dir*48,-57]);
          else arm(p,j,[dir*36,-54],[dir*2,-81],true);
        }
      }
    }
    const line=(points,color,width)=>{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();};
    for(const [i,p] of persons.entries()){
      ctx.save();ctx.translate(p.cx,sy);ctx.scale(scale,scale);
      for(let j=0;j<2;j++){
        const d=j===0?-1:1,[e,t,heart]=p.arms[j]||[[d*20,23],[d*22,44]];
        if(heart){for(const [color,width] of [['#173c3a',12],['#edb690',8]]){
          ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';
          ctx.beginPath();ctx.moveTo(d*14,0);ctx.quadraticCurveTo(e[0]*1.15,e[1]+25,e[0],e[1]);
          ctx.quadraticCurveTo((e[0]+t[0])*.5,-115,t[0],t[1]);ctx.stroke();
        }}else{line([[d*14,0],e,t],'#173c3a',12);line([[d*14,0],e,t],'#edb690',8);}
      }
      for(const d of [-1,1]){line([[d*8,52],[d*10,92],[d*15,94]],'#223f40',12);}
      ctx.fillStyle=palette[i];ctx.strokeStyle='#173c3a';ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(-17,-5,34,61,13);ctx.fill();ctx.stroke();
      ctx.fillStyle='#ffdbb7';ctx.beginPath();ctx.arc(0,-23,16,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.fillStyle='#173c3a';for(const x of [-5,5]){ctx.beginPath();ctx.arc(x,-24,1.6,0,Math.PI*2);ctx.fill();}
      ctx.beginPath();ctx.arc(0,-22,5,.18,Math.PI-.18);ctx.lineWidth=1.7;ctx.stroke();ctx.restore();
      ctx.font='600 17px sans-serif';ctx.textAlign='center';ctx.fillStyle='#576d62';ctx.fillText(String(i+1),p.cx,sy+scale*94+34);
    }
  }
  function gameResult(s){
    const completed=s.poses.slice();
    const data={
      pointRule:2,poses:completed,poseSkipped:poses.length-completed.length,
      poseTotal:completed.length?completed.reduce((sum,p)=>sum+p.score,0):null,
      memberCount:s.members.length,handScore:s.handScore,photoBonus:s.photoBonus||0,
      memberExpressions:s.memberExpressions.slice(),expression:s.memberExpressions[0]?.expression||'原样微笑',
      gameStage:s.phase===1?'kitchen':'frame'
    };
    if(s.photo)data.photo=s.photo;
    if(s.handActivity)data.handActivity=s.handActivity;
    if(Array.isArray(s.kitchen?.earnedByDish)){
      const {served,cooking,earnedByDish,methods}=s.kitchen;
      data.kitchenProgress={served,cooking,earnedByDish:earnedByDish.slice(),methods:methods?.slice()||[]};
    }
    return data;
  }
  function poseStation(s) {
    const n=s.members.length,marks=[.43,.67,.35,.57];
    let index=Math.min(s.poses.length,3),roundScore=null,mode='loading',quality=null,capture=false,eligibleSince=0;
    let previous=null,previousTime=0,samples=[],start=0,shownCount=0,beat=0,taps=[],lastGood=performance.now();
    const get=paint(s,labels[2],n+' 位成员一起入镜，按动作卡摆出四个造型。每轮最高 25 分。',`
      ${stationChoice('ig-skip','已获得的积分会保留')}
      <div class="ig-grid"><div class="ig-stage ig-pose-stage"><div class="ig-oil"><i class="ig-corner c1">✣</i><i class="ig-corner c2">✣</i><i class="ig-corner c3">✣</i><i class="ig-corner c4">✣</i>
      <div class="ig-portrait"><canvas class="ig-pose-art"></canvas><img class="ig-pair-art" alt="" hidden><video class="ig-pose-video" playsinline muted autoplay hidden></video><span class="ig-plaque"></span></div></div>
      <div class="ig-touch-game" hidden><div class="ig-beat"><span class="ig-target"></span><span class="ig-needle"></span></div><div class="ig-roster-taps"></div></div></div>
      <div class="ig-tools"><div class="ig-round"></div>
      <h2 class="ig-pose-title"></h2><p class="ig-pose-hint"></p><div class="ig-small-guide" hidden><canvas></canvas><img alt="" hidden></div>
      <p class="ig-method ig-seats"></p><div class="ig-frame-points">
        <div><small class="ig-live-source">实时动作拟合</small><b><span class="ig-live-score">—</span><small> / 25</small></b></div>
        <div><small>已记动作分</small><b class="ig-frame-bank">0</b></div>
        <div><small>本趟合照分</small><b><span class="ig-photo-points">0</span><small> / 10</small></b></div>
      </div><p class="ig-live-detail"></p>
      <strong class="ig-count" aria-live="polite"></strong><p class="ig-status" role="status"></p><p class="ig-method"></p>
      <button class="ig-alt ig-assist" hidden>全队改用节奏接力</button><button class="ig-take" hidden>记录当前姿势</button>
      <div class="ig-scores"></div><div class="ig-camline"><button class="ig-alt ig-redo" hidden>重试本轮</button><button class="ig-alt ig-photo" hidden>保存画框合照</button></div>
      <button class="ig-next" disabled></button></div></div>`);
    const vid=get('video'),status=get('.ig-status'),take=get('.ig-take'),nextBtn=get('.ig-next'),touch=get('.ig-touch-game'),epoch=s.epoch;
    const guide=get('.ig-small-guide'),guideImg=guide.querySelector('img'),guideCanvas=guide.querySelector('canvas');
    const tapHost=get('.ig-roster-taps'),count=get('.ig-count'),skipBtn=get('.ig-skip');
    get('.ig-seats').textContent='个人动作按大屏画面从左到右记分。请依次站好：'+s.members.map(m=>m.name).join('、')+'。';
    const liveNumber=get('.ig-live-score'),liveKind=get('.ig-live-source'),liveDetail=get('.ig-live-detail');
    function bank(){
      showEarnedPoints(s);
      get('.ig-frame-bank').textContent=String(s.poses.reduce((sum,p)=>sum+p.score,0));
      get('.ig-photo-points').textContent=String(s.photoBonus||0);
    }
    function live(score=null,primary=null,extra=null,method=mode==='touch'?'全员节奏':'全员镜头',saved=false){
      const rhythm=method==='全员节奏';
      const kind=(saved?'已记':'实时')+(rhythm?'落拍分':method==='全员镜头'?'动作拟合':'动作分');
      const number=score===null?'—':String(score);
      const detail=primary==null?'':(rhythm?'落拍精度 ':'动作相似度 ')+primary+'/20 · '+(rhythm?'全队同步 ':'稳定度 ')+(extra??'—')+'/5';
      if(liveKind.textContent!==kind)liveKind.textContent=kind;
      if(liveNumber.textContent!==number)liveNumber.textContent=number;
      if(liveDetail.textContent!==detail)liveDetail.textContent=detail;
    }
    const keys=Array.from({length:n},(_,i)=>'Digit'+(i+1));
    let stopWatch=null,regionModel=null,regionPending=false,regionCache=null,regionTime=0,regionGeneration=0;
    const regionCanvas=document.createElement('canvas'),snapshotCanvas=document.createElement('canvas');
    function releaseRegion(){
      regionGeneration++;regionPending=false;regionCache=null;
      try{regionModel?.close();}catch(_){}regionModel=null;
    }
    s.stops.push(releaseRegion);
    function maybeRecover(raw,now){
      const aspect=vid.videoWidth/vid.videoHeight||1.33;
      const full=distinctBodies(raw,aspect);
      if(full.length>=n || (!full.length&&n===2)){regionCache=null;return raw;}
      if(!regionModel){
        if(!regionPending){
          regionPending=true;const generation=regionGeneration;
          makeDetector('pose','IMAGE',1).then(d=>{
            if(active!==s||s.epoch!==epoch||mode!=='camera'||generation!==regionGeneration){d.close();return;}
            regionModel=d;
          }).catch(()=>{}).finally(()=>{if(generation===regionGeneration)regionPending=false;});
        }
        return raw;
      }
      const interval=!full.length&&!(regionCache?.length)?650:165;
      if(regionCache&&now-regionTime<interval)return regionCache;
      regionTime=now;
      const w=vid.videoWidth,h=vid.videoHeight,candidates=raw.slice();
      const vertical=raw.flatMap(points=>points.filter(p=>(p.visibility??1)>.55&&p.y>=0&&p.y<=1).map(p=>p.y));
      const ymin=vertical.length?Math.min(...vertical):0,ymax=vertical.length?Math.max(...vertical):1;
      const pad=Math.max(.055,(ymax-ymin)*.16),top=clamp(ymin-pad),bottom=clamp(ymax+pad),depth=Math.max(.3,bottom-top);
      const centers=full.map(b=>1-b.c.x/aspect);
      // Infer from a frozen moment: all lane crops and the full-frame result
      // refer to the same video frame. Never join skeletons from successive moments.
      const missing=[];
      for(let lane=0;lane<n;lane++)if(!centers.some(x=>Math.floor(clamp(x,0,.9999)*n)===lane))missing.push(lane);
      if(!missing.length)return raw;
      const still=snapshotCanvas;
      if(still.width!==w||still.height!==h){still.width=w;still.height=h;}
      still.getContext('2d').drawImage(vid,0,0);
      for(const lane of missing){
        const lo=Math.max(0,(lane-.14)/n),hi=Math.min(1,(lane+1.14)/n),fraction=hi-lo;
        const hh=Math.max(2,Math.round(Math.min(h*depth,480))),ww=Math.max(2,Math.round(w*fraction*hh/(h*depth)));
        if(regionCanvas.width!==ww||regionCanvas.height!==hh){regionCanvas.width=ww;regionCanvas.height=hh;}
        regionCanvas.getContext('2d').drawImage(still,w*lo,h*top,w*fraction,h*depth,0,0,ww,hh);
        try{
          const single=regionModel.detect(regionCanvas).landmarks?.[0];if(!single)continue;
          const projected=single.map(p=>({...p,x:p.x*fraction+lo,y:p.y*depth+top}));
          const candidate=body(projected,aspect);if(!candidate)continue;
          const center=1-candidate.c.x/aspect;
          if(Math.floor(clamp(center,0,.9999)*n)!==lane)continue;
          if(full.some(known=>dist(known.c,candidate.c)<.65*Math.min(known.scale,candidate.scale)))continue;
          full.push(candidate);candidates.push(projected);
        }catch(_){/* A failed crop contributes no person. */}
      }
      regionCache=candidates;return candidates;
    }
    function target() {
      get('.ig-round').textContent='动作卡 '+(index+1)+' / 4';
      get('.ig-pose-title').textContent=poses[index].name;get('.ig-plaque').textContent=poses[index].name;
      let extra='';if(n%2&&index===0)extra='队尾成员用双手在头顶独立比心。';
      if(n%2&&index===1)extra='最后三人连成一组，中间的人双手分别与两边击掌。';
      get('.ig-pose-hint').textContent=poses[index].hint+extra;
      const pair=n===2;for(const img of [get('.ig-pair-art'),guideImg]){img.src=new URL('pose-'+(index+1)+'.webp',assetBase).href;img.alt=poses[index].name+'的双人动作示意';}
      for(const cv of [get('.ig-pose-art'),guideCanvas]){cv.setAttribute('aria-label',n+' 人动作示意，'+poses[index].name);targetDrawing(cv,n,index);}
      const camera=mode==='camera';get('.ig-pair-art').hidden=camera||!pair;get('.ig-pose-art').hidden=camera||pair;
      vid.hidden=!camera;guide.hidden=!camera;guideImg.hidden=!pair;guideCanvas.hidden=pair;
      get('.ig-photo').hidden=!camera;touch.hidden=mode!=='touch';
      get('.ig-photo').textContent=(s.photo?'重拍画框合照':'保存画框合照')+(s.photoBonus?'':' · +10 分');
      get('.ig-target').style.left=(marks[index]*100-8.5)+'%';
    }
    function setCount(v){
      shownCount=v;
      const label=mode==='touch'?'已落拍 '+v+' / '+n:'已入镜 '+v+' / '+n;
      if(count.textContent!==label)count.textContent=label;
    }
    function clearCapture(){quality=null;capture=false;start=eligibleSince=previousTime=0;previous=null;samples=[];take.hidden=true;live();}
    function refreshSkip(){
      const completed=s.poses.length;
      skipBtn.textContent=completed===0?'跳过装置 3，查看报告':completed<poses.length?'跳过剩余动作，查看报告':'查看漫游报告';
    }
    function resetRound(savedScore=null){
      roundScore=null;taps=Array(n).fill(null);clearCapture();lastGood=performance.now();setCount(0);target();
      refreshSkip();bank();
      nextBtn.disabled=true;get('.ig-redo').hidden=true;
      nextBtn.textContent=index===3?'查看队伍报告 →':'收下这一张，继续 →';
      get('.ig-scores').textContent=s.poses.slice(0,index).map(p=>p.name+' '+p.score).join('  ·  ');
      get('.ig-method').textContent=mode==='touch'?'光标进入绿色区时，每位成员点自己的名字，也可以使用数字键 1 到 '+n+'。':'动作相似度占 20 分，稳定度占 5 分。全队保持 1.2 秒后记录本轮得分。';
      status.textContent=mode==='touch'?'轮到全队，一人落一拍。':mode==='camera'?'请所有成员并排入镜，露出肩膀、手肘和手腕。':'正在打开画框镜头…';
      tapHost.replaceChildren(...s.members.map((m,i)=>{const b=document.createElement('button');b.type='button';b.textContent=(i+1)+' · '+m.name;b.onclick=()=>tap(i);return b;}));
      if(savedScore)showScore(savedScore);
    }
    function showScore(result){
      roundScore=result;
      refreshSkip();bank();
      live(result.score,result.fitPoints??result.rhythmPoints,result.stabilityPoints??result.syncPoints,result.mode||'历史',true);
      status.textContent=roundScore.name+' · 全队动作 '+roundScore.score+' / 25 分（'+roundScore.mode+'）';
      if(roundScore.memberScores)status.textContent+='　'+s.members.map((m,i)=>m.name+' '+roundScore.memberScores[i]+' 分').join(' · ');
      get('.ig-scores').textContent=s.poses.map(p=>p.name+' '+p.score).join('  ·  ');
      take.hidden=true;get('.ig-assist').hidden=true;nextBtn.disabled=false;get('.ig-redo').hidden=false;
      tapHost.querySelectorAll('button').forEach(b=>b.disabled=true);
    }
    function readScore(match,steadiness,method,commit,memberScores){
      const primary=Math.round(20*match),score=Math.round(20*match+5*steadiness),extra=score-primary;
      live(score,primary,extra,method);
      if(!commit)return;
      const parts=method==='全员镜头'?{fitPoints:primary,stabilityPoints:extra}:{rhythmPoints:primary,syncPoints:extra};
      const result={name:poses[index].name,score,mode:method,members:n,memberScores,...parts};
      s.poses[index]=result;s.poses.length=index+1;showScore(result);
      s.onFrameProgress?.(gameResult(s));
    }
    function chooseTouch(reason){
      stopWatch?.();stopWatch=null;releaseRegion();releaseStream(s);mode='touch';get('.ig-assist').hidden=true;resetRound(roundScore);
      if(!roundScore)status.textContent=reason+' 全队按节奏落拍，本轮会标记为「全员节奏」。';
    }
    function tap(i){
      if(mode!=='touch'||roundScore||taps[i])return;
      taps[i]={time:performance.now(),accuracy:clamp(1-Math.abs(beat-marks[index])/.47)};
      tapHost.children[i].disabled=true;setCount(taps.filter(Boolean).length);
      const landed=taps.filter(Boolean);
      if(landed.length<n){
        const earned=20*landed.reduce((sum,t)=>sum+t.accuracy,0)/n;
        live(Math.round(earned),Math.round(earned),null,'全员节奏');
        return;
      }
      const times=taps.map(t=>t.time),interval=Math.max(...times)-Math.min(...times);
      const sync=clamp(1-interval/(1150+(n-2)*200));
      readScore(avg(taps.map(t=>t.accuracy)),sync,'全员节奏',true,taps.map(t=>Math.round(20*t.accuracy+5*sync)));
    }
    const keyHandler=e=>{const i=keys.indexOf(e.code);if(i>=0&&!e.repeat&&mode==='touch'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();tap(i);}};
    window.addEventListener('keydown',keyHandler);s.stops.push(()=>window.removeEventListener('keydown',keyHandler));
    get('.ig-assist').onclick=()=>chooseTouch('已切换到全队节奏接力。');
    function frame(raw,now) {
      if(roundScore)return;
      const people=distinctBodies(maybeRecover(raw,now),vid.videoWidth/vid.videoHeight||1.33);setCount(people.length);
      quality=groupFit(people,index,n);
      if(!quality){clearCapture();status.textContent=people.length<n?'请全队并排站定、稍微拉开间距，露出每个人的上半身。':'请让每位成员的双肩和动作手臂完整入镜。';return;}
      lastGood=now;get('.ig-assist').hidden=true;
      const gap=now-previousTime;
      // Stability requires two observations of the same group close together in time.
      let stability=null,memberFrame=null;
      if(previous&&previous.length===quality.wrists.length&&gap<=850){
        const movement=quality.wrists.map((p,i)=>dist(p,previous[i])/quality.sizes[i]);
        const tolerance=.19*clamp(gap/100,.5,5);
        stability=clamp(1-avg(movement)/tolerance);
        memberFrame=quality.individual.map((fit,i)=>{
          const own=movement.filter((_,j)=>quality.owners[j]===i);
          return 20*fit+5*clamp(1-avg(own)/tolerance);
        });
      }
      previous=quality.wrists;previousTime=now;
      if(!capture){
        if(stability===null)live(null,Math.round(20*quality.quality),null);
        else readScore(quality.quality,stability,'全员镜头',false);
        take.hidden=false;const matched=quality.quality>=.58&&quality.individual.every(v=>v>=.40);
        if(!matched)eligibleSince=0;else if(!eligibleSince)eligibleSince=now;
        status.textContent='全员就位 · 动作匹配 '+Math.round(quality.quality*100)+'%'+(matched?'，请保持。':'，跟着动作卡调整姿势。');
        if(eligibleSince&&now-eligibleSince>=420)capture=true;else return;
      }
      take.hidden=true;
      if(!start||gap>850){start=now;samples=[];}
      const elapsed=(now-start)/1000;
      status.textContent='保持姿势… '+Math.min(1.2,elapsed).toFixed(1)+' / 1.2 秒';
      if(stability===null){live(null,Math.round(20*quality.quality),null);return;}
      samples.push([quality.quality,stability,memberFrame]);
      const commit=elapsed>=1.2&&samples.length>=4;
      const memberScores=commit?s.members.map((_,i)=>Math.round(avg(samples.map(x=>x[2][i])))):undefined;
      readScore(avg(samples.map(x=>x[0])),avg(samples.map(x=>x[1])),'全员镜头',commit,memberScores);
    }
    take.onclick=()=>{if(quality){capture=true;start=0;previous=null;}};
    get('.ig-redo').onclick=()=>resetRound();
    get('.ig-photo').onclick=()=>{
      if(mode!=='camera'||!captureGroupPhoto(s,vid))return;
      get('.ig-photo').textContent='已保存 · 重新拍';bank();
      s.onFrameProgress?.(gameResult(s));
    };
    function openReport(){
      if(active!==s||s.epoch!==epoch)return;
      const data=gameResult(s),cb=s.done;
      dispose();cb(data);
    }
    skipBtn.onclick=openReport;
    nextBtn.onclick=()=>{
      if(!roundScore)return;
      if(index===poses.length-1){openReport();return;}
      index++;resetRound();
    };
    if(s.photo)get('.ig-photo').textContent='已保存 · 重新拍';
    resetRound(s.poses[index]);
    s.onFrameProgress?.(gameResult(s));
    stopWatch=watch(s,['pose'],vid,{
      ready(){mode='camera';resetRound(roundScore);},
      failed(reason){chooseTouch(reason);},
      frame(result,now){frame(result.pose.landmarks||[],now);}
    },n);
    frameLoop(s,now=>{
      if(mode==='touch'&&!roundScore){beat=(1+Math.sin(now*.0026+index*.9))/2;get('.ig-needle').style.left=beat*100+'%';}
      if(mode!=='touch'&&!roundScore&&!quality&&now-lastGood>8500)get('.ig-assist').hidden=false;
    });
  }
  function finishStation(state,done,back) {
    const s=session(state,done,back);
    const get=paint(s,'在雾里，留个名','向镜头方向轻轻哈气，让雾面浮现。用指尖写下名字，签名会留在本次漫游纪念卡上。',`
      <div class="ig-grid"><div class="ig-stage ig-fog-stage"><canvas class="ig-fog" width="720" height="480" aria-label="雾面签名画布"></canvas><span class="ig-sticker">玻璃签名室</span></div>
      <div class="ig-tools"><h2>哈气，等玻璃起雾</h2><p>开启麦克风后先安静一秒，再向设备哈气。也可以按住起雾键；有雾后，用触屏、鼠标或镜头里的食指签名。</p>
      <div class="ig-hand-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
      <div class="ig-camline"><button class="ig-alt ig-mic">开启哈气感应</button><button class="ig-hold ig-fog-hold">按住起雾</button></div>
      <p class="ig-status" role="status">签名区内拖动即可写字，张开手掌暂停落笔。</p>
      <div class="ig-camline"><button class="ig-alt ig-air">镜头隔空签名</button><button class="ig-alt ig-clear">重写签名</button></div><video class="ig-fog-camera" autoplay playsinline muted hidden></video>
      <label class="ig-photo-permission" hidden><input type="checkbox"> 将当前镜头画面保存到我的纪念卡</label>
      <details class="ig-operator"><summary>键盘签名</summary><label>签名文字<input class="ig-type-name" maxlength="18" placeholder="输入名字"></label><button class="ig-alt ig-type-sign">写上名字</button></details>
      <button class="ig-next" disabled>收下签名纪念卡 →</button></div></div>`,true);
    const canvas=get('.ig-fog'),c=canvas.getContext('2d'),vid=get('video'),micButton=get('.ig-mic'),fogButton=get('.ig-fog-hold'),note=get('.ig-status'),confirm=get('.ig-next');
    const ink=document.createElement('canvas');ink.width=720;ink.height=480;
    const pen=ink.getContext('2d');
    const fog=document.createElement('canvas');fog.width=720;fog.height=480;
    const fc=fog.getContext('2d');
    const im=imageFor(s.state.avatarId);
    let density=0,hasInk=false,manual=false,lastTick=performance.now(),breathMode='触控起雾';
    let micActive=false,micPending=false,micGeneration=0,stream,ctx,analyser,samples,calibrationStart=0,noise=0,noiseFrames=0;
    let camActive=false,indexTip=null,penOrigin=null,activeId=null,airCounter=0,strokes=0;
    const permission=get('.ig-photo-permission');
    const minFog=.60;
    function reportFog(old) {
      get('.ig-hand-progress i').style.width=(density*100)+'%';
      get('.ig-hand-progress').setAttribute('aria-valuenow',String(Math.round(density*100)));
      if(old<minFog&&density>=minFog)note.textContent='雾面准备好了，现在可以在玻璃上签名。';
      confirm.disabled=!(hasInk&&density>=minFog);
    }
    function stopMic() {
      micGeneration++;micPending=micActive=false;
      stream?.getTracks().forEach(t=>t.stop());stream=null;
      if(ctx && ctx.state!=='closed') ctx.close().catch(()=>{});
      ctx=analyser=null;
      micButton.disabled=false;micButton.textContent='开启哈气感应';
    }
    s.stops.push(stopMic);
    micButton.onclick=async()=>{
      if(micActive||micPending){stopMic();note.textContent='麦克风已关闭。';return;}
      if(!navigator.mediaDevices?.getUserMedia){note.textContent='无法访问麦克风，请在本地服务或 HTTPS 中打开，或按住起雾。';return;}
      micPending=true;const token=++micGeneration;
      try {
        const Audio=window.AudioContext||window.webkitAudioContext;
        ctx=new Audio();await ctx.resume();
        const st=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
        if(active!==s||token!==micGeneration){st.getTracks().forEach(t=>t.stop());return;}
        stream=st;analyser=ctx.createAnalyser();analyser.fftSize=1024;
        ctx.createMediaStreamSource(st).connect(analyser);
        samples=new Uint8Array(analyser.fftSize);noise=0;noiseFrames=0;
        calibrationStart=performance.now();micPending=false;micActive=true;
        micButton.textContent='关闭麦克风';note.textContent='正在测量环境音量，请安静一秒。';
      }catch(e){if(active===s&&token===micGeneration){stopMic();note.textContent='麦克风未能启动。可检查权限重试，也可按住起雾键。';}}
    };
    function beginManual(){manual=true;fogButton.classList.add('ig-pressed');}
    function endManual(){manual=false;fogButton.classList.remove('ig-pressed');}
    fogButton.onpointerdown=e=>{e.preventDefault();fogButton.setPointerCapture(e.pointerId);beginManual();};
    fogButton.onpointerup=fogButton.onpointercancel=endManual;
    fogButton.onkeydown=e=>{if(e.key==='Enter'&&!e.repeat){e.preventDefault();beginManual();}};
    fogButton.onkeyup=e=>{if(e.key==='Enter'){e.preventDefault();endManual();}};
    window.addEventListener('blur',endManual);s.stops.push(()=>window.removeEventListener('blur',endManual));
    function spaceDown(e){if(e.code==='Space'&&!(e.target.closest('input,button,textarea,summary'))){e.preventDefault();beginManual();}}
    function spaceUp(e){if(e.code==='Space')endManual();}
    window.addEventListener('keydown',spaceDown);window.addEventListener('keyup',spaceUp);
    s.stops.push(()=>{window.removeEventListener('keydown',spaceDown);window.removeEventListener('keyup',spaceUp);});
    function clear(){pen.clearRect(0,0,720,480);hasInk=false;strokes=0;penOrigin=null;indexTip=null;reportFog(density);}
    get('.ig-clear').onclick=()=>{clear();note.textContent='签名已擦除，可以重新写。';};
    function line(from,to){
      if(density<minFog)return;
      pen.lineWidth=8;pen.lineCap='round';pen.lineJoin='round';pen.strokeStyle='#102f34';
      pen.beginPath();pen.moveTo(from.x,from.y);pen.lineTo(to.x,to.y);pen.stroke();
      strokes+=dist(from,to);
      if(strokes>=12){hasInk=true;confirm.disabled=false;}
    }
    function pos(e) {
      const r=canvas.getBoundingClientRect();return{x:clamp((e.clientX-r.left)/r.width)*720,y:clamp((e.clientY-r.top)/r.height)*480};
    }
    canvas.onpointerdown=e=>{
      if(density<minFog){note.textContent='请先哈气或按住起雾键，等雾面达到 60%。';return;}
      if(activeId!==null)return;
      e.preventDefault();canvas.setPointerCapture(e.pointerId);activeId=e.pointerId;penOrigin=pos(e);
    };
    canvas.onpointermove=e=>{if(e.pointerId===activeId&&penOrigin){const point=pos(e);line(penOrigin,point);penOrigin=point;}};
    canvas.onpointerup=canvas.onpointercancel=e=>{if(activeId===e.pointerId){activeId=null;penOrigin=null;}};
    get('.ig-type-sign').onclick=()=>{
      const v=get('.ig-type-name').value.trim();
      if(!v || density<minFog){note.textContent=v?'请先起雾再签名。':'先输入要签下的名字。';return;}
      clear();pen.font='600 '+Math.min(86,Math.floor(590/v.length))+'px serif';pen.textAlign='center';
      pen.fillStyle='#102f34';pen.fillText(v,360,277,630);hasInk=true;reportFog(density);note.textContent='签名已写入雾面。';
    };
    function videoCrop() {
      const source=vid.videoWidth/vid.videoHeight, target=720/480;
      return source>=target?{width:480*source,height:480}:{width:720,height:720/source};
    }
    function normalizeFinger(p) { const {width,height}=videoCrop();return{x:clamp((1-p.x)*width+(720-width)/2,0,720),y:clamp(p.y*height+(480-height)/2,0,480)}; }
    hookCamera(s,'hand',vid,get('.ig-air'),note,r=>{
      const p=r.landmarks?.[0],gesture=handShape(p);
      if(!gesture?.point||!p||density<minFog||activeId!==null){indexTip=null;airCounter=0;return;}
      const pt=normalizeFinger(p[8]);airCounter++;
      if(indexTip&&airCounter>=2&&dist(indexTip,pt)<150){const smooth={x:indexTip.x*.27+pt.x*.73,y:indexTip.y*.27+pt.y*.73};line(indexTip,smooth);indexTip=smooth;}
      else indexTip=pt;
    },()=>{camActive=true;permission.hidden=false;note.textContent='镜像已开启。伸出食指写字，收指或展开手掌停笔。';},
    ()=>{camActive=false;indexTip=null;permission.hidden=true;permission.querySelector('input').checked=false;});
    function drawCard(useVideo,pointer=true) {
      const gradient=c.createLinearGradient(0,0,720,480);gradient.addColorStop(0,'#143e43');gradient.addColorStop(1,'#285e60');
      c.fillStyle=gradient;c.fillRect(0,0,720,480);
      if(useVideo && camActive && vid.readyState>=2){
        const dim=videoCrop();c.save();c.translate(720,0);c.scale(-1,1);c.drawImage(vid,(720-dim.width)/2,(480-dim.height)/2,dim.width,dim.height);c.restore();
      }else{
        c.save();c.strokeStyle='#58908b';c.lineWidth=1.4;
        for(let n=-8;n<14;n++){c.beginPath();c.moveTo(n*70,480);c.lineTo(n*70+235,0);c.stroke();}
        c.restore();
      }
      fc.clearRect(0,0,720,480);
      if(density>.001){
        const grad=fc.createLinearGradient(0,0,720,480);grad.addColorStop(0,'#bde8dc');grad.addColorStop(.6,'#d2e8e2');grad.addColorStop(1,'#a5cbcc');
        fc.globalAlpha=density*.94;fc.fillStyle=grad;fc.fillRect(0,0,720,480);
        fc.globalAlpha=density*.32;fc.fillStyle='#f4fff9';
        for(let i=0;i<64;i++){const x=(i*191)%720,y=(i*193)%480;fc.beginPath();fc.ellipse(x,y,1.1+(i%3),2.5+(i%4),.09,0,Math.PI*2);fc.fill();}
        fc.globalAlpha=1;fc.globalCompositeOperation='destination-out';fc.drawImage(ink,0,0);fc.globalCompositeOperation='source-over';
        c.drawImage(fog,0,0);
      }
      if(!useVideo){
        c.save();c.fillStyle=density>.45?'#295859':'#b8dfd0';c.font='600 17px sans-serif';c.fillText('万象生活遇  /  漫游签名',28,443);c.restore();
        if(im.complete&&im.naturalWidth){const h=76,w=im.width*h/im.height;c.drawImage(im,682-w,380,w,h);}
      }
      if(pointer&&indexTip){c.beginPath();c.arc(indexTip.x,indexTip.y,9,0,Math.PI*2);c.strokeStyle='#e7ff85';c.lineWidth=3;c.stroke();}
    }
    frameLoop(s,now=>{
      const d=Math.min(.08,(now-lastTick)/1000);lastTick=now;const old=density;
      if(manual){density=clamp(density+d*.8);if(density>old)breathMode='触控起雾';}
      if(micActive&&analyser){
        analyser.getByteTimeDomainData(samples);
        let power=0;for(const v of samples)power+=((v-128)/128)**2;
        const rms=Math.sqrt(power/samples.length);
        if(now-calibrationStart<1200){noise+=rms;noiseFrames++;}
        else{
          if(calibrationStart){calibrationStart=0;note.textContent='现在可以向设备哈气，观察雾面进度。';}
          const threshold=Math.max(.018,noise/Math.max(noiseFrames,1)*2+.009);
          if(rms>threshold){density=clamp(density+d*(.42+clamp((rms-threshold)*6)*1.6));if(density>old)breathMode='麦克风哈气';}
        }
      }
      if(old!==density)reportFog(old);drawCard(camActive);
    });
    confirm.onclick=()=>{
      if(!hasInk||density<minFog)return;
      drawCard(camActive&&permission.querySelector('input').checked,false);
      const result={signature:ink.toDataURL('image/png'),keepsake:canvas.toDataURL('image/jpeg',.72),breathMode,createdAt:new Date().toISOString()};
      const cb=s.done;dispose();cb(result);
    };
  }
  function start(state,done,back,onFrameProgress){
    const s=session(state,done,back,onFrameProgress),draft=state.gameDraft;
    if(!draft||draft.memberCount!==s.members.length||!Array.isArray(draft.poses)||draft.poses.length>poses.length||
       !draft.poses.every((p,i)=>p?.name===poses[i].name&&Number.isInteger(p.score)&&p.score>=0&&p.score<=25)){
      faceStation(s);return;
    }
    s.poses=draft.poses.slice();
    s.memberExpressions=Array.isArray(draft.memberExpressions)?draft.memberExpressions.slice(0,s.members.length):[];
    s.photo=typeof draft.photo==='string'?draft.photo:null;
    s.photoBonus=draft.photoBonus===10?10:0;
    s.handScore=clamp(Number(draft.handScore)||0,0,30);
    const checkpoint=draft.kitchenProgress, count=window.MallMedia.dishes.length;
    const valid=checkpoint&&Number.isInteger(checkpoint.served)&&checkpoint.served>=0&&checkpoint.served<=count&&
      Array.isArray(checkpoint.earnedByDish)&&checkpoint.earnedByDish.length===count&&
      checkpoint.earnedByDish.every(v=>v===null||(Number.isInteger(v)&&v>=0&&v<=10));
    if(valid){
      s.kitchen={
        served:checkpoint.served,cooking:checkpoint.served<count&&checkpoint.cooking===true,
        earnedByDish:checkpoint.earnedByDish.slice(),
        methods:Array.from({length:count},(_,i)=>checkpoint.methods?.[i]??null)
      };
    }else s.kitchen={served:count,cooking:false};
    s.handActivity=draft.handActivity;
    s.memberIndex=s.members.length-1;s.phase=valid&&draft.gameStage==='kitchen'?1:2;showStation(s);
  }
  function previewKitchen(onExit){
    const s=session({},null,onExit);s.preview=true;s.phase=1;kitchenStation(s);
  }
  window.MallGames={start,previewKitchen,finish:finishStation,dispose};
})();
