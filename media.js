/* Shared kitchen program and per-dish film overrides on this device. */
(() => {
  const dishes=[
    {id:'pasta',name:'畔尼意面',dish:'翻拌意面',hint:'伸出食指，沿锅边画一圈。'},
    {id:'wok',name:'Gaga',dish:'颠锅炒蔬菜',hint:'食指从左下挑向右上，再摆回左下。'},
    {id:'hotpot',name:'巴奴毛肚火锅',dish:'涮毛肚',hint:'用食指向下蘸一下，再向上提起。'}
  ].map(dish=>({...dish,motion:dish.id,src:'assets/kitchen/'+dish.id+'.mp4',poster:'assets/kitchen/'+dish.id+'.jpg'}));
  let database;
  function open() {
    if (!database) database = new Promise((resolve,reject)=>{
      const request=indexedDB.open('mall-mates-media',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('files');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    }).catch(error=>{database=null;throw error;});
    return database;
  }
  async function access(mode,operation) {
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('files',mode), request=operation(tx.objectStore('files'));
      tx.oncomplete=()=>resolve(request.result??null);
      tx.onabort=tx.onerror=()=>reject(tx.error||new Error('视频存储失败'));
    });
  }
  window.MallMedia={
    dishes,
    getVideo:id=>access('readonly',s=>s.get('kitchen/'+id)),
    saveVideo:(id,file)=>file instanceof Blob && (file.type.startsWith('video/')||/\.(mp4|m4v|mov|webm)$/i.test(file.name||'')) ?
      access('readwrite',s=>s.put(file,'kitchen/'+id)) : Promise.reject(new Error('请选择浏览器支持的视频文件')),
    clearVideo:id=>access('readwrite',s=>s.delete('kitchen/'+id))
  };
})();
