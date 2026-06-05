(function(){
  const DEFAULT_MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
  const DEFAULT_FACE_API_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js';

  class AstraClient {
    constructor(options={}){
      this.basePath = normalizeBasePath(options.basePath || './ASTRA/');
      this.modelUrl = options.modelUrl || DEFAULT_MODEL_URL;
      this.faceApiUrl = options.faceApiUrl || DEFAULT_FACE_API_URL;
      this.apiPath = this.basePath + 'astra-api.php';
      this.matcherPath = this.basePath + 'matcher.js';
      this.config = null;
      this.index = null;
      this.modelsReady = false;
    }

    async init(options={}){
      this.config = await this.request('config');
      if(options.loadModels !== false) await this.loadModels();
      await this.loadIndex();
      return this;
    }

    async loadModels(){
      await loadScriptIfNeeded(this.faceApiUrl, () => window.faceapi);
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(this.modelUrl),
        faceapi.nets.faceLandmark68Net.loadFromUri(this.modelUrl),
        faceapi.nets.faceRecognitionNet.loadFromUri(this.modelUrl)
      ]);
      this.modelsReady = true;
    }

    async loadIndex(){
      await loadScriptIfNeeded(this.matcherPath, () => window.AstraFaceIndex);
      const descriptors = await this.request('descriptors');
      this.index = window.AstraFaceIndex.build(descriptors, {
        maxPrototypes:32,
        refineTopMembers:12,
        topK:5
      });
      return this.index;
    }

    async recognizeImage(input, options={}){
      if(!this.modelsReady) await this.loadModels();
      if(!this.index) await this.loadIndex();
      const source = await imageSource(input);
      try{
        const detections = await faceapi
          .detectAllFaces(source.image, new faceapi.SsdMobilenetv1Options({minConfidence:options.minConfidence || 0.28}))
          .withFaceLandmarks()
          .withFaceDescriptors();
        return detections.map((det, index) => ({
          index,
          box:boxToPlain(det.detection.box),
          score:Number(det.detection.score || 0),
          descriptor:Array.from(det.descriptor),
          candidates:window.AstraFaceIndex.candidates(this.index, det.descriptor, {
            refineTopMembers:options.refineTopMembers || 12,
            topK:options.topK || 5
          })
        }));
      }finally{
        source.revoke();
      }
    }

    async saveDescriptor({member, descriptor, sourceName='embed'}){
      const res = await fetch(this.apiPath + '?action=save_descriptor', {
        method:'POST',
        credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({member, descriptor, source_name:sourceName})
      });
      const json = await readJson(res);
      if(!res.ok || !json.ok) throw new Error(json.error || 'ASTRA descriptor save failed');
      await this.loadIndex();
      return json;
    }

    async request(action){
      const res = await fetch(this.apiPath + '?action=' + encodeURIComponent(action), {
        credentials:'same-origin',
        cache:'no-store'
      });
      const json = await readJson(res);
      if(!res.ok || json.ok === false) throw new Error(json.error || 'ASTRA API request failed');
      return Object.prototype.hasOwnProperty.call(json, 'data') ? json.data : json;
    }
  }

  function create(options={}){
    return new AstraClient(options);
  }

  function normalizeBasePath(path){
    return String(path || './').replace(/\/?$/, '/');
  }

  function loadScriptIfNeeded(src, ready){
    if(ready()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = Array.from(document.scripts).find(script => script.src === new URL(src, location.href).href);
      if(existing){
        existing.addEventListener('load', () => resolve(), {once:true});
        existing.addEventListener('error', () => reject(new Error(`failed to load ${src}`)), {once:true});
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`failed to load ${src}`));
      document.head.appendChild(script);
    }).then(() => {
      if(!ready()) throw new Error(`script loaded but dependency is missing: ${src}`);
    });
  }

  async function imageSource(input){
    if(input instanceof HTMLImageElement){
      if(!input.complete) await waitForImage(input);
      return {image:input, revoke(){}};
    }
    if(input instanceof File || input instanceof Blob){
      const url = URL.createObjectURL(input);
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = url;
      await waitForImage(image);
      return {image, revoke(){URL.revokeObjectURL(url);}};
    }
    if(typeof input === 'string'){
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = input;
      await waitForImage(image);
      return {image, revoke(){}};
    }
    throw new Error('Unsupported image input');
  }

  function waitForImage(image){
    return new Promise((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('image load failed'));
    });
  }

  function boxToPlain(box){
    return {
      x:box.x,
      y:box.y,
      width:box.width,
      height:box.height
    };
  }

  async function readJson(res){
    try{return await res.json();}catch(e){return {ok:false, error:'ASTRA API returned invalid JSON'};}
  }

  window.AstraEmbed = {create, AstraClient};
})();
