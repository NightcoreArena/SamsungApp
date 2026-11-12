/* HDMI inputs via tizen.systeminfo (VIDEOSOURCE) and tizen.tvwindow.
 *
 * Ouverture d'une source (méthode « viewer », par défaut) :
 *   1. tvwindow.setSource() bascule l'entrée de la TV ;
 *   2. courte pause, le temps que la TV prenne la source ;
 *   3. lancement du lecteur TV natif de Samsung (org.tizen.tv-viewer).
 * C'est la TV elle-même qui affiche alors l'appareil : ses réglages par entrée
 * (Mode Jeu auto / ALLM, type d'appareil PC ou console, Input Signal Plus, VRR)
 * s'appliquent comme si l'on avait choisi la source dans le menu Samsung.
 * Si une étape échoue, on ouvre le sélecteur de sources Samsung : l'utilisateur
 * n'est jamais bloqué.
 */
(function () {
    'use strict';

    var VIEWER_APP = 'org.tizen.tv-viewer';
    var SOURCE_APP = 'org.tizen.SMSourceAPP';
    var SETTLE_MS = 300;
    var CACHE_MS = 1500;

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

    function findHdmi(n) {
        return sources(true).then(function (info) {
            var all = (info.connected || []).concat(info.disconnected || []);
            for (var i = 0; i < all.length; i++) if (all[i].type === 'HDMI' && all[i].number === n) return all[i];
            throw new Error('HDMI ' + n + ' n\'est pas signalé par la TV');
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

    // Résout 'viewer' (lecteur TV natif), 'switch' (source changée seulement) ou 'picker' (repli).
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
            return setSource(src).then(function () {
                invalidate();
                if (method === 'switch') return 'switch';
                return delay(SETTLE_MS).then(openViewer).then(function () { return 'viewer'; });
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
        openPicker: openPicker
    };
})();
