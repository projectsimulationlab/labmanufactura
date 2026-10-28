/* Recorrido360 CIM · v10.0.0
 * Marzipano local; scenes and hotspot coordinates come unchanged from data.js.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const M = window.Marzipano;
  const data = window.APP_DATA && window.APP_DATA.scenes;
  const total = Array.isArray(data) ? data.length : 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = Boolean(navigator.connection?.saveData);
  const compactDevice = window.matchMedia('(max-width: 700px), (pointer: coarse)').matches;
  const byId = new Map((data || []).map((item, index) => [item.id, index]));
  const cache = new Map();
  const preloaded = new Map();
  const format = i => String(i + 1).padStart(2, '0');
  const icon = name => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  let current = 0, changing = false, queued = null, entered = false;
  let spinning = false, toastTimeout = 0;
  const visited = new Set([0]);
  let focusMode = false;
  let viewer;
  if (!M || total < 1) {
    $('enter').disabled = true;
    $('enter').textContent = 'No se encontraron las imágenes del recorrido';
    return;
  }
  try {
    viewer = new M.Viewer($('pano'), {controls: {mouseViewMode: 'drag'}});
  } catch (err) {
    console.error('No se pudo iniciar WebGL', err);
    $('enter').disabled = true;
    $('enter').textContent = 'Activa WebGL para ver el recorrido';
    return;
  }
  const autoMotion = M.autorotate({yawSpeed: 0.011, targetPitch: 0, targetFov: 1.52});
  const clamp = (x,a,b) => Math.max(a, Math.min(b,x));
  const angleDelta = a => Math.atan2(Math.sin(a),Math.cos(a));

  function initialFraming(point) {
    const params = {...point.initialViewParameters};
    const first = (point.linkHotspots || []).find(h => byId.has(h.target));
    if (first) {
      // Keep the real geographic yaw/pitch; merely change camera starting aim.
      // Scene one originally placed the forward arrow almost below the viewport.
      params.yaw += angleDelta(first.yaw - params.yaw) * 0.34;
      params.pitch = clamp(params.pitch + (first.pitch - params.pitch) * 0.34, -0.55, 0.55);
    }
    params.fov = clamp(params.fov, 1.43, 1.91);
    return params;
  }
  function showToast(message) {
    clearTimeout(toastTimeout);
    $('toast').textContent = message;
    $('toast').classList.add('show');
    toastTimeout = setTimeout(() => $('toast').classList.remove('show'), 2600);
  }
  function preloadPreview(index) {
    if (preloaded.has(index)) return preloaded.get(index);
    const d = data[index];
    const image = new Image();
    const promise = new Promise((resolve, reject) => {
      image.onload = () => resolve(true);
      image.onerror = () => reject(new Error('No se pudo cargar la vista previa'));
      image.src = `tiles/${d.id}/preview-hq.jpg`;
      if (image.complete && image.naturalWidth) resolve(true);
    });
    // A temporary download error must not permanently poison retries.
    const retryable = promise.catch(error => { preloaded.delete(index); throw error; });
    preloaded.set(index, retryable);
    return retryable;
  }
  function makeHotspot(point) {
    const destination = byId.get(point.target);
    if (destination === undefined) return null;
    if (![point.yaw, point.pitch].every(Number.isFinite)) return null;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nav-hotspot';
    b.dataset.destination = String(destination);
    const message = `Continuar a la vista ${format(destination)}`;
    b.title = message;
    b.setAttribute('aria-label', message);
    const arrow = document.createElement('span');
    arrow.className = 'hotspot-direction';
    arrow.innerHTML = icon('forward');
    arrow.style.transform = `rotate(${Number.isFinite(point.rotation) ? point.rotation : 0}rad)`;
    const tag = document.createElement('span'); tag.className = 'hotspot-tag'; tag.textContent = `Ir a vista ${format(destination)}`;
    b.append(arrow, tag);
    b.addEventListener('click', e => {e.stopPropagation(); navigate(destination);});
    ['pointerdown','touchstart','wheel'].forEach(type => b.addEventListener(type,e => e.stopPropagation(), {passive:true}));
    return b;
  }
  function getScene(index) {
    if(cache.has(index)) return cache.get(index);
    const d = data[index];
    const root = `tiles/${d.id}`;
    const src = M.ImageUrlSource.fromString(`${root}/{z}/{f}/{y}/{x}.jpg`, {cubeMapPreviewUrl: `${root}/preview-hq.jpg`});
    const geometry = new M.CubeGeometry(d.levels);
    const limit = M.RectilinearView.limit.traditional(d.faceSize, 100*Math.PI/180, 120*Math.PI/180);
    const view = new M.RectilinearView(initialFraming(d), limit);
    const scene = viewer.createScene({source:src, geometry, view, pinFirstLevel: false});
    (d.linkHotspots || []).forEach(point => {
      const b = makeHotspot(point);
      if(b) scene.hotspotContainer().createHotspot(b, {yaw:point.yaw,pitch:point.pitch});
    });
    cache.set(index, scene);
    return scene;
  }
  function cleanup() {
    // Prevent texture accumulation during long mobile visits.
    for (const [i, scene] of cache) {
      if(i === current || i === current-1 || i === current+1) continue;
      try { viewer.destroyScene(scene); } catch(e){ console.warn('Liberación WebGL:',e); }
      cache.delete(i);
    }
  }
  function setRotation(value) {
    spinning = Boolean(value);
    viewer.stopMovement();
    viewer.setIdleMovement(Infinity);
    if (spinning) {
      viewer.startMovement(autoMotion);
      viewer.setIdleMovement(2500, autoMotion);
    }
    $('autorotate').setAttribute('aria-pressed', String(spinning));
    $('autorotate').setAttribute('aria-label', spinning ? 'Detener giro automático' : 'Activar giro automático');
  }
  const routeTrack = $('routeTrack');
  data.forEach((point, i) => {
    const step = document.createElement('button');
    step.type = 'button'; step.className = 'route-step'; step.dataset.index = String(i);
    step.setAttribute('aria-label', `Ir a vista ${format(i)}`);
    step.title = `Vista ${format(i)}`;
    const bar = document.createElement('span'); bar.className = 'route-step-bar';
    step.append(bar);
    step.addEventListener('click', () => navigate(i));
    routeTrack.append(step);
  });
  function updateControls() {
    $('pointName').textContent = `Vista ${format(current)}`;
    $('pointCount').innerHTML = `${format(current)} <span>/ ${format(total-1)}</span>`;
    $('sceneCaptionNum').textContent = `${format(current)} / ${format(total-1)}`;
    $('visitedCount').textContent = `${String(visited.size).padStart(2, '0')} / ${format(total-1)} visitadas`;
    $('galleryVisitCount').textContent = `${visited.size} de ${total} vistas exploradas`;
    document.querySelectorAll('.route-step').forEach((step, i) => {
      const active = i === current;
      step.classList.toggle('active', active);
      step.classList.toggle('visited', visited.has(i));
      step.setAttribute('aria-current', active ? 'step' : 'false');
    });
    $('prev').disabled = current === 0;
    $('next').disabled = current === total-1;
    document.querySelectorAll('.gallery-item').forEach(b => {
      const on = Number(b.dataset.index) === current;
      b.classList.toggle('active',on);
      b.classList.toggle('visited',visited.has(Number(b.dataset.index)));
      b.setAttribute('aria-current',on ? 'true' : 'false');
    });
  }
  const thumbs = $('galleryItems');
  data.forEach((point,i) => {
    const b = document.createElement('button');
    b.type='button'; b.className='gallery-item'; b.dataset.index=String(i);
    b.setAttribute('aria-label',`Abrir vista ${format(i)}`);
    const img=document.createElement('img'); img.dataset.src=`thumbnails/point-${format(i)}.jpg`; img.alt=`Panorámica real ${format(i)}`; img.loading='lazy'; img.decoding='async';
    const caption=document.createElement('span');caption.className='gallery-caption';
    const label=document.createElement('span');label.textContent=`Vista ${format(i)}`;
    const num=document.createElement('span');num.className='num';num.textContent=`${format(i)} / ${format(total-1)}`;
    caption.append(label,num);b.append(img,caption);
    b.addEventListener('click',()=>{closeGallery();navigate(i);});thumbs.append(b);
  });
  updateControls();

  // Do not cross-dissolve unrelated viewpoints or reveal unpainted WebGL frames.
  // A restrained cover masks loading until the target scene reports a full frame.
  const curtain = $('sceneTransition');
  const transitionName = $('transitionName');
  const transitionImage = $('transitionImage');
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const coverMs = reducedMotion ? 0 : 180;

  async function showCover(index) {
    transitionName.textContent = `Vista ${format(index)}`;
    transitionImage.style.backgroundImage = `url("thumbnails/point-${format(index)}.jpg")`;
    curtain.classList.add('is-active');
    curtain.setAttribute('aria-hidden', 'false');
    await nextPaint();
    if (coverMs) await delay(coverMs + 35);
  }
  async function hideCover() {
    curtain.classList.remove('is-active');
    if (!reducedMotion) await delay(260);
    curtain.setAttribute('aria-hidden', 'true');
    transitionImage.style.backgroundImage = '';
  }
  function switchWhenRendered(scene) {
    return new Promise((resolve, reject) => {
      let done = false;
      const layer = scene.layer();
      const stop = (error) => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        layer.removeEventListener('renderComplete', onRender);
        error ? reject(error) : resolve();
      };
      // Marzipano passes the stable boolean as its FIRST argument.
      const onRender = stable => { if (stable === true) stop(); };
      const timeout = setTimeout(() => stop(new Error('El visor no confirmó un fotograma estable')), 15000);
      // Render the intermediate level first; don't block on 4K tiles.
      // It can be revealed sharp enough and then refine progressively.
      layer.setFixedLevel(saveData || compactDevice ? 1 : 2);
      layer.addEventListener('renderComplete', onRender);
      try { scene.switchTo({transitionDuration:0}); }
      catch(error) { stop(error); }
    });
  }
  function warmNextViews(index) {
    if (saveData) return;
    const adjacent = [index-1,index+1];
    const links = (data[index].linkHotspots||[]).map(h=>byId.get(h.target));
    [...new Set([...links,...adjacent])]
      .filter(i=>Number.isInteger(i)&&i>=0&&i<total&&i!==index)
      .slice(0,2).forEach(i=>preloadPreview(i).catch(()=>{}));
  }
  async function navigate(index) {
    if (!entered || !Number.isInteger(index) || index < 0 || index >= total) return;
    if (changing) { queued = index; return; }
    if (index === current) return;
    changing = true;
    $('app').classList.add('is-switching');
    $('pano').setAttribute('aria-busy', 'true');
    if (spinning) setRotation(false);
    viewer.stopMovement();
    const old = viewer.scene();
    let switched = false;
    try {
      await showCover(index);
      // The preview is only a first fallback; actual readiness comes from WebGL.
      // The preview is opportunistic, never a prerequisite that can block the tour.
      preloadPreview(index).catch(() => {});
      const next = getScene(index);
      await switchWhenRendered(next);
      switched = true;
      await nextPaint();
      current = index;
      visited.add(index);
      updateControls();
      await hideCover();
      next.layer().setFixedLevel(null);
      cleanup();
      warmNextViews(current);
    } catch (error) {
      console.warn('No se pudo cargar la vista', error);
      if (!switched && old) old.switchTo({transitionDuration:0});
      const failed = cache.get(index);
      if (failed) failed.layer().setFixedLevel(null);
      await nextPaint();
      await hideCover();
      showToast('No se pudo cargar la vista. Comprueba tu conexión e inténtalo de nuevo.');
    } finally {
      $('app').classList.remove('is-switching');
      $('pano').removeAttribute('aria-busy');
      changing = false;
      if (queued !== null) {
        const pending = queued;
        queued = null;
        if (pending !== current) navigate(pending);
      }
    }
  }
  // Draw the first scene behind the introduction and reveal it only when stable.
  const first = getScene(0);
  const initialLayer = first.layer();
  let firstDrawn = false;
  const finishDraw = () => {
    if (firstDrawn) return;
    firstDrawn = true;
    initialLayer.setFixedLevel(null);
    $('poster').classList.add('ready');
  };
  const firstFrame = stable => {
    if (stable !== true) return;
    initialLayer.removeEventListener('renderComplete', firstFrame);
    finishDraw();
  };
  initialLayer.setFixedLevel(saveData || compactDevice ? 1 : 2);
  initialLayer.addEventListener('renderComplete', firstFrame);
  first.switchTo({transitionDuration:0});
  preloadPreview(0).catch(()=>{});
  $('enter').addEventListener('click',()=> {
    if(entered)return;
    entered=true;
    $('welcome').classList.add('is-leaving');
    setTimeout(()=>{$('welcome').hidden=true;},reducedMotion?40:650);
    warmNextViews(0);
    setTimeout(()=>{$('galleryOpen').focus({preventScroll:true});},reducedMotion?50:650);
  });
  $('next').addEventListener('click',()=>navigate(current+1));
  $('prev').addEventListener('click',()=>navigate(current-1));
  $('zoomIn').addEventListener('click',()=>{const v=viewer.view();if(v){viewer.stopMovement();v.setFov(clamp(v.fov()*0.82,.40,2.1));}});
  $('zoomOut').addEventListener('click',()=>{const v=viewer.view();if(v){viewer.stopMovement();v.setFov(clamp(v.fov()*1.18,.40,2.1));}});
  $('autorotate').addEventListener('click',()=>setRotation(!spinning));
  function setFocusMode(active) {
    focusMode = Boolean(active);
    $('app').classList.toggle('focus-mode', focusMode);
    $('restore').hidden = !focusMode;
    $('focusMode').setAttribute('aria-pressed', String(focusMode));
    $('focusMode').setAttribute('aria-label', focusMode ? 'Modo inmersivo: mostrar interfaz' : 'Modo inmersivo: ocultar interfaz');
    if (focusMode) { $('restore').focus({preventScroll:true}); dismissHint(); }
    else $('focusMode').focus({preventScroll:true});
  }
  $('focusMode').addEventListener('click',()=>setFocusMode(true));
  $('restore').addEventListener('click',()=>setFocusMode(false));
  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        if (typeof $('app').requestFullscreen !== 'function') throw new Error('not supported');
        await $('app').requestFullscreen();
      } else await document.exitFullscreen();
    } catch(e) {showToast('Tu navegador no permite pantalla completa.');}
  }
  function updateFullscreen() {
    const active=Boolean(document.fullscreenElement);
    $('fullscreen').setAttribute('aria-pressed',String(active));
    $('fullscreen').setAttribute('aria-label',active?'Salir de pantalla completa':'Entrar en pantalla completa');
    $('fullscreen').title=active?'Salir de pantalla completa (F)':'Pantalla completa (F)';
    $('fullscreen').querySelector('use').setAttribute('href',active?'#i-compress':'#i-expand');
  }
  $('fullscreen').addEventListener('click',toggleFullscreen);
  document.addEventListener('fullscreenchange',updateFullscreen);
  const dialogFocus = new Map();
  function openOverlay(id, closeId) {
    const d=$(id);dialogFocus.set(id, document.activeElement);
    d.hidden=false;$(closeId).focus({preventScroll:true});
    if(spinning)setRotation(false);
  }
  function closeOverlay(id) {
    const d=$(id);if(d.hidden)return;
    d.hidden=true;
    const previous=dialogFocus.get(id);if(previous && document.contains(previous))previous.focus({preventScroll:true});
  }
  const openGallery=()=>{
    thumbs.querySelectorAll('img[data-src]').forEach(img => { img.src=img.dataset.src; delete img.dataset.src; });
    openOverlay('gallery','galleryClose');
  };
  const closeGallery=()=>closeOverlay('gallery');
  const openInfo=()=>openOverlay('info','infoClose');
  const closeInfo=()=>closeOverlay('info');
  $('galleryOpen').addEventListener('click',openGallery);$('galleryBottom').addEventListener('click',openGallery);
  $('galleryClose').addEventListener('click',closeGallery);$('galleryShade').addEventListener('click',closeGallery);
  $('infoOpen').addEventListener('click',openInfo);$('infoClose').addEventListener('click',closeInfo);$('infoShade').addEventListener('click',closeInfo);
  function dismissHint(){ $('hint').hidden=true; }
  $('hintClose').addEventListener('click',dismissHint);
  $('pano').addEventListener('pointerdown',dismissHint,{once:true});
  // Keyboard shortcuts deliberately ignore modal, welcome, and focused buttons.
  document.addEventListener('keydown',e => {
    if(e.key==='Escape') {closeGallery();closeInfo();if(focusMode)setFocusMode(false);return;}
    if((e.key==='h'||e.key==='H') && entered && $('gallery').hidden && $('info').hidden && !['INPUT','TEXTAREA','SELECT','BUTTON'].includes(document.activeElement?.tagName)) {
      e.preventDefault(); setFocusMode(!focusMode); return;
    }
    if((e.key==='f'||e.key==='F') && entered && $('gallery').hidden && $('info').hidden && !['INPUT','TEXTAREA','SELECT','BUTTON'].includes(document.activeElement?.tagName)) {e.preventDefault();toggleFullscreen();return;}
    if(!entered || !$('gallery').hidden || !$('info').hidden || ['INPUT','TEXTAREA','BUTTON','SELECT'].includes(document.activeElement?.tagName))return;
    if(e.key==='ArrowRight'){e.preventDefault();navigate(current+1);}
    if(e.key==='ArrowLeft'){e.preventDefault();navigate(current-1);}
  });
  // Keep keyboard focus inside an open dialog.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const modal = !$('gallery').hidden ? $('gallery') : (!$('info').hidden ? $('info') : null);
    if (!modal) return;
    const items = [...modal.querySelectorAll('button:not([disabled])')].filter(el=>el.getClientRects().length && !el.classList.contains('overlay-shade'));
    if (!items.length) return;
    const first = items[0], last = items[items.length-1];
    if (e.shiftKey && document.activeElement === first) {e.preventDefault();last.focus();}
    else if (!e.shiftKey && document.activeElement === last) {e.preventDefault();first.focus();}
  });
})();
