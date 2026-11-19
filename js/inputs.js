/* HDMI inputs via tizen.systeminfo (VIDEOSOURCE), tizen.tvwindow et le lecteur TV Samsung.
 *
 * Ouverture d'une source (méthode « samsung », par défaut), sans attente inutile :
 *   1. on reprend l'objet source déjà connu (Samsung refuse un objet reconstruit à la main),
 *      sans relire la liste auprès de la TV ;
 *   2. on ouvre directement le lecteur TV Samsung (org.tizen.tv-viewer) avec les mêmes
 *      paramètres que son propre menu Sources (change_source / sourceType / mbrIndex) :
 *      une seule bascule, donc une seule resynchronisation HDMI ;
 *   3. s'il refuse, tvwindow.setSource() puis lecteur simple.
 *      C'est alors la TV qui affiche l'appareil, comme si on l'avait choisi dans le menu
 *      Samsung : bandeau de source, Mode Jeu auto (ALLM), type PC/console, VRR…
 *      Si un firmware ignore ces paramètres, le lecteur s'ouvre quand même sur la source
 *      réglée à l'étape 2 : on retombe sur l'ancien comportement, sans blocage.
 * Méthodes de secours, au choix par source : « viewer » (setSource puis lecteur simple)
 * et « switch » (setSource seul). Si tout échoue, le menu des sources Samsung s'ouvre.
 */
(function () {
    'use strict';

    var VIEWER_APP = 'org.tizen.tv-viewer';
    var SOURCE_APP = 'org.tizen.SMSourceAPP';
    var CACHE_MS = 1500;
    // Identifiant de source du lecteur Samsung : HDMI 1 = 13 (relevé sur firmware Samsung),
    // les ports suivants à la suite (HDMI 2 = 14, HDMI 3 = 15, HDMI 4 = 16).
    var HDMI_SOURCE_ID = 12;

    var cache = null, cacheAt = 0, pending = null;

    function call(fn, what) {
        return Apps.withTimeout(new Promise(function (resolve, reject) {
            try { fn(resolve, reject); } catch (e) { reject(e); }
        }), 8000, what);
    }

    function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    // Une seule requête VIDEOSOURCE à la fois, et réponse en cache 1,5 s :
    // l'événement TV, le minuteur et le retour à l'accueil peuvent tomber ensemble.
    function sources(fresh) {
        if (!fresh && cache && Date.now() - cacheAt < CACHE_MS) return Promise.resolve(cache);
        if (pending) return pending;
        pending = call(function (ok, err) {
            tizen.systeminfo.getPropertyValue('VIDEOSOURCE', ok, err);
        }, 'Liste des sources').then(function (info) {
            cache = info; cacheAt = Date.now(); pending = null; return info;
        }, function (e) { pending = null; throw e; });
        return pending;
    }

    function invalidate() { cache = null; }

    function describeSource(s) {
        return s ? s.type + (s.type === 'TV' ? '' : ' ' + s.number) : 'inconnue';
    }

    function current() {
        try { return tizen.tvwindow.getSource('MAIN'); } catch (e) { return null; }
    }

    // { 1: true, 2: false, ... } pour les ports HDMI signalés par la TV.
    function hdmiStatus(info) {
        var status = {};
        (info.disconnected || []).forEach(function (s) { if (s.type === 'HDMI') status[s.number] = false; });
        (info.connected || []).forEach(function (s) { if (s.type === 'HDMI') status[s.number] = true; });
        return status;
    }

    function pick(info, n) {
        var all = (info && (info.connected || []).concat(info.disconnected || [])) || [];
        for (var i = 0; i < all.length; i++) if (all[i].type === 'HDMI' && all[i].number === n) return all[i];
        return null;
    }
    // L'objet source déjà connu suffit (pas de relecture : c'était une attente à chaque clic).
    function findHdmi(n) {
        var known = pick(cache, n);
        if (known) return Promise.resolve(known);
        return sources(true).then(function (info) {
            var src = pick(info, n);
            if (!src) throw new Error('HDMI ' + n + ' n\'est pas signalé par la TV');
            return src;
        });
    }

    function setSource(src) {
        return call(function (ok, err) { tizen.tvwindow.setSource(src, ok, err, 'MAIN'); }, 'Changement de source');
    }

    var FULL = ['0px', '0px', '1920px', '1080px'];
    function show() {
        return call(function (ok, err) { tizen.tvwindow.show(ok, err, FULL, 'MAIN'); }, 'Affichage de la source');
    }
    function hide() {
        return call(function (ok, err) { tizen.tvwindow.hide(ok, err, 'MAIN'); }, 'Masquer la source');
    }

    function openViewer() { return Apps.launch(VIEWER_APP); }
    function openPicker() { return Apps.launch(SOURCE_APP); }

    // Le lecteur TV avec exactement les paramètres de la tuile Source de Samsung (chemin
    // « SourceChangeViaTVViewer », relevé dans le lanceur Vetro) : numéro de source (HDMI 1-4 =
    // 13-16), nom, icône de l'appareil (le lecteur refuse une icône absente), profil d'appareil
    // et demandeur « user ». Sans ces champs, le lecteur bascule par un chemin de repli qui
    // n'applique pas les réglages de l'entrée (Mode Jeu…).
    var ICON_DIR = '/usr/apps/com.samsung.tv.theme-resource/shared/res/org.tizen.menu/Settings_Popup/device_icon/';
    function openNative(n, name) {
        var id = String(HDMI_SOURCE_ID + n);
        var fields = [
            ['change_source', id], ['sourceType', id], ['sourceName', name || 'HDMI ' + n],
            ['sourceIcon', ICON_DIR + 'r_icon_device_s_hdmi' + n + '.png'], ['mbrIndex', '-2']
        ];
        function send(withRequestor) {
            return call(function (ok, err) {
                var data = fields.concat(withRequestor ? [['__K_EX_LAUNCH_REQUESTOR', 'user']] : []).map(function (f) {
                    return new tizen.ApplicationControlData(f[0], [f[1]]);
                });
                var ctrl = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/default', null, null, null, data);
                tizen.application.launchAppControl(ctrl, VIEWER_APP, ok, err);
            }, 'Lecteur TV');
        }
        // Le champ réservé __K_EX_LAUNCH_REQUESTOR peut être refusé à une app web : on réessaie sans.
        return send(true).then(null, function () { return send(false); });
    }

    // Résout 'samsung', 'viewer', 'switch' ou 'picker' (repli sur le menu des sources).
    var busy = false;
    function open(hdmi, method, label) {
        if (busy) return Promise.reject(new Error('Changement de source déjà en cours'));
        busy = true;
        var done = function (v) { busy = false; return v; };
        var fallback = function (err) {
            return openPicker().then(function () { busy = false; return 'picker'; },
                function () { busy = false; throw err; });
        };
        var t0 = Date.now(); window.FLIX_SWITCH_T = { start: t0, method: method };
        // Samsung (natif) : une seule bascule, faite par le lecteur Samsung comme son menu Sources.
        // (Régler d'abord la source nous-mêmes faisait basculer deux fois : deux resynchronisations
        // HDMI, soit deux écrans noirs.) S'il refuse, on règle la source puis on ouvre le lecteur.
        if (method === 'samsung' && window.tizen && tizen.ApplicationControl) {
            return openNative(hdmi, label).then(function () {
                window.FLIX_SWITCH_T.setSource = Date.now() - t0;
                return 'samsung';
            }, function () {
                return findHdmi(hdmi).then(setSource).then(openViewer).then(function () { return 'viewer'; });
            }).then(done, fallback);
        }
        return findHdmi(hdmi).then(function (src) {
            window.FLIX_SWITCH_T.found = Date.now() - t0;
            return setSource(src).then(function () {
                invalidate();
                window.FLIX_SWITCH_T.setSource = Date.now() - t0;
                if (method === 'switch') return 'switch';
                // Instantané : l'image de la source s'affiche dans Flix Home, sans lancer d'autre app.
                if (method === 'inapp') return show().then(function () { return 'inapp'; });
                // Rapide + Mode Jeu : l'image s'affiche tout de suite dans Flix Home, puis le lecteur
                // Samsung passe devant sans rebasculer (image déjà synchronisée, pas d'écran noir).
                // Le lecteur au premier plan rend le Mode Jeu (auto ou manuel) disponible.
                if (method === 'hybrid') {
                    return show().then(null, function () {}).then(function () {
                        if (window.FLIX_ON_SHOW) window.FLIX_ON_SHOW();
                        return openViewer();
                    }).then(function () { return 'hybrid'; });
                }
                return openViewer().then(function () { return 'viewer'; });
            });
        }).then(done, fallback);
    }

    window.Inputs = {
        sources: sources,
        invalidate: invalidate,
        hdmiStatus: hdmiStatus,
        current: current,
        describeSource: describeSource,
        open: open,
        hide: hide,
        show: show,
        openViewer: openViewer,
        openPicker: openPicker,
        openNative: openNative
    };
})();
