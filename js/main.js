/* Flix Home 1.0 — accueil TV léger (d'après arn0-tv, MIT).
 *
 * Écran : barre du haut (heure, date, boutons) · zone « héros » qui décrit l'élément
 * sélectionné · rangée d'apps · rangée de sources HDMI · aide en bas.
 *
 * Modes de la rangée d'apps :
 *   home      favoris ; OK ouvre ; OK maintenu = options
 *   organize  favoris + tuile « Ajouter » ; OK saisit une app, les flèches la déplacent,
 *             OK la pose, Retour annule le déplacement ; OK maintenu = retirer
 *   browse    toutes les apps ; OK ouvre ; OK maintenu = épingler / désépingler
 *   pick      toutes les apps, coche sur les favoris ; OK épingle / désépingle
 *
 * Performance : aucune animation continue, aucun flou. La teinte d'ambiance est une
 * petite surface agrandie par la carte graphique, et ne change que par fondu d'opacité.
 */
(function () {
 'use strict';
 var $=function(id){return document.getElementById(id);};
 var preview=!window.tizen;
 var KEY='flixhome.prefs.v1';
 var COLS=6,ROW_H=252,HOLD_MS=650;
 var defaults=['9Ur5IzDKqV.TizenYouTube','org.tizen.netflix-app','evKhCgZelL.AmazonIgnitionLauncher2','MCmYXNxgcu.DisneyPlus','5b8c3eb16b.BeamCTVDev','Jz7aUrV2Q4.Twitch'];

 var installed=[],items=[],inputs=[];
 var mode='home',section=1,index=0,picked=-1,pickedOrigin=null;
 var menu=null,hold=null,held=false,toastTimer=null,hasApps=false,loadingApps=false;
 var tilesHash='',focusedEl=null,appsLoadedAt=0,installedIds='';

 // ── préférences ─────────────────────────────────────────────────────────
 var prefs={order:defaults.slice(),reduceMotion:false,glow:true,theme:'dark',inputNames:{},inputMethods:{},methodsV3:true,lastInput:0,ambient:true,opened:{},wallpaper:'blackhole',weather:true,city:'auto',effects:'lite'};
 try{
  var saved=JSON.parse(localStorage.getItem(KEY));
  if(saved&&Array.isArray(saved.order)){
   prefs.order=saved.order.filter(function(id){return typeof id==='string';});
   prefs.reduceMotion=saved.reduceMotion===true;prefs.glow=saved.glow!==false;
   prefs.theme=saved.theme==='light'?'light':'dark';
   if(saved.inputNames&&typeof saved.inputNames==='object')prefs.inputNames=saved.inputNames;
   if(saved.inputMethods&&typeof saved.inputMethods==='object')prefs.inputMethods=saved.inputMethods;
   // 1.4 : « Instantané » ne donnait pas le Mode Jeu ; ces sources passent à « Rapide + Mode Jeu ».
   // 1.5 : retour au mode Samsung (comme le menu Sources) par défaut pour toutes les sources.
   if(!saved.methodsV3)prefs.inputMethods={};
   prefs.methodsV3=true;
   prefs.lastInput=Number(saved.lastInput)||0;prefs.lastApp=typeof saved.lastApp==='string'?saved.lastApp:'';prefs.ambient=saved.ambient!==false;
   if(saved.opened&&typeof saved.opened==='object')prefs.opened=saved.opened;
   if(typeof saved.wallpaper==='string')prefs.wallpaper=saved.wallpaper;
   prefs.weather=saved.weather!==false;if(typeof saved.city==='string')prefs.city=saved.city;
   prefs.effects=saved.effects==='full'?'full':'lite';
  }
 }catch(e){}
 function save(){try{localStorage.setItem(KEY,JSON.stringify(prefs));}catch(e){toast('Impossible de sauvegarder les réglages.');}}

 // ── utilitaires ─────────────────────────────────────────────────────────
 var svgNS='http://www.w3.org/2000/svg';
 function el(tag,cls,text){var n=document.createElement(tag);n.className=cls||'';if(text!==undefined)n.textContent=text;return n;}
 function icon(paths,cls){var n=document.createElementNS(svgNS,'svg');n.setAttribute('viewBox','0 0 24 24');n.setAttribute('class',cls||'');n.setAttribute('fill','none');n.setAttribute('stroke','currentColor');n.setAttribute('stroke-width','1.7');n.setAttribute('stroke-linecap','round');n.setAttribute('stroke-linejoin','round');n.setAttribute('aria-hidden','true');n.innerHTML=paths;return n;}
 function toast(s){$('toast').textContent=s;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(function(){$('toast').classList.add('hidden');},4000);}
 function failure(e){toast('TV : '+(e&&(e.message||e.name)||String(e)));}
 function setText(node,t){if(node.textContent!==t)node.textContent=t;}

 var I={
  grid:'<rect x="4" y="4" width="6" height="6" rx="1.6"/><rect x="14" y="4" width="6" height="6" rx="1.6"/><rect x="4" y="14" width="6" height="6" rx="1.6"/><rect x="14" y="14" width="6" height="6" rx="1.6"/>',
  arrange:'<rect x="3.5" y="5" width="7" height="6" rx="1.5"/><rect x="13.5" y="13" width="7" height="6" rx="1.5"/><path d="M14 8h4.5m0 0-2-2m2 2-2 2M10 16H5.5m0 0 2-2m-2 2 2 2"/>',
  gear:'<path d="M12 3.5 14 5l2.4-.4.9 2.3 2.2 1-.4 2.4L20.5 12 19 14l.4 2.4-2.2 1-.9 2.3L14 19.3 12 20.5 10 19.3l-2.4.4-.9-2.3-2.2-1L5 14l-1.5-2L5 10l-.4-2.4 2.2-1 .9-2.3L10 5Z"/><circle cx="12" cy="12" r="3"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  hdmi:'<path d="M3 7h18v7l-4 4H7l-4-4Z"/><path d="M7 11h10M9 14h6"/>',
  tv:'<rect x="3" y="6" width="18" height="14" rx="2"/><path d="m8 2 4 4 4-4"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon:'<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
  glow:'<path d="M9 17c0-3-3-4-3-7a6 6 0 0 1 12 0c0 3-3 4-3 7ZM9 20h6"/>',
  motion:'<path d="M4 12h3l2-5 4 10 2-5h5"/>',
  home:'<path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7"/>',
  refresh:'<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  open:'<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
  pin:'<path d="M12 17v4M8 3h8l-1 6 3 3H6l3-3Z"/>',
  move:'<path d="M12 3v18M3 12h18M12 3 9 6m3-3 3 3M12 21l-3-3m3 3 3-3M3 12l3-3m-3 3 3 3M21 12l-3-3m3 3-3 3"/>',
  rename:'<path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/>',
  sources:'<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>',
  planet:'<circle cx="12" cy="12" r="5.5"/><path d="M4.2 15.6C1.9 17.5 1.4 19.3 2.6 20c1.8 1.1 7.4-1.6 12.4-6s7.9-9.1 6.6-10.2c-.8-.7-2.6-.2-4.6 1.2"/>',
  wallpaper:'<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="m3 16 5-5 4 4 3-3 6 6"/><circle cx="16" cy="8.5" r="1.5"/>'
 };

 // ── apparence & teinte d'ambiance ────────────────────────────────────────
 function appearance(){
  var s=$('stage');
  s.classList.toggle('reduce-motion',prefs.reduceMotion);
  s.classList.toggle('no-glow',!prefs.glow);
  s.classList.toggle('light',prefs.theme==='light');
  s.setAttribute('data-wall',prefs.wallpaper);
  s.classList.toggle('lite',prefs.effects!=='full');
 }
 // La teinte suit la sélection seulement quand on s'y arrête (0,22 s) : pendant une
 // navigation rapide, aucun fondu plein écran (c'était le principal coût d'affichage).
 var tintCur=0,tintColor='',tintWanted='',tintTimer=null;
 function setTint(color){
  if(prefs.effects!=='full')return; // mode léger : pas de teinte d'ambiance
  tintWanted=color;clearTimeout(tintTimer);
  if(color===tintColor)return;
  tintTimer=setTimeout(applyTint,150);
 }
 function applyTint(){
  var color=tintWanted;if(color===tintColor)return;tintColor=color;
  var next=tintCur?0:1,a=$(next?'tint-b':'tint-a'),b=$(next?'tint-a':'tint-b');
  a.style.background='radial-gradient(ellipse at 22% 30%,'+color+' 0%,transparent 68%)';
  a.style.opacity='1';b.style.opacity='0';tintCur=next;
 }
 var ACCENTS={youtube:'#ff3b30',netflix:'#e50914',primevideo:'#00a8e1',disneyplus:'#3d8bff',max:'#8b5cf6',twitch:'#9146ff',appletv:'#a1a1aa',spotify:'#1ed760',plex:'#e5a00d',crunchyroll:'#f47521',dazn:'#d6d600',movistar:'#0b6fd8'};
 var NEUTRAL='#5b6b80',SOURCE_ON='#2f8cff';

 // ── horloge (chiffres modernes, seuls les caractères qui changent sont réécrits) ──
 var clockValues='';
 function makeClock(){
  var c=$('clock');c.textContent='';
  c.appendChild(el('span','clock-h'));c.appendChild(el('span','clock-sep',':'));c.appendChild(el('span','clock-m'));
 }
 function clock(){
  if(document.hidden)return;
  var d=new Date(),v=('0'+d.getHours()).slice(-2)+('0'+d.getMinutes()).slice(-2);
  if(!$('clock').firstChild)makeClock();
  if(clockValues!==v){$('clock').children[0].textContent=v.slice(0,2);$('clock').children[2].textContent=v.slice(2);}
  clockValues=v;$('clock').setAttribute('aria-label',v.slice(0,2)+':'+v.slice(2));
  var h=d.getHours(),hello=h>=5&&h<12?'Bonjour':h>=12&&h<18?'Bon après-midi':h>=18&&h<22?'Bonsoir':'Bonne nuit';
  var day=d.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
  var dn=$('date');if(dn.getAttribute('data-v')!==day+hello){dn.setAttribute('data-v',day+hello);dn.textContent='';dn.appendChild(el('span','date-hello',hello));dn.appendChild(el('span','date-day',day));}
  if(ambient)ambientShift();
 }
 function scheduleClock(){var d=new Date();setTimeout(function(){clock();scheduleClock();},60500-d.getSeconds()*1000-d.getMilliseconds());}

 // ── météo ───────────────────────────────────────────────────────────────
 var weatherAt=0;
 function weather(force){
  var box=$('weather');
  if(!prefs.weather||!window.Weather){box.classList.add('hidden');return;}
  if(document.hidden||(!force&&Date.now()-weatherAt<10*60000))return;
  weatherAt=Date.now();
  Weather.get(prefs.city,force).then(function(w){
   box.textContent='';
   box.appendChild(icon(Weather.icons[w.icon]||Weather.icons.cloud,'weather-icon'));
   var t=el('div','weather-text');
   t.appendChild(el('span','weather-temp',w.temp+'°'));
   var range=w.min!=null&&w.max!=null?' · '+w.min+'° / '+w.max+'°':'';
   t.appendChild(el('span','weather-desc',w.label+range));
   box.appendChild(t);box.setAttribute('aria-label','Météo : '+w.temp+' degrés, '+w.label);
   box.classList.remove('hidden');
  },function(){box.classList.add('hidden');weatherAt=Date.now()-9*60000;});
 }

 // ── fonds d'écran (images fixes : aucun calcul pendant l'utilisation) ────
 var WALLS=[['blackhole','Trou noir'],['galaxy','Galaxie'],['nebula','Nébuleuse'],['deepspace','Espace profond'],['scene','Paysage'],['black','Noir OLED']];
 function wallName(k){for(var i=0;i<WALLS.length;i++)if(WALLS[i][0]===k)return WALLS[i][1];return WALLS[0][1];}
 function wallpaperMenu(){
  openMenu('Fond d\'écran','Les fonds spatiaux s\'affichent en thème sombre.',WALLS.map(function(w){
   return{label:w[1],icon:w[0]==='black'?I.moon:w[0]==='scene'?I.sun:I.planet,selected:prefs.wallpaper===w[0],run:function(){
    prefs.wallpaper=w[0];if(w[0]!=='scene'&&prefs.theme==='light'){prefs.theme='dark';renderTiles(true);}
    save();appearance();toast('Fond d\'écran : '+w[1]);
   }};
  }),{grid:true});
 }
 function cityMenu(){
  var opts=[{label:'Automatique',detail:'selon la connexion',icon:I.home,selected:prefs.city==='auto',run:function(){setCity('auto');}}];
  Weather.cities.forEach(function(c){opts.push({label:c,icon:I.sources,selected:prefs.city===c,run:function(){setCity(c);}});});
  openMenu('Ville de la météo','',opts,{grid:true});
 }
 function setCity(c){prefs.city=c;save();weather(true);}

 // ── apps ────────────────────────────────────────────────────────────────
 function appById(id){for(var i=0;i<installed.length;i++)if(installed[i].id===id)return installed[i];return null;}
 function appName(a){return a.label||a.name;}
 function favorites(){var out=[];prefs.order.forEach(function(id){var a=appById(id);if(a)out.push(a);});return out;}
 function isFav(id){return prefs.order.indexOf(id)>=0;}
 function allApps(){return installed.slice().sort(function(a,b){return appName(a).localeCompare(appName(b),'fr');});}
 var ADD={kind:'add'};
 function buildItems(){
  if(mode==='browse'||mode==='pick')return allApps().map(function(a){return{kind:'app',app:a};});
  var f=favorites().map(function(a){return{kind:'app',app:a};});
  if(mode==='organize'||!f.length)f.push(ADD);
  return f;
 }

 // Anti double-appui : un même lancement n'est pas renvoyé pendant 1,5 s.
 var lastLaunch={id:'',at:0};
 function launch(id){
  if(preview){toast('Aperçu : ouverture de '+id);return;}
  var now=Date.now();if(lastLaunch.id===id&&now-lastLaunch.at<1500)return;lastLaunch={id:id,at:now};
  Apps.launch(id).then(function(){markOpened(id);},failure);
 }

 // Dernière ouverture de chaque app (au plus 40 retenues) : affichée au-dessus du nom.
 function markOpened(id){
  prefs.opened[id]=Date.now();
  var ids=Object.keys(prefs.opened).sort(function(x,y){return prefs.opened[y]-prefs.opened[x];});
  ids.slice(40).forEach(function(k){delete prefs.opened[k];});
  prefs.lastApp=id;save();
 }
 function ago(t){
  if(!t)return'';var m=Math.round((Date.now()-t)/60000);
  if(m<1)return'à l\'instant';if(m<60)return'il y a '+m+' min';
  var h=Math.round(m/60);if(h<24)return'il y a '+h+' h';
  var d=Math.round(h/24);return d===1?'hier':'il y a '+d+' jours';
 }
 function openedLabel(a){var t=prefs.opened[a.id];return t?' · ouverte '+ago(t):'';}

 function focusLastApp(){
  if(!prefs.lastApp||mode!=='home')return;
  for(var k=0;k<items.length;k++)if(items[k].app&&items[k].app.id===prefs.lastApp){section=1;index=k;return;}
 }
 function setFav(a,on){
  if(on&&!isFav(a.id))prefs.order.push(a.id);
  if(!on)prefs.order=prefs.order.filter(function(id){return id!==a.id;});
  save();
 }

 // Déplace un favori visible (les ids absents de la TV gardent leur place en fin de liste).
 function moveFav(from,to){
  var ids=favorites().map(function(a){return a.id;});
  if(to<0||to>=ids.length||from===to)return false;
  ids.splice(to,0,ids.splice(from,1)[0]);
  prefs.order=ids.concat(prefs.order.filter(function(id){return ids.indexOf(id)<0;}));
  return true;
 }

 // ── tuiles ──────────────────────────────────────────────────────────────
 var logoKeys=['youtube','netflix','primevideo','disneyplus','max','twitch','appletv','spotify','plex','crunchyroll','dazn','movistar'];
 function brandKey(a){var b=findBrand(a);return b&&logoKeys.indexOf(b.key)>=0?b.key:'neutral';}
 function applyDynamicGlow(tile,img){
  var c=document.createElement('canvas');c.width=12;c.height=12;var ctx=c.getContext('2d');
  try{
   ctx.drawImage(img,0,0,12,12);var d=ctx.getImageData(0,0,12,12).data,r=0,g=0,b=0,n=0;
   for(var i=0;i<d.length;i+=4)if(d[i+3]>100){r+=d[i];g+=d[i+1];b+=d[i+2];n++;}
   if(!n)return;r=Math.round(r/n);g=Math.round(g/n);b=Math.round(b/n);
   var col='rgb('+r+','+g+','+b+')';tile.style.setProperty('--app-accent',col);tile._accent=col;
   tile.style.setProperty('--accent-wash','rgba('+r+','+g+','+b+',.22)');
   if(tile===focusedEl)setTint(col);
  }catch(e){}
 }
 function bindTile(tile,i){tile.onclick=function(){section=1;index=i;activate();};}
 // Carte : fond sobre + voile de la couleur de l'app, logo centré ; anneau et ombre au focus.
 function buildTile(item,i){
  var tile=el('button','app'),card=el('span','card');
  if(item.kind==='add'){
   tile.classList.add('add-tile');tile.setAttribute('aria-label','Ajouter des apps');
   card.appendChild(icon(I.plus,'add-icon'));tile.appendChild(card);
   tile.appendChild(el('span','label','Ajouter'));
  }else{
   var a=item.app,bk=brandKey(a),accent=ACCENTS[bk];
   tile.setAttribute('aria-label',appName(a));tile.setAttribute('data-brand',bk);
   if(accent)tile.style.setProperty('--app-accent',accent);
   var fallback=function(){var imgs=card.querySelectorAll('img');for(var j=0;j<imgs.length;j++)card.removeChild(imgs[j]);card.insertBefore(el('span','fallback',appName(a).charAt(0).toUpperCase()),card.firstChild);};
   if(bk!=='neutral'){var lg=el('img','logo logo-'+bk);lg.decoding='async';lg.src='assets/logo-'+bk+'-'+prefs.theme+'.svg';lg.alt='';lg.onerror=fallback;card.appendChild(lg);}
   else if(a.iconPath){var ic=el('img','app-icon');ic.src=a.iconPath;ic.alt='';ic.onload=function(){applyDynamicGlow(tile,ic);};ic.onerror=fallback;card.appendChild(ic);}
   else fallback();
   tile.appendChild(card);tile.appendChild(el('span','label',appName(a)));
   if(mode==='pick'||mode==='browse'){var badge=el('span','fav-badge'+(isFav(a.id)?' on':''));badge.appendChild(icon(mode==='pick'?I.check:I.pin));tile.appendChild(badge);}
  }
  card.appendChild(el('span','hold-bar'));
  bindTile(tile,i);
  return tile;
 }

 function itemsHash(){
  return mode+'|'+prefs.theme+'|'+items.map(function(it){return it.kind==='add'?'+':it.app.id+(mode==='pick'||mode==='browse'?(isFav(it.app.id)?'*':''):'');}).join(',');
 }

 function renderTiles(force){
  items=buildItems();
  var h=itemsHash();
  if(!force&&h===tilesHash)return;
  tilesHash=h;
  var box=$('tiles');
  // Le focus peut être ailleurs (barre du haut) : on ne l'oublie que s'il était sur une tuile.
  if(focusedEl&&box.contains(focusedEl))focusedEl=null;
  box.textContent='';
  if(!items.length&&loadingApps){
   for(var s=0;s<COLS;s++){var sk=el('button','app tile-skeleton');sk.setAttribute('aria-hidden','true');sk.appendChild(el('span','card'));box.appendChild(sk);}
   return;
  }
  var frag=document.createDocumentFragment();
  items.forEach(function(it,i){frag.appendChild(buildTile(it,i));});
  box.appendChild(frag);
  if(!items.length)box.appendChild(el('p','empty-state','Aucune app trouvée.'));
 }

 // ── barre d'outils ──────────────────────────────────────────────────────
 var TOOLS=[
  {label:'Toutes les apps',on:'Retour aux favoris',icon:I.grid,active:function(){return mode==='browse'||mode==='pick';}},
  {label:'Organiser',on:'Terminer',icon:I.arrange,active:function(){return mode==='organize';}},
  {label:'Réglages',icon:I.gear,active:function(){return false;}}
 ];
 function toolbar(){
  var n=$('toolbar');
  if(!n.children.length){
   TOOLS.forEach(function(t,i){
    var b=el('button','tool');b.appendChild(icon(t.icon));b.appendChild(el('span','tool-label',t.label));
    b.onclick=function(){section=0;index=i;activate();};n.appendChild(b);
   });
  }
  TOOLS.forEach(function(t,i){
   var b=n.children[i],act=t.active();b.classList.toggle('active',act);
   var label=act&&t.on?t.on:t.label;setText(b.querySelector('.tool-label'),label);b.setAttribute('aria-label',label);
  });
 }

 // ── sources ─────────────────────────────────────────────────────────────
 var DEVICE_ICONS=[
  [/playstation|xbox|console|switch/i,'<path d="M7 9h10a4 4 0 0 1 4 4v1.5a2.5 2.5 0 0 1-4.6 1.4L15 14H9l-1.4 1.9A2.5 2.5 0 0 1 3 14.5V13a4 4 0 0 1 4-4Z"/><path d="M8 11.5v3M6.5 13h3"/><path d="M15.5 12.4h.01M17.5 14h.01"/>'],
  [/(^|\s)pc(\s|$)|raspberry/i,'<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/>'],
  [/décodeur|box/i,'<rect x="3" y="9" width="18" height="7" rx="1.5"/><path d="M6 12.5h4M16 12.5h.01M7 16v2M17 16v2"/>'],
  [/apple tv|chromecast/i,'<rect x="5" y="7" width="14" height="10" rx="3"/><path d="M9 12h6"/>'],
  [/blu-?ray/i,'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/>'],
  [/caméra/i,'<rect x="3" y="7" width="13" height="10" rx="2"/><path d="m16 11 5-3v8l-5-3"/>']
 ];
 var INPUT_PRESETS=['Console','PC','Décodeur TV','Apple TV','Chromecast','Nintendo Switch','PlayStation','Xbox','Blu-ray','Raspberry Pi','Caméra'];
 var GAMING=/console|(^|\s)pc(\s|$)|playstation|xbox|switch|raspberry/i;
 var METHODS={samsung:'Samsung (comme le menu Sources)',inapp:'Instantané (sans Mode Jeu)',hybrid:'Image directe + lecteur Samsung',simple:'Lecteur TV simple',switch:'Source seule'},METHOD_ORDER=['samsung','inapp','hybrid','simple','switch'];
 function inputLabel(a){return a.hdmi&&prefs.inputNames[a.hdmi]?prefs.inputNames[a.hdmi]:a.label;}
 function inputMethod(a){var m=prefs.inputMethods[a.hdmi];return METHODS[m]?m:'samsung';}
 function iconFor(name){for(var i=0;i<DEVICE_ICONS.length;i++)if(DEVICE_ICONS[i][0].test(name))return DEVICE_ICONS[i][1];return I.hdmi;}
 function deviceIcon(a){return a.hdmi?iconFor(inputLabel(a)):I.tv;}
 function renderInputs(){
  var row=$('input-row');row.textContent='';
  inputs.forEach(function(a,i){
   var b=el('button','input'+(a.connected?' connected':'')+(a.hdmi&&a.hdmi===prefs.lastInput?' recent':''));
   b.appendChild(icon(deviceIcon(a),'input-symbol'));
   var copy=el('span','input-copy');copy.appendChild(el('span','input-name',inputLabel(a)));
   copy.appendChild(el('small','input-state',a.hdmi?(a.connected?'Allumé':'Éteint')+' · HDMI '+a.hdmi:'Chaînes TV'));
   b.appendChild(copy);
   if(a.hdmi){var dot=el('span','input-status');dot.setAttribute('aria-hidden','true');b.appendChild(dot);b.appendChild(el('span','hold-bar'));}
   b.setAttribute('aria-label',inputLabel(a)+(a.hdmi?(a.connected?', allumé':', éteint'):''));
   b.onclick=function(){section=2;index=i;activate();};row.appendChild(b);
  });
  var on=inputs.filter(function(x){return x.connected;}).length,t=$('sources-title');
  t.textContent='Sources';
  if(inputs.some(function(x){return x.hdmi;}))t.appendChild(el('span','sources-count',on?on+(on>1?' allumées':' allumée'):'aucune allumée'));
  if(section===2&&!menu)focus();
 }
 function buildInputs(info){
  var list=[],status=Inputs.hdmiStatus(info);
  Object.keys(status).map(Number).sort(function(a,b){return a-b;}).forEach(function(n){list.push({hdmi:n,label:'HDMI '+n,connected:status[n]});});
  list.push({id:'org.tizen.tv-viewer',label:'Télévision'});
  return list;
 }
 function sameInputs(a,b){if(a.length!==b.length)return false;for(var i=0;i<a.length;i++)if(a[i].hdmi!==b[i].hdmi||a[i].connected!==b[i].connected)return false;return true;}
 // Rien n'est interrogé pendant qu'une autre app (jeu, film…) est au premier plan.
 function refreshInputs(fresh){
  if(preview||!window.Inputs||document.hidden)return;
  Inputs.sources(fresh).then(function(info){var next=buildInputs(info);if(!sameInputs(inputs,next)){inputs=next;renderInputs();updateHero();}},function(){});
 }
 function openInput(a){
  var name=inputLabel(a);
  if(preview){toast('Aperçu : passage sur '+name);return;}
  var m=inputMethod(a);
  // Réponse immédiate à l'appui : écran noir avec le nom, pendant que la TV bascule.
  switching(name,a.connected);
  watchHandoff=m==='hybrid';
  window.FLIX_ON_SHOW=function(){watching=a;$('stage').classList.add('watching');document.documentElement.classList.add('watching');switching(null);};
  Inputs.open(a.hdmi,m==='simple'?'viewer':m).then(function(r){
   if(window.FLIX_SWITCH_T){window.FLIX_SWITCH_T.done=Date.now()-window.FLIX_SWITCH_T.start;saveDiag('switch',window.FLIX_SWITCH_T);}
   if(prefs.lastInput!==a.hdmi){prefs.lastInput=a.hdmi;}
   if(r==='hybrid'){if(!watching)window.FLIX_ON_SHOW();return;}
   if(r==='inapp'){watching=a;$('stage').classList.add('watching');document.documentElement.classList.add('watching');switching(null);return;}
   if(r==='picker'){switching(null);toast('Choisissez '+name+' dans le menu des sources Samsung.');}
   if(r==='switch')setTimeout(function(){switching(null);},1200);
   // Sinon l'écran reste noir jusqu'à ce que le lecteur Samsung passe devant (filet : 6 s).
   switchTimer=setTimeout(function(){switching(null);},6000);
  },function(e){switching(null);failure(e);});
 }
 var watching=null,switchTimer=null;
 function switching(name,on){
  clearTimeout(switchTimer);
  var o=$('switching');
  if(!name){o.classList.add('hidden');return;}
  o.textContent='';o.appendChild(el('div','switching-name',name));
  o.appendChild(el('div','switching-sub',on===false?'L\'appareil semble éteint…':'Ouverture…'));
  o.classList.remove('hidden');
 }
 // Retour depuis une source affichée en mode instantané.
 var watchHandoff=false,streamPending=false;
 function hideStream(){streamPending=false;try{Inputs.hide().catch(function(){});}catch(e){}}
 // keepStream : passage de relais au lecteur Samsung — on ne coupe pas l'image, sinon il
 // doit rouvrir la source (nouvelle resynchronisation HDMI, écran noir, attente).
 function stopWatching(keepStream){
  if(!watching)return;watching=null;$('stage').classList.remove('watching');document.documentElement.classList.remove('watching');
  if(keepStream)streamPending=true;else hideStream();
  renderInputs();focus();
 }
 function inputMenu(a){
  var m=inputMethod(a);
  openMenu(inputLabel(a),'HDMI '+a.hdmi+(a.connected?' · allumé':' · éteint'),[
   {label:'Renommer',detail:inputLabel(a),icon:I.rename,run:function(){renameInput(a);}},
   {label:'Ouverture',detail:METHODS[m],icon:I.open,keep:true,run:function(){prefs.inputMethods[a.hdmi]=METHOD_ORDER[(METHOD_ORDER.indexOf(m)+1)%METHOD_ORDER.length];save();inputMenu(a);menu.index=1;focus();}},
   {label:'Type d\'appareil et Mode Jeu',detail:'Menu Samsung',icon:I.sources,run:function(){if(preview){toast('Aperçu : sources Samsung');return;}Inputs.openPicker().catch(failure);}}
  ]);
 }
 function renameInput(a){
  var cur=prefs.inputNames[a.hdmi];
  var opts=INPUT_PRESETS.map(function(name){
   return{label:name,icon:iconFor(name),selected:cur===name,run:function(){
    prefs.inputNames[a.hdmi]=name;save();renderInputs();updateHero();
    toast(GAMING.test(name)?'Astuce : dans le menu Samsung, réglez son type d\'appareil sur '+(/pc|raspberry/i.test(name)?'PC':'Console de jeu')+' et activez Mode Jeu auto.':'Renommé : '+name);
   }};
  });
  opts.push({label:'HDMI '+a.hdmi,detail:'nom d\'origine',icon:I.hdmi,selected:!cur,run:function(){delete prefs.inputNames[a.hdmi];save();renderInputs();updateHero();}});
  openMenu('Renommer HDMI '+a.hdmi,'Le nom choisit aussi l\'icône de la tuile.',opts,{grid:true});
 }

 // ── focus, héros, aide ──────────────────────────────────────────────────
 function nodes(){return section===0?$('toolbar').children:section===1?$('tiles').querySelectorAll('.app'):$('input-row').children;}
 function focus(){
  if(focusedEl){focusedEl.classList.remove('focused');focusedEl=null;}
  if(menu){
   var opts=$('options').children;menu.index=Math.max(0,Math.min(menu.index,opts.length-1));
   if(opts[menu.index]){opts[menu.index].classList.add('focused');focusedEl=opts[menu.index];}
   updateHint();return;
  }
  var ns=nodes();
  if(!ns.length&&section===1){section=inputs.length?2:0;index=0;ns=nodes();}
  index=Math.max(0,Math.min(index,ns.length-1));
  if(ns[index]){ns[index].classList.add('focused');focusedEl=ns[index];if(picked>=0&&section===1)focusedEl.classList.add('picked');}
  var row=section===1?Math.floor(index/COLS):0;
  $('tiles').style.transform='translateY('+(-row*ROW_H)+'px)';
  scheduleDetails(row);
 }
 // Textes du héros, aide et points : regroupés en une mise à jour par image
 // (une flèche maintenue ne déclenche plus une mise en page à chaque répétition).
 var detailsPending=false,detailsRow=0;
 function scheduleDetails(row){
  detailsRow=row;if(detailsPending)return;detailsPending=true;
  (window.requestAnimationFrame||setTimeout)(function(){detailsPending=false;scrollDots(detailsRow);updateHero();updateHint();});
 }
 function scrollDots(row){
  var d=$('scroll-dots'),rows=Math.ceil(items.length/COLS),want=rows>1?rows:0;
  if(d.childElementCount!==want){d.textContent='';for(var i=0;i<want;i++)d.appendChild(el('span','scroll-dot'));}
  for(var j=0;j<d.children.length;j++)d.children[j].classList.toggle('active',j===row);
 }
 function hero(eyebrow,title,sub,tint){setText($('hero-eyebrow'),eyebrow);setText($('hero-title'),title);setText($('hero-sub'),sub);setTint(tint||NEUTRAL);}
 function updateHero(){
  if(menu)return;
  var favCount=favorites().length;
  setText($('heading'),mode==='browse'?'Toutes les apps':mode==='pick'?'Choisir les favoris':mode==='organize'?'Organiser les favoris':'Favoris');
  setText($('heading-meta'),mode==='browse'||mode==='pick'?installed.length+' apps · '+favCount+' épinglées':favCount?favCount+(favCount>1?' épinglées':' épinglée'):'');
  $('stage').classList.toggle('organizing',mode==='organize');
  $('stage').classList.toggle('moving',picked>=0);
  if(section===0){
   var t=TOOLS[index],act=t.active();
   var subs=['Parcourez toutes les apps installées sur la TV.','Changez l\'ordre de vos favoris, ajoutez-en ou retirez-en.','Thème, lueur, veille anti-marquage, sources Samsung…'];
   hero('Menu',act&&t.on?t.on:t.label,act&&index===0?'Revenir à vos favoris.':act&&index===1?'Enregistrer et quitter le mode Organiser.':subs[index],NEUTRAL);return;
  }
  if(section===2){
   var a=inputs[index];if(!a){hero('Sources','Aucune source','',NEUTRAL);return;}
   if(!a.hdmi){hero('Source',inputLabel(a),a.id==='org.tizen.SMSourceAPP'?'Ouvre le menu des sources Samsung.':'Ouvre les chaînes TV.',NEUTRAL);return;}
   hero('Source · HDMI '+a.hdmi,inputLabel(a),a.connected?'Allumé · OK ouvre l\'appareil avec les réglages de la TV (Mode Jeu, PC…)':'Éteint · allumez l\'appareil, la tuile passera en bleu.',a.connected?SOURCE_ON:NEUTRAL);return;
  }
  var it=items[index];
  if(!it){hero(loadingApps?'Chargement':'Favoris',loadingApps?'Un instant…':'Aucune app','',NEUTRAL);return;}
  if(it.kind==='add'){hero(mode==='organize'?'Organiser':'Favoris','Ajouter des apps','Choisissez les apps à épingler sur l\'accueil.',NEUTRAL);return;}
  var app=it.app,name=appName(app),tint=ACCENTS[brandKey(app)]||(focusedEl&&focusedEl._accent)||NEUTRAL;
  if(mode==='organize'){hero(picked>=0?'Déplacement en cours':'Organiser',name,picked>=0?'Flèches pour déplacer · OK pour poser ici · Retour pour annuler':'OK pour déplacer · Maintenir OK pour retirer · Retour pour terminer',tint);return;}
  if(mode==='pick'){hero(isFav(app.id)?'Épinglée':'Non épinglée',name,isFav(app.id)?'OK pour la retirer des favoris':'OK pour l\'épingler sur l\'accueil',tint);return;}
  if(mode==='browse'){hero((isFav(app.id)?'Application · épinglée':'Application')+openedLabel(app),name,'OK pour ouvrir · Maintenir OK pour '+(isFav(app.id)?'désépingler':'épingler'),tint);return;}
  hero('Application'+openedLabel(app),name,'OK pour ouvrir · Maintenir OK pour les options',tint);
 }
 function updateHint(){
  var t;
  if(menu)t='Flèches choisir · OK valider · Retour fermer';
  else if(mode==='organize')t=picked>=0?'Flèches déplacer · OK poser · Retour annuler':'OK déplacer · Maintenir OK retirer · Retour terminer';
  else if(mode==='pick')t='OK épingler ou retirer · Retour terminer';
  else if(mode==='browse')t='OK ouvrir · Maintenir OK épingler · Retour favoris';
  else t='OK ouvrir · Maintenir OK options';
  setText($('hint'),t);
 }

 // ── menus ───────────────────────────────────────────────────────────────
 // options : [{label, detail, icon, run, group, selected, keep}] ; opts.grid = disposition en 2 colonnes.
 function openMenu(title,sub,options,opts){
  opts=opts||{};menu={options:options,index:0,grid:!!opts.grid};
  if(focusedEl){focusedEl.classList.remove('focused');focusedEl=null;}
  $('dialog').classList.toggle('grid',menu.grid);
  setText($('dialog-title'),title);setText($('dialog-sub'),sub||'');$('dialog-sub').classList.toggle('hidden',!sub);
  var box=$('options');box.textContent='';
  options.forEach(function(o,i){
   var b=el('button','option'+(o.group?' group-start':'')+(o.selected?' selected':''));
   if(o.icon)b.appendChild(icon(o.icon,'option-icon'));
   b.appendChild(el('span','option-name',o.label));
   if(o.detail)b.appendChild(el('span','option-detail',o.detail));
   if(o.selected)b.appendChild(icon(I.check,'option-check'));
   b.onclick=function(){menu.index=i;choose();};box.appendChild(b);
   if(o.selected)menu.index=i;
  });
  $('modal').classList.remove('hidden');focus();
 }
 function closeMenu(){menu=null;$('modal').classList.add('hidden');focus();}
 // Une option « keep » (réglage à bascule) rouvre le même menu à la même ligne.
 function choose(){var o=menu.options[menu.index],at=menu.index;if(!o.keep)closeMenu();o.run();if(o.keep&&menu){menu.index=at;focus();}}
 function menuArrow(code){
  var n=menu.options.length,i=menu.index,c=menu.grid?2:1;
  if(code===38)i-=c;if(code===40)i+=c;
  if(menu.grid){if(code===37&&i%2===1)i--;if(code===39&&i%2===0&&i+1<n)i++;}
  if(i>=0&&i<n)menu.index=i;focus();
 }

 function settings(){
  openMenu('Réglages','Flix Home 1.5',[
   {label:'Thème',detail:prefs.theme==='dark'?'Sombre':'Clair',icon:prefs.theme==='dark'?I.moon:I.sun,keep:true,run:function(){prefs.theme=prefs.theme==='dark'?'light':'dark';save();appearance();renderTiles(true);settings();}},
   {label:'Lueur des tuiles',detail:prefs.glow?'Activée':'Désactivée',icon:I.glow,keep:true,run:function(){prefs.glow=!prefs.glow;save();appearance();settings();}},
   {label:'Effets visuels',detail:prefs.effects==='full'?'Complets':'Légers (rapide)',icon:I.motion,keep:true,run:function(){prefs.effects=prefs.effects==='full'?'lite':'full';save();appearance();settings();}},
   {label:'Veille anti-marquage',detail:prefs.ambient?'Après 3 min':'Désactivée',icon:I.moon,keep:true,run:function(){prefs.ambient=!prefs.ambient;save();poke();settings();}},
   {label:'Fond d\'écran',detail:wallName(prefs.wallpaper),icon:I.wallpaper,group:true,run:function(){wallpaperMenu();}},
   {label:'Météo',detail:prefs.weather?'Affichée':'Masquée',icon:I.sun,keep:true,run:function(){prefs.weather=!prefs.weather;save();weather(true);settings();}},
   {label:'Ville de la météo',detail:prefs.city==='auto'?'Automatique':prefs.city,icon:I.sources,run:function(){cityMenu();}},
   {label:'Sources Samsung',icon:I.sources,group:true,run:function(){launch('org.tizen.SMSourceAPP');}},
   {label:'Accueil Samsung',icon:I.home,run:function(){launch('com.samsung.tv.csfs');}},
   {label:'Recharger les apps',icon:I.refresh,run:function(){load(true);toast('Liste des apps rechargée');}},
   {label:'Diagnostic',detail:'mesures de cette TV',icon:I.motion,run:function(){diagnostics();}}
  ]);
 }

 // ── diagnostic : mesures réelles sur la TV ──────────────────────────────
 var DIAG_KEY='flixhome.diag.v1',diag=(function(){try{return JSON.parse(localStorage.getItem(DIAG_KEY))||{};}catch(e){return{};}})();
 function saveDiag(k,v){diag[k]=v;try{localStorage.setItem(DIAG_KEY,JSON.stringify(diag));}catch(e){}}
 // Images/s pendant la navigation : on chronomètre les images qui suivent chaque touche.
 var navFrames=[],sampling=0;
 function sampleFrames(){
  if(sampling)return;sampling=1;var last=performance.now(),end=last+500;
  (function tick(t){navFrames.push(t-last);last=t;if(navFrames.length>400)navFrames.splice(0,100);if(t<end)requestAnimationFrame(tick);else sampling=0;})(last);
 }
 function navStats(){
  var f=navFrames.slice(1);if(f.length<10)return null;
  var avg=f.reduce(function(a,b){return a+b;},0)/f.length,slow=f.filter(function(x){return x>50;}).length;
  return{fps:Math.round(1000/avg),slow:slow,worst:Math.round(Math.max.apply(null,f))};
 }
 function diagnostics(){
  var n=navStats(),sw=diag.switch,b=diag.boot||{},ua=navigator.userAgent.match(/Chrome\/(\d+)/);
  var rows=[
   {label:'Navigation',detail:n?n.fps+' i/s · '+n.slow+' saccades · pire '+n.worst+' ms':'déplacez-vous puis rouvrez',icon:I.motion},
   {label:'Démarrage (accueil affiché)',detail:b.firstPaint!=null?b.firstPaint+' ms':'—',icon:I.home},
   {label:'Liste des apps (TV)',detail:b.apps!=null?b.apps+' ms':'—',icon:I.grid},
   {label:'Liste des sources (TV)',detail:b.sources!=null?b.sources+' ms':'—',icon:I.sources},
   {label:'Dernière bascule',detail:sw?(METHODS[sw.method==='viewer'?'simple':sw.method]||sw.method)+' : source réglée '+(sw.setSource!=null?sw.setSource:'?')+' ms'+(sw.left!=null?', Flix Home quittée '+sw.left+' ms':sw.method==='inapp'?', affichée '+sw.done+' ms':''):'aucune',icon:I.hdmi},
   {label:'Navigateur de la TV',detail:ua?'Chromium '+ua[1]:'?',icon:I.gear},
   {label:'Effets visuels',detail:prefs.effects==='full'?'Complets':'Légers',icon:I.glow}
  ];
  rows.forEach(function(r){r.run=function(){};});
  openMenu('Diagnostic','Faites une capture de cet écran et envoyez-la : elle montre où part le temps.',rows);
 }

 // ── modes ───────────────────────────────────────────────────────────────
 function setMode(m,keepIndex){
  if(mode==='organize'&&picked>=0)dropPicked(true);
  mode=m;picked=-1;section=1;if(!keepIndex)index=0;
  renderTiles(true);toolbar();focus();
 }
 function pickUp(){picked=index;pickedOrigin=prefs.order.slice();focus();}
 function dropPicked(keep){
  if(picked<0)return;
  if(keep)save();else prefs.order=pickedOrigin;
  if(!keep)index=pickedOrigin?indexOfOriginal():index;
  picked=-1;pickedOrigin=null;renderTiles(true);focus();
 }
 var pickedId=null;
 function indexOfOriginal(){var f=favorites();for(var i=0;i<f.length;i++)if(f[i].id===pickedId)return i;return index;}
 function movePicked(code){
  var n=favorites().length,to=index;
  if(code===37)to--;if(code===39)to++;if(code===38)to-=COLS;if(code===40)to+=COLS;
  if(to<0||to>=n)return;
  if(moveFav(index,to)){
   // Déplacement direct des nœuds : pas de reconstruction des tuiles.
   var box=$('tiles'),node=box.children[index],ref=box.children[to];
   if(to>index)box.insertBefore(node,ref.nextSibling);else box.insertBefore(node,ref);
   items=buildItems();tilesHash=itemsHash();
   Array.prototype.forEach.call(box.children,bindTile);
   index=to;picked=to;focus();
  }
 }

 function appMenu(a){
  if(mode==='organize'){
   openMenu(appName(a),'Organiser les favoris',[
    {label:'Déplacer',icon:I.move,run:function(){pickedId=a.id;pickUp();}},
    {label:'Retirer des favoris',icon:I.trash,run:function(){setFav(a,false);renderTiles(true);focus();toast(appName(a)+' retirée des favoris (toujours installée)');}}
   ]);return;
  }
  var fav=isFav(a.id),opts=[{label:'Ouvrir',icon:I.open,run:function(){launch(a.id);}}];
  opts.push({label:fav?'Retirer des favoris':'Épingler sur l\'accueil',icon:fav?I.trash:I.pin,run:function(){setFav(a,!fav);renderTiles(true);focus();toast(fav?appName(a)+' retirée des favoris':appName(a)+' épinglée sur l\'accueil');}});
  if(mode==='home')opts.push({label:'Organiser les favoris',icon:I.arrange,group:true,run:function(){setMode('organize',true);}});
  openMenu(appName(a),fav?'Épinglée sur l\'accueil':'Application installée',opts);
 }

 // ── actions ─────────────────────────────────────────────────────────────
 function activate(){
  if(menu){choose();return;}
  if(section===0){
   if(index===0)setMode(mode==='browse'||mode==='pick'?'home':'browse');
   else if(index===1)setMode(mode==='organize'?'home':'organize');
   else settings();
   return;
  }
  if(section===2){var a=inputs[index];if(!a)return;if(a.hdmi)openInput(a);else launch(a.id);return;}
  var it=items[index];if(!it)return;
  if(it.kind==='add'){setMode('pick');return;}
  var app=it.app;
  if(mode==='organize'){if(picked>=0){dropPicked(true);toast('Rangé');}else{pickedId=app.id;pickUp();}return;}
  if(mode==='pick'){var on=!isFav(app.id);setFav(app,on);var i=index;renderTiles(true);index=i;focus();return;}
  launch(app.id);
 }
 function longPress(){
  if(menu)return;
  if(section===2){var a=inputs[index];if(a&&a.hdmi)inputMenu(a);return;}
  if(section!==1)return;
  var it=items[index];if(!it||it.kind!=='app'||picked>=0)return;
  appMenu(it.app);
 }
 function back(){
  if(menu){closeMenu();return;}
  if(mode==='organize'&&picked>=0){dropPicked(false);toast('Déplacement annulé');return;}
  if(mode==='pick'){setMode('organize');return;}
  if(mode!=='home'){setMode('home');return;}
  openMenu('Quitter Flix Home ?','',[
   {label:'Aller à l\'accueil Samsung',icon:I.home,run:function(){launch('com.samsung.tv.csfs');}},
   {label:'Rester ici',icon:I.close,run:function(){}}
  ]);
 }
 function arrow(code){
  if(menu){menuArrow(code);return;}
  if(picked>=0&&section===1){movePicked(code);return;}
  var count=nodes().length;
  if(code===37)index=Math.max(0,index-1);
  else if(code===39)index=Math.min(count-1,index+1);
  else if(code===38){
   if(section===2){section=1;var rows=Math.ceil(items.length/COLS),cur=Math.floor(index/1);index=Math.min(items.length-1,Math.max(0,(rows-1)*COLS)+Math.min(cur,COLS-1));}
   else if(section===1&&index>=COLS)index-=COLS;
   else if(section===1){section=0;index=mode==='organize'?1:0;}
  }else if(code===40){
   if(section===0){section=1;index=0;}
   else if(section===1&&index+COLS<items.length)index+=COLS;
   else if(section===1&&Math.floor(index/COLS)<Math.floor((items.length-1)/COLS))index=items.length-1;
   else if(section===1&&inputs.length){section=2;index=Math.min(index%COLS,inputs.length-1);}
  }
  focus();
 }

 // ── veille anti-marquage (QD-OLED) ──────────────────────────────────────
 // Après 3 min sans touche : tout s'efface sauf l'heure, atténuée, qui se décale
 // de quelques pixels chaque minute. La première touche réveille sans rien déclencher.
 var AMBIENT_MS=window.FLIX_AMBIENT_MS||180000,ambient=false,ambientTimer=null,swallowUp=false;
 var SHIFTS=[[0,0],[14,-8],[-12,10],[18,6],[-16,-10],[8,14],[-6,-14]],shiftI=0;
 function poke(){
  clearTimeout(ambientTimer);
  if(prefs.ambient&&(!preview||window.FLIX_AMBIENT_MS))ambientTimer=setTimeout(function(){if(!menu&&!document.hidden&&picked<0)setAmbient(true);else poke();},AMBIENT_MS);
 }
 function setAmbient(on){ambient=on;$('stage').classList.toggle('ambient',on);if(!on){$('clock-group').style.transform='';poke();}else ambientShift();}
 function ambientShift(){shiftI=(shiftI+1)%SHIFTS.length;$('clock-group').style.transform='translate('+(470+SHIFTS[shiftI][0])+'px,'+(330+SHIFTS[shiftI][1])+'px) scale(1.5)';}

 // ── clavier ─────────────────────────────────────────────────────────────
 document.addEventListener('keydown',function(e){
  var c=e.keyCode;
  if(ambient){e.preventDefault();swallowUp=true;setAmbient(false);return;}
  if(watching){if(c===10009||c===27||c===8){e.preventDefault();stopWatching();}return;}
  poke();
  if([13,37,38,39,40,10009,27,8].indexOf(c)<0)return;e.preventDefault();
  // Flèche maintenue : au plus une case toutes les 90 ms, pour que l'affichage suive.
  if(e.repeat&&c>=37&&c<=40){var now=Date.now();if(now-lastRepeat<90)return;lastRepeat=now;}
  if(c===13){if(hold||held)return;if(focusedEl&&!menu&&section)focusedEl.classList.add('holding');hold=setTimeout(function(){hold=null;held=true;clearHolding();longPress();},HOLD_MS);return;}
  if(c===10009||c===27||c===8)back();else{arrow(c);sampleFrames();}
 });
 document.addEventListener('keyup',function(e){
  if(swallowUp){swallowUp=false;return;}
  if(e.keyCode!==13)return;
  var was=held;clearTimeout(hold);hold=null;held=false;clearHolding();if(!was)activate();
 });
 var lastRepeat=0;
 // Retour visuel de l'appui long : une barre se remplit sur la tuile pendant 0,65 s.
 function clearHolding(){var h=document.querySelectorAll('.holding');for(var i=0;i<h.length;i++)h[i].classList.remove('holding');}
 window.addEventListener('blur',function(){clearTimeout(hold);hold=null;held=false;clearHolding();});

 // ── chargement ──────────────────────────────────────────────────────────
 // Liste des apps gardée en mémoire : au démarrage, l'accueil s'affiche tout de suite
 // avec la dernière liste connue, puis se met à jour quand la TV a répondu.
 var APPS_KEY='flixhome.apps.v1',T_START=Date.now(),bootDiag={},diagBooted={};
 function bootMark(k){if(bootDiag[k]==null){bootDiag[k]=Date.now()-T_START;saveDiag('boot',bootDiag);}}
 function cachedApps(){try{var c=JSON.parse(localStorage.getItem(APPS_KEY));return Array.isArray(c)?c:null;}catch(e){return null;}}
 function storeApps(list){try{localStorage.setItem(APPS_KEY,JSON.stringify(list.map(function(a){return{id:a.id,name:a.name,label:a.label,iconPath:a.iconPath||''};})));}catch(e){}}
 function load(force){
  appsLoadedAt=Date.now();
  if(preview){
   var names=[['YouTube',defaults[0]],['Netflix',defaults[1]],['Prime Video',defaults[2]],['Disney+',defaults[3]],['HBO Max',defaults[4]],['Twitch',defaults[5]],['Internet','org.tizen.browser'],['Spotify','abc0000001.Spotify'],['Plex','abc0000002.Plex'],['Apple TV','abc0000003.AppleTV'],['Crunchyroll','abc0000004.Crunchyroll'],['Galerie','abc0000005.Gallery']];
   installed=names.map(function(n){return{id:n[1],name:n[0],label:n[0],iconPath:''};});
   inputs=window.FLIX_PREVIEW_INPUTS||[{hdmi:1,label:'HDMI 1',connected:true},{hdmi:2,label:'HDMI 2',connected:false},{hdmi:3,label:'HDMI 3',connected:false},{id:'org.tizen.tv-viewer',label:'Télévision'}];
   hasApps=true;renderTiles(true);renderInputs();toolbar();focus();return;
  }
  if(!hasApps){
   var c=cachedApps();
   if(c&&c.length){installed=c;hasApps=true;installedIds='cache';renderTiles(true);focusLastApp();focus();bootMark('firstPaint');}
   else{loadingApps=true;renderTiles(true);focus();}
  }
  var tA=Date.now();
  Apps.getInstalledApps().then(function(list){
   if(!diagBooted.apps){diagBooted.apps=1;bootDiag.apps=Date.now()-tA;}
   loadingApps=false;
   installed=Apps.launchable(list).filter(function(a){return Apps.describe(a).consumer||defaults.indexOf(a.id)>=0;});
   if(appById('org.tizen.netflix-app'))installed=installed.filter(function(a){return a.id!=='RN1MCdNq8t.Netflix';});
   var ids=installed.map(function(a){return a.id+'|'+a.iconPath;}).join(',');
   hasApps=true;
   // Rien de neuf (retour sur l'accueil) : pas de reconstruction, pas de clignotement.
   if(!force&&ids===installedIds&&tilesHash)return;
   var first=!installedIds||installedIds==='cache';installedIds=ids;storeApps(installed);renderTiles(true);
   // Au démarrage, le focus revient sur la dernière app ouverte.
   if(first&&section===1&&index===0)focusLastApp();
   focus();bootMark('firstPaint');
  },function(e){loadingApps=false;renderTiles(true);focus();failure(e);});
  var tS=Date.now();
  Inputs.sources(true).then(function(info){if(!diagBooted.sources){diagBooted.sources=1;bootDiag.sources=Date.now()-tS;saveDiag('boot',bootDiag);}inputs=buildInputs(info);renderInputs();updateHero();},
   function(){inputs=[{id:'org.tizen.SMSourceAPP',label:'Sources Samsung'},{id:'org.tizen.tv-viewer',label:'Télévision'}];renderInputs();});
 }

 if(preview)$('preview').textContent='Aperçu navigateur';
 function scale(){if(preview)$('stage').style.transform='scale('+Math.min(window.innerWidth/1920,window.innerHeight/1080)+')';}
 // Retour sur l'accueil : heure, sources, et apps (nouvelles installations) au plus une fois par minute.
 document.addEventListener('visibilitychange',function(){
  if(document.hidden){
   if(window.FLIX_SWITCH_T&&!window.FLIX_SWITCH_T.left){window.FLIX_SWITCH_T.left=Date.now()-window.FLIX_SWITCH_T.start;saveDiag('switch',window.FLIX_SWITCH_T);}
   clearTimeout(hold);hold=null;held=false;clearTimeout(ambientTimer);if(picked>=0)dropPicked(true);stopWatching(watchHandoff);return;}
  switching(null);if(streamPending)hideStream();if(prefs.lastInput)renderInputs();
  if(ambient)setAmbient(false);else poke();
  clock();refreshInputs(true);weather();
  if(!preview&&Date.now()-appsLoadedAt>60000)load();
 });
 // La TV prévient dès qu'un appareil HDMI s'allume ou s'éteint : la tuile change aussitôt.
 if(!preview){try{tizen.systeminfo.addPropertyValueChangeListener('VIDEOSOURCE',function(){Inputs.invalidate();refreshInputs(true);});}catch(e){}}
 window.addEventListener('resize',scale);
 setInterval(function(){refreshInputs(false);},10000);
 setInterval(function(){weather();},15*60000);
 window.FlixHome={state:function(){return{mode:mode,section:section,index:index,picked:picked,order:prefs.order.slice(),menu:menu&&menu.options.map(function(o){return o.label;})};}};
 scale();appearance();clock();scheduleClock();toolbar();load();poke();
 // La météo attend que l'accueil soit affiché, pour ne pas ralentir le démarrage.
 setTimeout(function(){weather(true);},4000);
}());
