(() => {
  'use strict';
  const home = document.getElementById('home');
  const dialog = document.getElementById('trip-dialog');
  const resumeButton = document.getElementById('my-trip');
  const note = document.getElementById('home-note');
  const label = document.getElementById('art-label');
  const swap = document.getElementById('swap-art');
  const host = document.getElementById('model-view');
  const art = document.querySelector('.hero-art');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let exhibit;
  const names = ['卷卷','小栗','桃桃','阿橙','云杉','阿浪','青豆','小墨'];
  document.getElementById('cast-stage').innerHTML = names.map((name,index) =>
    '<figure><img loading="lazy" src="assets/ip-'+(index+1)+'.webp" alt=""><figcaption>'+name+'</figcaption></figure>'
  ).join('');
  function hideModel() {
    if (exhibit) exhibit.pause();
    host.hidden = true; art.hidden = false;
    label.textContent = '体验馆 · 多人油画框';
    swap.innerHTML = '查看 3D 展台 <span aria-hidden="true">⤢</span>';
    swap.setAttribute('aria-pressed','false');
  }
  function refreshHome() {
    const trip = window.MallJourney.getSummary();
    note.textContent = trip ? '本机已保存「'+trip.title+'」，可在「我的旅程」继续。' : '';
  }
  window.showMallHome = () => {
    home.hidden = false; document.getElementById('flow').hidden = true;
    hideModel(); refreshHome();
    window.scrollTo({top:0,behavior:'instant'});
  };
  function enter(mode) {
    if (dialog.open) dialog.close();
    hideModel();
    window.MallJourney.start(mode);
  }
  document.querySelectorAll('[data-entry]').forEach(button => {
    button.onclick = () => enter(button.dataset.entry);
  });
  resumeButton.onclick = () => {
    const trip = window.MallJourney.getSummary();
    document.getElementById('saved-summary').textContent = trip ?
      '「'+trip.title+'」已保存，可从「'+trip.step+'」继续。' : '这里会保存你的路线、得分和印章。第一次来，先选一种出发方式。';
    const actions = document.getElementById('trip-actions');
    actions.replaceChildren();
    const add = (text,handler) => {
      const b=document.createElement('button'); b.className='door solo';b.textContent=text;b.onclick=handler;actions.append(b);
    };
    if (trip) {
      add('继续这趟旅程',()=>{dialog.close();hideModel();window.MallJourney.resume();});
      if(trip.canSkipGames){
        add('跳过剩余互动，查看报告',()=>{dialog.close();hideModel();window.MallJourney.resume({skipGames:true});});
        document.getElementById('saved-summary').textContent+=' 直接查看报告，会带入已经存到本机的成绩与合照。';
      }
    }
    else {add('一个人来',()=>enter('solo'));add('结伴同行',()=>enter('group'));}
    dialog.showModal();
  };
  dialog.addEventListener('click', event => {if (event.target === dialog) dialog.close();});
  swap.onclick = () => {
    if (!host.hidden) return hideModel();
    host.hidden=false; art.hidden=true;
    try {
      exhibit ||= createExhibit(host);
      exhibit.resume();
      label.textContent='拖动展台旋转 · 方向键微调';
      swap.textContent='回到插画'; swap.setAttribute('aria-pressed','true');
    } catch {
      hideModel(); label.textContent='此浏览器暂未启用 WebGL，当前显示装置插画。';
    }
  };
  let pointerX=0, pointerY=0;
  function moveArt() {
    if(reduced.matches || home.hidden || art.hidden)return;
    const lift=Math.min(6,Math.max(-6,window.scrollY/45));
    art.style.transform='scale(1.04) translate('+pointerX+'px,'+(pointerY+lift)+'px)';
  }
  art.parentElement.addEventListener('pointermove', e => {
    if(e.pointerType!=='mouse')return;
    const b=art.getBoundingClientRect();
    pointerX=(.5-(e.clientX-b.left)/b.width)*7;
    pointerY=(.5-(e.clientY-b.top)/b.height)*5;
    moveArt();
  });
  art.parentElement.addEventListener('pointerleave',()=>{pointerX=0;pointerY=0;moveArt();});
  window.addEventListener('scroll',moveArt,{passive:true});
  const example=document.getElementById('card-example');
  function showExample(){
    const card=window.MallJourney.getCardExample();
    document.getElementById('sample-mark').innerHTML=card.art;
    document.getElementById('sample-name').textContent=card.title;
    document.getElementById('sample-shop').textContent='L'+card.floor+' · '+card.shop;
    document.getElementById('sample-task').textContent=card.action+'。'+card.together+'。离店前扫门店码，收下「'+card.title+'」卡。';
    if(!example.open)example.showModal();
  }
  document.querySelector('a[href="#card-example"]').addEventListener('click',e=>{e.preventDefault();showExample();});
  example.addEventListener('click',event=>{if(event.target===example)example.close();});
  if(location.hash==='#card-example')showExample();
  refreshHome();
  let tryingKitchen=false;
  function kitchenRoute(){
    if(location.hash==='#kitchen'){
      if(tryingKitchen)return;
      tryingKitchen=true;
      if(example.open)example.close();
      hideModel();home.hidden=true;
      document.getElementById('flow').hidden=false;
      window.MallGames.previewKitchen(()=>{
        history.replaceState(null,'','#guide');
        kitchenRoute();
      });
    }else if(tryingKitchen){
      tryingKitchen=false;
      window.MallGames.dispose();
      window.showMallHome();
      if(location.hash==='#guide')document.getElementById('guide').scrollIntoView();
    }
  }
  window.addEventListener('hashchange',kitchenRoute);
  window.addEventListener('pageshow',e=>{if(e.persisted&&location.hash==='#kitchen'){tryingKitchen=false;kitchenRoute();}});
  kitchenRoute();

  function createExhibit(element) {
    const T=window.THREE;
    const renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.7));
    renderer.outputColorSpace=T.SRGBColorSpace;
    renderer.shadowMap.enabled=true; renderer.shadowMap.type=T.PCFSoftShadowMap;
    element.appendChild(renderer.domElement);element.tabIndex=0;
    element.setAttribute('aria-label','三维商场展台，可水平拖动或用左右方向键旋转');
    const scene=new T.Scene();scene.background=new T.Color('#a3d9e3');
    const camera=new T.OrthographicCamera(-6,6,4,-4,.1,100);
    const stage=new T.Group();scene.add(stage);
    const mats=new Map();
    function mat(color){
      if(!mats.has(color))mats.set(color,new T.MeshStandardMaterial({color,roughness:.85}));
      return mats.get(color);
    }
    function mesh(geometry,color,x,y,z,parent=stage) {
      const obj=new T.Mesh(geometry,mat(color));obj.position.set(x,y,z);obj.castShadow=true;obj.receiveShadow=true;parent.add(obj);return obj;
    }
    function box(w,h,d,color,x,y,z,parent=stage){return mesh(new T.BoxGeometry(w,h,d),color,x,y,z,parent);}
    function ball(r,color,x,y,z){return mesh(new T.SphereGeometry(r,20,16),color,x,y,z);}
    function disk(top,bottom,h,color,x,y,z){return mesh(new T.CylinderGeometry(top,bottom,h,42),color,x,y,z);}
    function roundedFloor(w,d,r,h,color,y) {
      const shape=new T.Shape();const x=-w/2,z=-d/2;
      shape.moveTo(x+r,z);shape.lineTo(x+w-r,z);shape.quadraticCurveTo(x+w,z,x+w,z+r);
      shape.lineTo(x+w,z+d-r);shape.quadraticCurveTo(x+w,z+d,x+w-r,z+d);
      shape.lineTo(x+r,z+d);shape.quadraticCurveTo(x,z+d,x,z+d-r);
      shape.lineTo(x,z+r);shape.quadraticCurveTo(x,z,x+r,z);
      const geom=new T.ExtrudeGeometry(shape,{depth:h,bevelEnabled:true,bevelThickness:.035,bevelSize:.045,bevelSegments:3});
      const o=mesh(geom,color,0,y,0);o.rotation.x=-Math.PI/2;
    }
    roundedFloor(7.5,4.7,.55,.32,'#39545d',-.16);
    roundedFloor(7.45,4.65,.54,.11,'#ffefd0',.16);
    // Gallery wall, showcase arch and inset pilasters.
    box(6.6,2.84,.23,'#f3ce99',0,1.72,-1.90);
    box(6.66,.18,.29,'#edab7d',0,3.15,-1.9);
    for(const x of [-3.05,-2.25,2.35,3.09]){
      box(.13,2.54,.22,'#ffe8be',x,1.70,-1.71);
    }
    disk(1.62,1.72,.22,'#656bab',.67,.39,-.12);
    box(3.55,.23,.47,'#466f9b',.63,.59,-.77);
    box(3.44,2.11,.19,'#8f6545',.63,1.76,-.74);
    box(3.13,1.83,.12,'#90cbe6',.63,1.77,-.55);
    // Solid moulding around the oil-painting screen.
    for (const [w,h,x,y] of [[3.59,.14,.63,.75],[3.59,.14,.63,2.80],[.14,2.16,-1.11,1.78],[.14,2.16,2.37,1.78]]) {
      box(w,h,.23,'#efaf3d',x,y,-.49);
    }
    for (const x of [-1.11,2.37]){
      for(const y of [.76,2.78]) ball(.13,'#f7ca63',x,y,-.40);
    }
    for(let j=-2;j<=2;j++){
      const gem=ball(.14-.016*Math.abs(j),'#f9c754',.63+j*.16,2.91-.025*Math.abs(j),-.54);
      gem.scale.set(.95,1.45, .64);
    }
    box(.35,.16,.2,'#213c45',.63,2.73,-.32);
    const lens=disk(.044,.044,.04,'#8ccfed',.63,2.73,-.203);lens.rotation.x=Math.PI/2;
    // Clusters of low stools and original two-dimensional characters on the three-dimensional set.
    disk(.75,.75,.12,'#ef8d67',-1.72,1.06,1.00);disk(.16,.25,.75,'#c56951',-1.72,.65,1.00);
    for(const [x,z,c] of [[-2.5,.7,'#d3e36d'],[-1.7,1.83,'#ffabc5'],[-.95,1.15,'#8dcfd8']]){
      disk(.29,.35,.43,c,x,.49,z);
    }
    for(const x of [-2.85,2.88]){
      disk(.31,.25,.47,'#c47d55',x,.48,-1.05);
      for(let j=0;j<7;j++){
        const a=j*2.40,leaf=ball(.34,j%2?'#438c69':'#73ac68',x+Math.sin(a)*.20,.94+j*.066,-1.04+Math.cos(a)*.14);
        leaf.scale.set(.6,1.46,.55);leaf.rotation.z=Math.sin(a)*.55;
      }
    }
    const characters=[];
    const loader=new T.TextureLoader();
    for(const [index,x,y,z,h] of [[0,-.49,1.73,-.44,1.18],[7,.21,1.73,-.44,1.19],[3,.95,1.73,-.44,1.17],[5,1.68,1.73,-.44,1.20],[0,-.55,1.25,.68,1.44],[7,.21,1.33,1.04,1.58],[3,1.04,1.20,1.10,1.33],[5,1.92,1.36,.74,1.64],[4,-2.63,1.12,1.02,1.57]]){
      loader.load(window.MallAvatarImages[index], texture=>{
        texture.colorSpace=T.SRGBColorSpace;
        const material=new T.MeshBasicMaterial({map:texture,side:T.DoubleSide,alphaTest:.35});
        const actor=new T.Mesh(new T.PlaneGeometry(h*texture.image.width/texture.image.height,h),material);
        actor.position.set(x,y,z);
        if(z>0){actor.rotation.y=.10;actor.castShadow=true;}
        stage.add(actor);
        characters.push({actor,base:y,offset:index}); schedule();
      });
    }
    const light=new T.DirectionalLight('#fff0ce',2.0);light.position.set(-4,8,5);light.castShadow=true;
    light.shadow.mapSize.set(1024,1024);Object.assign(light.shadow.camera,{left:-5,right:5,top:5,bottom:-5});light.shadow.normalBias=.018;
    scene.add(light,new T.HemisphereLight('#fff9e6','#bad0cd',2.25));
    const floor=mesh(new T.PlaneGeometry(140,140),'#a3d9e3',0,-.23,0,scene);floor.rotation.x=-Math.PI/2;floor.castShadow=false;
    let running=false,frame=null,yaw=.34,targetYaw=.34,pointer=null,lastX=0,t=0,last=0;
    function schedule(){if(frame===null&&running)frame=requestAnimationFrame(draw);}
    function resize(){
      const w=element.clientWidth,h=element.clientHeight;if(!w||!h)return;
      const half=Math.max(2.85,4.50*h/w);
      camera.top=half;camera.bottom=-half;camera.left=-half*w/h;camera.right=half*w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);schedule();
    }
    function draw(stamp){
      frame=null;if(!running)return;
      const dt=last?Math.min((stamp-last)/1000,.08):.016;last=stamp;t+=dt;
      yaw+=(targetYaw-yaw)*(reduced.matches?1:1-Math.exp(-12*dt));
      camera.position.set(Math.sin(yaw)*12,5.0,Math.cos(yaw)*12);camera.lookAt(0,1.35,0);
      if(!reduced.matches)for(const item of characters)item.actor.position.y=item.base+Math.sin(t*1.6+item.offset)*.022;
      renderer.render(scene,camera);
      if(!reduced.matches||Math.abs(targetYaw-yaw)>.0005)schedule();
    }
    element.onpointerdown=e=>{if(e.button!==0)return;pointer=e.pointerId;lastX=e.clientX;element.setPointerCapture(pointer);};
    element.onpointermove=e=>{if(e.pointerId!==pointer)return;targetYaw=T.MathUtils.clamp(targetYaw-(e.clientX-lastX)*.009,-1.3,1.3);lastX=e.clientX;schedule();};
    element.onlostpointercapture=()=>{pointer=null;};
    element.onkeydown=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();targetYaw=T.MathUtils.clamp(targetYaw+(e.key==='ArrowRight'?.15:-.15),-1.3,1.3);schedule();};
    new ResizeObserver(resize).observe(element);
    return {resume(){running=true;last=0;resize();schedule();},pause(){running=false;if(frame!==null)cancelAnimationFrame(frame);frame=null;}};
  }
})();
