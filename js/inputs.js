/* HDMI inputs via tizen.systeminfo (VIDEOSOURCE), tizen.tvwindow et le lecteur TV Samsung.
 *
 * Ouverture d'une source (méthode « samsung », par défaut), sans attente inutile :
 *   1. on reprend l'objet source déjà connu (Samsung refuse un objet reconstruit à la main),
 *      sans relire la liste auprès de la TV ;
 *   2. tvwindow.setSource() bascule l'entrée ;
 *   3. aussitôt, on ouvre le lecteur TV Samsung (org.tizen.tv-viewer) avec les mêmes
 *      paramètres que son propre menu Sources (change_source / sourceType / mbrIndex).
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

    function hide() {
        return call(function (ok, err) { tizen.tvwindow.hide(ok, err, 'MAIN'); }, 'Masquer la source');
    }

    function openViewer() { return Apps.launch(VIEWER_APP); }
    function openPicker() { return Apps.launch(SOURCE_APP); }

    // Le lecteur TV avec les paramètres du menu Sources Samsung.
    function openNative(n) {
        return call(function (ok, err) {
            var id = String(HDMI_SOURCE_ID + n);
            var ctrl = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/default', null, null, null, [
                new tizen.ApplicationControlData('change_source', [id]),
                new tizen.ApplicationControlData('sourceType', [id]),
                new tizen.ApplicationControlData('mbrIndex', ['-2'])
            ]);
            tizen.application.launchAppControl(ctrl, VIEWER_APP, ok, err);
        }, 'Lecteur TV');
    }

    // Résout 'samsung', 'viewer', 'switch' ou 'picker' (repli sur le menu des sources).
    var busy = false;
    function open(hdmi, method) {
        if (busy) return Promise.reject(new Error('Changement de source déjà en cours'));
        busy = true;
        var done = function (v) { busy = false; return v; };
        var fallback = function (err) {
            return openPicker().then(function () { busy = false; return 'picker'; },
                function () { busy = false; throw err; });
        };
        return findHdmi(hdmi).then(function (src) {
            var switched = setSource(src).then(function () { invalidate(); return true; },
                function (e) { if (method !== 'samsung') throw e; return false; });
            return switched.then(function () {
                if (method === 'switch') return 'switch';
                if (method === 'viewer') return openViewer().then(function () { return 'viewer'; });
                // Lecteur avec paramètres natifs ; s'il refuse, lecteur simple.
                return openNative(hdmi).then(function () { return 'samsung'; },
                    function () { return openViewer().then(function () { return 'viewer'; }); });
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
        openViewer: openViewer,
        openPicker: openPicker,
        openNative: openNative
    };
})();
