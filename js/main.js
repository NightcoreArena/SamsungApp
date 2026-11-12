/* Flix Home: lightweight TV launcher adapted from arn0-tv (MIT). */
(function () {
 'use strict';
 var $=function(id){return document.getElementById(id);};
 var preview=!window.tizen;
 var key='flixhome.prefs.v1';
 var installed=[],shown=[],inputs=[],section=0,index=0,all=false,editing=false;
 var menu=null,hold=null,held=false,toastTimer=null,hasApps=false;
 var tilesHash='',focusedEl=null,loadingApps=false;
 var defaults=['9Ur5IzDKqV.TizenYouTube','org.tizen.netflix-app','evKhCgZelL.AmazonIgnitionLauncher2','MCmYXNxgcu.DisneyPlus','5b8c3eb16b.BeamCTVDev','Jz7aUrV2Q4.Twitch'];
 var prefs={order:defaults.slice(),reduceMotion:false,glow:true,theme:'dark',inputNames:{}};
 try{
  var saved=JSON.parse(localStorage.getItem(key));
  if(saved&&Array.isArray(saved.order)){
   prefs.order=saved.order;prefs.reduceMotion=saved.reduceMotion===true;
   prefs.glow=saved.glow!==false;prefs.theme=saved.theme==='light'?'light':'dark';
   if(saved.inputNames&&typeof saved.inputNames==='object')prefs.inputNames=saved.inputNames;
  }
 }catch(e){}

 function save(){try{localStorage.setItem(key,JSON.stringify(prefs));}catch(e){toast('Impossible de sauvegarder les paramètres.');}}
 function toast(s){$('toast').textContent=s;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(function(){$('toast').classList.add('hidden');},4500);}
 function failure(e){toast('TV : '+(e.message||e.name||String(e)));}
 function el(tag,cls,text){var n=document.createElement(tag);n.className=cls||'';if(text!==undefined)n.textContent=text;return n;}
 function launch(id){if(preview){toast('Aperçu : '+id);return;}Apps.launch(id).catch(failure);}
 function appearance(){
  $('stage').classList.toggle('reduce-motion',prefs.reduceMotion);
  $('stage').classList.toggle('no-glow',!prefs.glow);
  $('stage').classList.toggle('light',prefs.theme==='light');
 }

 // ── clock (pixel matrix, only changed digits animated) ──────────────────
 var digits=[
  ['01110','10001','10001','10001','10001','10001','01110'],
  ['00100','01100','00100','00100','00100','00100','01110'],
  ['01110','10001','00001','00010','00100','01000','11111'],
  ['11110','00001','00001','01110','00001','00001','11110'],
  ['00010','00110','01010','10010','11111','00010','00010'],
  ['11111','10000','10000','11110','00001','00001','11110'],
  ['01110','10000','10000','11110','10001','10001','01110'],
  ['11111','00001','00010','00100','01000','01000','01000'],
  ['01110','10001','10001','01110','10001','10001','01110'],
  ['01110','10001','10001','01111','00001','00001','01110']
 ];
 var clockPaths=[],clockValues='',svgNS='http://www.w3.org/2000/svg';
 function matrixPath(value,size,gap){var path='';digits[Number(value)].forEach(function(row,y){row.split('').forEach(function(on,x){if(on==='1')path+='M'+(x*(size+gap))+' '+(y*(size+gap))+'h'+size+'v'+size+'h-'+size+'z';});});return path;}
 function svgNode(tag,attrs){var n=document.createElementNS(svgNS,tag);Object.keys(attrs||{}).forEach(function(k){n.setAttribute(k,attrs[k]);});return n;}
 function makeClock(){
  var svg=svgNode('svg',{viewBox:'0 0 460 180','aria-hidden':'true'}),defs=svgNode('defs');svg.appendChild(defs);
  [14,144,309,439].forEach(function(x,i){
   var y=i<4?4:72,h=i<4?156:88,w=i<4?110:62,half=h/2,id='clock-'+i;
   ['top','bottom'].forEach(function(part){var clip=svgNode('clipPath',{id:id+'-'+part});clip.appendChild(svgNode('rect',{x:0,y:part==='top'?0:half,width:w,height:half}));defs.appendChild(clip);});
   var base=svgNode('path',{'class':'matrix-digit matrix-base',transform:'translate('+x+' '+y+')'});svg.appendChild(base);clockPaths.push(base);
   var overlay=svgNode('g',{'class':'matrix-overlay',transform:'translate('+x+' '+y+')'}),oldBottom=svgNode('path',{'class':'matrix-old-bottom','clip-path':'url(#'+id+'-bottom)'});overlay.appendChild(oldBottom);
   function leaf(part,cls){var pivot=svgNode('g',{transform:'translate(0 '+half+')'}),fold=svgNode('g',{'class':cls}),offset=svgNode('g',{transform:'translate(0 '+(-half)+')'}),path=svgNode('path',{'clip-path':'url(#'+id+'-'+part+')'});offset.appendChild(path);fold.appendChild(offset);pivot.appendChild(fold);overlay.appendChild(pivot);return path;}
   leaf('top','matrix-fold-top');leaf('bottom','matrix-fold-bottom');svg.appendChild(overlay);base.flip={overlay:overlay,oldBottom:oldBottom,timer:null};
  });
  [282].forEach(function(x,i){var size=14,y=49;svg.appendChild(svgNode('path',{'class':'matrix-colon',d:'M'+x+' '+y+'h'+size+'v'+size+'h-'+size+'z M'+x+' '+(y+57)+'h'+size+'v'+size+'h-'+size+'z'}));});
  $('clock').appendChild(svg);
 }
 function clockDigit(path,value,i,animate){
  var next=matrixPath(value,i<4?18:10,i<4?5:3),previous=path.getAttribute('d'),flip=path.flip;path.setAttribute('d',next);
  if(!animate||prefs.reduceMotion||!previous)return;
  clearTimeout(flip.timer);
  var overlay=flip.overlay,ob=overlay.querySelector('.matrix-old-bottom'),ft=overlay.querySelector('.matrix-fold-top .matrix-fold-top path')||overlay.querySelector('[clip-path*="top"] path'),fb=overlay.querySelector('[clip-path*="bottom"] path');
  if(ob)ob.setAttribute('d',previous);if(ft)ft.setAttribute('d',previous);if(fb)fb.setAttribute('d',next);
  overlay.classList.add('flipping');flip.timer=setTimeout(function(){overlay.classList.remove('flipping');},320);
 }
 function clock(){
  if(document.hidden)return;
  var d=new Date(),value=('0'+d.getHours()).slice(-2)+('0'+d.getMinutes()).slice(-2)+'  ';
  if(!clockPaths.length)makeClock();
  clockPaths.forEach(function(path,i){if(i<4 && clockValues[i]!==value[i])clockDigit(path,value[i],i,false);});
  clockValues=value;$('clock').setAttribute('aria-label',value.slice(0,2)+':'+value.slice(2,4));
  var date=d.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});if($('date').textContent!==date)$('date').textContent=date;
 }

 function appById(id){for(var i=0;i<installed.length;i++)if(installed[i].id===id)return installed[i];return null;}
 function visibleApps(){if(all)return installed.slice();var a=[];prefs.order.forEach(function(id){var x=appById(id);if(x)a.push(x);});return a;}

 var navIcons=[
  '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
  '<path d="M5 7h14M5 17h14"/><circle cx="9" cy="7" r="2.5"/><circle cx="15" cy="17" r="2.5"/>',
  '<path d="m9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>'
 ];

 function toolbar(){
  var n=$('toolbar');
  var labelAll=all?'Favoris':'Toutes les apps';
  var labelEdit=editing?'Terminé':'Modifier';
  if(n.children.length===4){
   n.children[0].setAttribute('aria-label',labelAll);n.children[0].querySelector('.nav-label').textContent=labelAll;
   n.children[1].setAttribute('aria-label',labelEdit);n.children[1].querySelector('.nav-label').textContent=labelEdit;
   n.children[3].setAttribute('aria-checked',String(prefs.theme==='light'));return;
  }
  n.textContent='';
  [labelAll,labelEdit,'Paramètres','Affichage'].forEach(function(label,i){
   var button=el('button','pill');button.setAttribute('aria-label',label);
   if(i===3){
    button.classList.add('theme-switch');button.setAttribute('role','switch');button.setAttribute('aria-checked',String(prefs.theme==='light'));button.setAttribute('aria-label','Mode clair');
    button.appendChild(el('span','mode-selection'));button.appendChild(el('span','mode-label mode-light','Clair'));button.appendChild(el('span','mode-label mode-dark','Sombre'));
   }else{
    button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">'+navIcons[i]+'</svg>';
    button.appendChild(el('span','nav-label',label));
   }
   button.onclick=function(){section=0;index=i;activate();};n.appendChild(button);
  });
 }

 var logoKeys=['youtube','netflix','primevideo','disneyplus','max','twitch','appletv','spotify','plex','crunchyroll','dazn','movistar'];

 // ── dynamic glow: extract dominant color from app icon ──────────────────
 function applyDynamicGlow(tile, imgEl){
  var canvas=document.createElement('canvas');canvas.width=14;canvas.height=14;
  var ctx=canvas.getContext('2d');
  try{
   ctx.drawImage(imgEl,0,0,14,14);
   var d=ctx.getImageData(0,0,14,14).data,r=0,g=0,b=0,n=0;
   for(var i=0;i<d.length;i+=4){
    if(d[i+3]>100){r+=d[i];g+=d[i+1];b+=d[i+2];n++;}
   }
   if(!n)return;
   r=Math.round(r/n);g=Math.round(g/n);b=Math.round(b/n);
   tile.style.setProperty('--app-accent','rgb('+r+','+g+','+b+')');
   var glow=tile.querySelector('.tile-glow-css');
   if(glow)glow.style.background='radial-gradient(ellipse at 50% 58%,rgba('+r+','+g+','+b+',.72),transparent 65%)';
  }catch(e){}
 }

 // ── scroll dots ──────────────────────────────────────────────────────────
 function updateScrollDots(){
  var dotsEl=$('scroll-dots'),total=shown.length,rows=Math.ceil(total/6);
  dotsEl.textContent='';
  if(rows<=1)return;
  var currentRow=section===1?Math.floor(index/6):0;
  for(var i=0;i<rows;i++){
   dotsEl.appendChild(el('span','scroll-dot'+(i===currentRow?' active':'')));
  }
 }

 // ── loading skeleton ─────────────────────────────────────────────────────
 function renderSkeleton(){
  var box=$('tiles');box.textContent='';focusedEl=null;
  for(var i=0;i<6;i++){
   var tile=el('button','app tile-skeleton');tile.setAttribute('aria-hidden','true');tile.setAttribute('tabindex','-1');
   var glow=el('div','tile-glow tile-glow-css');tile.appendChild(glow);
   ['normal','active'].forEach(function(state){var s=el('img','surface surface-'+state);s.src='assets/glass-'+prefs.theme+'-'+state+'.png';s.alt='';tile.appendChild(s);});
   tile.appendChild(el('span','logo-inner'));tile.appendChild(el('span','label',''));
   box.appendChild(tile);
  }
 }

 function tileHash(){return (all?'a':'f')+prefs.theme+(shown.map(function(a){return a.id;}).join(','));}

 function render(){
  toolbar();shown=visibleApps();
  $('heading').textContent=all?'Toutes les apps':(editing?'Organiser':'Apps');
  $('hint').textContent=editing?'Sélectionner · Déplacer ou masquer · Retour pour terminer':'OK pour ouvrir · Maintenir OK pour modifier';

  var hash=tileHash();
  if(hash!==tilesHash){
   tilesHash=hash;
   var box=$('tiles');box.textContent='';focusedEl=null;

   if(!shown.length&&loadingApps){
    renderSkeleton();renderInputs();focus();updateScrollDots();return;
   }

   shown.forEach(function(app,i){
    var tile=el('button','app'),brand=findBrand(app),brandKey=brand&&logoKeys.indexOf(brand.key)>=0?brand.key:'neutral';
    tile.setAttribute('aria-label',app.label||app.name);tile.setAttribute('data-brand',brandKey);

    if(brandKey!=='neutral'){
     // Known brand: use precolored PNG glow
     var glowImg=el('img','tile-glow');glowImg.src='assets/glow-'+brandKey+'.png';glowImg.alt='';tile.appendChild(glowImg);
    }else{
     // Unknown brand: CSS glow, color set after icon loads
     var glowDiv=el('div','tile-glow tile-glow-css');tile.appendChild(glowDiv);
    }

    ['normal','active'].forEach(function(state){var s=el('img','surface surface-'+state);s.src='assets/glass-'+prefs.theme+'-'+state+'.png';s.alt='';tile.appendChild(s);});
    var face=el('span','logo-inner');

    if(brandKey!=='neutral'){
     var logo=el('img','logo logo-'+brandKey);logo.src='assets/logo-'+brandKey+'-'+prefs.theme+'.svg';logo.alt='';
     logo.onerror=function(){this.style.display='none';face.appendChild(el('span','fallback',app.name.charAt(0).toUpperCase()));};
     face.appendChild(logo);
    }else if(app.iconPath){
     var icon=el('img','app-icon');icon.src=app.iconPath;icon.alt='';
     // Extract dominant color once loaded, apply to glow
     (function(t,ic){ic.onload=function(){applyDynamicGlow(t,ic);};})(tile,icon);
     icon.onerror=function(){this.style.display='none';face.appendChild(el('span','fallback',app.name.charAt(0).toUpperCase()));};
     face.appendChild(icon);
    }else{
     face.appendChild(el('span','fallback',app.name.charAt(0).toUpperCase()));
    }
    tile.appendChild(face);tile.appendChild(el('span','label',app.label||app.name));
    tile.onclick=function(){section=1;index=i;activate();};box.appendChild(tile);
   });

   if(!shown.length)box.appendChild(el('p','empty-state',all?'Aucune app trouvée.':'Aucun favori. Ajoutez des apps via "Toutes les apps".'));
  }
  renderInputs();focus();updateScrollDots();
 }

 function lineIcon(paths,cls){var n=document.createElementNS(svgNS,'svg');n.setAttribute('viewBox','0 0 24 24');n.setAttribute('class',cls);n.setAttribute('fill','none');n.setAttribute('stroke','currentColor');n.setAttribute('stroke-width','1.6');n.setAttribute('stroke-linecap','round');n.setAttribute('stroke-linejoin','round');n.setAttribute('aria-hidden','true');n.innerHTML=paths;return n;}
 var hdmiIcon='<path d="M3 7h18v7l-4 4H7l-4-4Z"/><path d="M7 11h10M9 14h6"/>',tvIcon='<rect x="3" y="6" width="18" height="14" rx="2"/><path d="m8 2 4 4 4-4"/>';

 var INPUT_PRESETS=['Console','PC','Décodeur TV','Apple TV','Chromecast','Nintendo Switch','PlayStation','Xbox','Blu-ray','Raspberry Pi','Caméra','Retirer le nom personnalisé','Annuler'];

 function inputLabel(a){return a.hdmi&&prefs.inputNames[a.hdmi]?prefs.inputNames[a.hdmi]:a.label;}

 function renderInputs(){
  var row=$('input-row');row.textContent='';
  inputs.forEach(function(a,i){
   var b=el('button','input'+(a.connected?' connected':''));
   b.appendChild(lineIcon(a.hdmi?hdmiIcon:tvIcon,'input-symbol'));
   var copy=el('span','input-copy');
   copy.appendChild(el('span','input-name',inputLabel(a)));
   if(a.connected!==undefined){
    copy.appendChild(el('small','',a.connected?'En fonction':'Éteint'));
    var dot=el('span','input-status'+(a.connected?' connected':''));dot.setAttribute('aria-hidden','true');b.appendChild(dot);
   }
   b.appendChild(copy);
   b.setAttribute('aria-label',inputLabel(a)+(a.connected!==undefined?(a.connected?', en fonction':', éteint'):''));
   b.onclick=function(){section=2;index=i;activate();};row.appendChild(b);
  });
 }

 // ── HDMI status auto-refresh every 10s ───────────────────────────────────
 function refreshInputs(){
  if(preview||!window.Inputs)return;
  Inputs.sources().then(function(info){
   var changed=false;
   inputs.forEach(function(a){
    if(!a.hdmi)return;
    var on=(info.connected||[]).some(function(c){return c.type==='HDMI'&&c.number===a.hdmi;});
    if(a.connected!==on){a.connected=on;changed=true;}
   });
   if(changed)renderInputs();
  },function(){});
 }

 function editInput(){
  var a=inputs[index];if(!a||!a.hdmi)return;
  var cur=inputLabel(a);
  var options=INPUT_PRESETS.map(function(name){
   if(name==='Retirer le nom personnalisé')return[name,function(){delete prefs.inputNames[a.hdmi];save();renderInputs();}];
   if(name==='Annuler')return[name,function(){}];
   return[name,function(){prefs.inputNames[a.hdmi]=name;save();renderInputs();toast('Renommé : '+name);}];
  });
  openMenu('Renommer "'+cur+'"',options);
 }

 function nodes(){return section===0?$('toolbar').children:section===1?$('tiles').querySelectorAll('.app'):$('input-row').children;}

 function focus(){
  if(focusedEl){focusedEl.classList.remove('focused');focusedEl.removeAttribute('data-focused');focusedEl=null;}
  if(menu){
   var opts=$('options').children;menu.index=Math.max(0,Math.min(menu.index,opts.length-1));
   if(opts[menu.index]){opts[menu.index].classList.add('focused');focusedEl=opts[menu.index];}return;
  }
  var ns=nodes();if(!ns.length&&section===1){section=0;index=0;ns=nodes();}
  index=Math.max(0,Math.min(index,ns.length-1));
  if(ns[index]){ns[index].classList.add('focused');ns[index].setAttribute('data-focused','true');focusedEl=ns[index];}
  var row=section===1?Math.floor(index/6):0;$('tiles').style.transform='translateY('+(-row*252)+'px)';
  updateScrollDots();
 }

 function panelBackdrop(){
  var old=$('dialog').querySelector('.panel-backdrop');if(old)old.parentNode.removeChild(old);
  var panel=$('dialog'),box=panel.getBoundingClientRect(),stage=$('stage').getBoundingClientRect(),scale=stage.width/1920;
  var left=(box.left-stage.left)/scale,top=(box.top-stage.top)/scale,w=box.width/scale,h=box.height/scale;
  var canvas=el('canvas','panel-backdrop');canvas.setAttribute('aria-hidden','true');canvas.width=Math.ceil(w/16);canvas.height=Math.ceil(h/16);
  var ctx=canvas.getContext('2d');ctx.scale(canvas.width/w,canvas.height/h);ctx.fillStyle=prefs.theme==='light'?'#f3efe6':'#000';ctx.fillRect(0,0,w,h);ctx.globalAlpha=.28;
  function rect(node){var r=node.getBoundingClientRect();return{x:(r.left-stage.left)/scale-left,y:(r.top-stage.top)/scale-top,w:r.width/scale,h:r.height/scale};}
  function text(node){var r=rect(node),style=window.getComputedStyle(node),size=parseFloat(style.fontSize);ctx.fillStyle=style.color;ctx.font=style.fontWeight+' '+size+'px Arial';ctx.textAlign='left';ctx.fillText(node.textContent,r.x,r.y+size,r.w);}
  var images=$('tiles').querySelectorAll('img');for(var j=0;j<images.length;j++){var image=images[j],r=rect(image);if(image.complete&&image.naturalWidth&&window.getComputedStyle(image).opacity!=='0'){try{ctx.globalAlpha=.28*Number(window.getComputedStyle(image).opacity);ctx.drawImage(image,r.x,r.y,r.w,r.h);}catch(e){}}}ctx.globalAlpha=.28;
  var labels=document.querySelectorAll('.label,#date,#heading,#sources h2,.input-name,.input small');for(var k=0;k<labels.length;k++)text(labels[k]);
  if(window.Path2D){var cr=rect($('clock'));ctx.save();ctx.translate(cr.x,cr.y);ctx.fillStyle=window.getComputedStyle($('clock')).color;var paths=$('clock').querySelectorAll('.matrix-base,.matrix-colon');for(var n=0;n<paths.length;n++){ctx.save();var tr=(paths[n].getAttribute('transform')||'').match(/translate\(([-.0-9]+) ([-.0-9]+)\)/);if(tr)ctx.translate(Number(tr[1]),Number(tr[2]));try{ctx.fill(new Path2D(paths[n].getAttribute('d')));}catch(e){}ctx.restore();}ctx.restore();}
  panel.insertBefore(canvas,panel.firstChild);
 }

 function openMenu(title,options){
  menu={options:options,index:0};focusedEl=null;
  $('dialog-title').textContent=title;$('options').textContent='';
  options.forEach(function(o,i){
   var b=el('button','option'),label=o[0],detail='';
   if(title==='Paramètres'){
    if(i===0){label='Affichage';detail=prefs.theme==='light'?'Clair → Sombre':'Sombre → Clair';}
    if(i===2)label='Paramètres TV via Samsung Home';
    if(i===3)label='Ouvrir les sources';
    if(i===4){label='Animations';detail=prefs.reduceMotion?'Réduit':'Horloge animée';}
    if(i===5){label='Lueur';detail=prefs.glow?'Activée':'Désactivée';}
    if(i===1||i===4||i===6)b.classList.add('group-start');
   }
   if(title==='Paramètres'){
    var icons=['<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>','<path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7"/>',tvIcon,hdmiIcon,'<path d="m12 3 2 4-2 4-2-4Zm-6 8 2 4-2 4-2-4Zm12 0 2 4-2 4-2-4Z"/>','<path d="M9 17c0-3-3-4-3-7a6 6 0 0 1 12 0c0 3-3 4-3 7ZM9 20h6"/>','<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>','<path d="m5 5 14 14M5 19 19 5"/>'];
    b.appendChild(lineIcon(icons[i]||icons[7],'option-icon'));
   }
   b.appendChild(el('span','option-name',label));
   if(detail)b.appendChild(el('span','option-detail',detail));
   b.setAttribute('aria-label',label+(detail?', '+detail:''));b.onclick=function(){menu.index=i;choose();};$('options').appendChild(b);
  });
  $('modal').classList.remove('hidden');focus();panelBackdrop();
 }

 function closeMenu(){menu=null;focusedEl=null;$('modal').classList.add('hidden');focus();}
 function choose(){var fn=menu.options[menu.index][1];closeMenu();fn();}
 function move(id,delta){var p=prefs.order.indexOf(id),q=p+delta;if(p<0||q<0||q>=prefs.order.length){toast('Vous êtes au bord des favoris.');return;}prefs.order.splice(p,1);prefs.order.splice(q,0,id);save();index=q;tilesHash='';render();}

 function editApp(){
  var a=shown[index];if(!a)return;var pinned=prefs.order.indexOf(a.id)>=0;var options=[];
  if(pinned){
   options.push(['Déplacer à gauche',function(){move(a.id,-1);}]);
   options.push(['Déplacer à droite',function(){move(a.id,1);}]);
   options.push(['Retirer des favoris',function(){prefs.order=prefs.order.filter(function(id){return id!==a.id;});save();tilesHash='';render();}]);
  }else{
   options.push(['Ajouter aux favoris',function(){prefs.order.push(a.id);save();tilesHash='';render();toast('Ajouté aux favoris');}]);
  }
  options.push(['Ouvrir',function(){launch(a.id);}]);
  options.push(['Annuler',function(){}]);
  openMenu(a.label||a.name,options);
 }

 function settings(){openMenu('Paramètres',[
  [prefs.theme==='dark'?'Affichage : Sombre → Clair':'Affichage : Clair → Sombre',function(){prefs.theme=prefs.theme==='dark'?'light':'dark';save();tilesHash='';appearance();render();}],
  ['Samsung Home',function(){launch('com.samsung.tv.csfs');}],
  ['Paramètres TV via Samsung Home',function(){launch('com.samsung.tv.csfs');}],
  ['Ouvrir les sources',function(){launch('org.tizen.SMSourceAPP');}],
  [prefs.reduceMotion?'Animations : réduit → normal':'Animations : normal → réduit',function(){prefs.reduceMotion=!prefs.reduceMotion;save();appearance();}],
  [prefs.glow?'Désactiver la lueur':'Activer la lueur',function(){prefs.glow=!prefs.glow;save();appearance();}],
  ['Recharger les apps',function(){load();}],
  ['Fermer',function(){}]
 ]);}

 function activate(){
  if(menu){choose();return;}
  if(section===0){
   if(index===0){all=!all;section=1;index=0;render();}
   else if(index===1){editing=!editing;section=1;index=0;render();}
   else if(index===2)settings();
   else{prefs.theme=prefs.theme==='dark'?'light':'dark';save();tilesHash='';appearance();render();}
  }else if(section===1){
   if(editing||all)editApp();else if(shown[index])launch(shown[index].id);
  }else if(inputs[index]){
   var a=inputs[index];
   if(a.hdmi){if(preview){toast('Aperçu : '+a.label);return;}Inputs.open(a.hdmi,'switch+viewer').catch(failure);}
   else launch(a.id);
  }
 }

 function back(){
  if(menu){closeMenu();return;}
  if(editing){editing=false;render();return;}
  if(all){all=false;section=1;index=0;render();return;}
  openMenu('Quitter Flix Home ?',[
   ['Aller à Samsung Home',function(){launch('com.samsung.tv.csfs');}],
   ['Rester ici',function(){}]
  ]);
 }

 function arrow(code){
  if(menu){if(code===38)menu.index=Math.max(0,menu.index-1);if(code===40)menu.index=Math.min(menu.options.length-1,menu.index+1);focus();return;}
  var count=nodes().length;
  if(code===37)index=Math.max(0,index-1);
  if(code===39)index=Math.min(count-1,index+1);
  if(code===38){if(section===2){section=1;index=Math.max(0,shown.length-6+index);}else if(section===1&&index>=6)index-=6;else{section=0;index=0;}}
  if(code===40){if(section===0){section=1;index=0;}else if(section===1&&index+6<shown.length)index+=6;else{section=2;index=0;}}
  focus();
 }

 document.addEventListener('keydown',function(e){
  var c=e.keyCode;if([13,37,38,39,40,10009,27,8].indexOf(c)<0)return;e.preventDefault();
  if(c===13){
   if(hold||held)return;
   hold=setTimeout(function(){
    hold=null;held=true;if(menu)return;
    if(section===1)editApp();else if(section===2)editInput();
   },650);return;
  }
  if(c===10009||c===27||c===8)back();else arrow(c);
 });
 document.addEventListener('keyup',function(e){if(e.keyCode!==13)return;clearTimeout(hold);hold=null;if(!held)activate();held=false;});
 window.addEventListener('blur',function(){clearTimeout(hold);hold=null;held=false;});

 function load(){
  if(preview){
   installed=[
    {id:defaults[0],name:'YouTube',label:'YouTube',iconPath:''},
    {id:defaults[1],name:'Netflix',label:'Netflix',iconPath:''},
    {id:defaults[2],name:'Prime Video',label:'Prime Video',iconPath:''},
    {id:defaults[3],name:'Disney+',label:'Disney+',iconPath:''},
    {id:defaults[4],name:'HBO Max',label:'HBO Max',iconPath:''},
    {id:defaults[5],name:'Twitch',label:'Twitch',iconPath:''},
    {id:'org.tizen.browser',name:'Internet',label:'Internet',iconPath:''}
   ];
   if(!hasApps){section=1;index=0;hasApps=true;}
   inputs=[{hdmi:1,label:'HDMI 1',connected:true},{hdmi:2,label:'HDMI 2',connected:false},{hdmi:3,label:'HDMI 3',connected:false},{id:'org.tizen.tv-viewer',label:'Télévision'}];
   tilesHash='';render();return;
  }
  // Show skeleton immediately while loading
  if(!hasApps){loadingApps=true;shown=[];tilesHash='';render();}
  Apps.getInstalledApps().then(function(list){
   loadingApps=false;
   installed=Apps.launchable(list).filter(function(a){return Apps.describe(a).consumer||defaults.indexOf(a.id)>=0;});
   if(!hasApps){section=1;index=0;hasApps=true;}
   var nativeNetflix=appById('org.tizen.netflix-app');if(nativeNetflix)installed=installed.filter(function(a){return a.id!=='RN1MCdNq8t.Netflix';});
   tilesHash='';render();
  },function(e){loadingApps=false;failure(e);});
  Inputs.sources().then(function(info){
   inputs=[];var seen={};
   (info.connected||[]).concat(info.disconnected||[]).forEach(function(s){
    if(s.type!=='HDMI'||seen[s.number])return;seen[s.number]=true;
    inputs.push({hdmi:s.number,label:'HDMI '+s.number,connected:(info.connected||[]).some(function(c){return c.type==='HDMI'&&c.number===s.number;})});
   });
   inputs.sort(function(a,b){return a.hdmi-b.hdmi;});inputs.push({id:'org.tizen.tv-viewer',label:'Télévision'});renderInputs();
  },function(){inputs=[{id:'org.tizen.SMSourceAPP',label:'Ouvrir les sources'},{id:'org.tizen.tv-viewer',label:'Télévision'}];renderInputs();});
 }

 if(preview)$('preview').textContent='Aperçu navigateur';
 function scale(){if(preview)$('stage').style.transform='scale('+Math.min(window.innerWidth/1920,window.innerHeight/1080)+')';}
 document.addEventListener('visibilitychange',function(){if(!document.hidden)clock();});
 window.addEventListener('resize',scale);
 setInterval(refreshInputs,30000);
 scale();appearance();clock();setInterval(clock,30000);section=1;toolbar();load();
}());
