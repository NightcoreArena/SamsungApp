/* Météo via Open-Meteo (gratuit, sans compte ni clé).
 * Position : ville choisie dans les réglages, ou « Auto » d'après l'adresse IP (get.geojs.io).
 * Réponse gardée 30 min (position : 24 h) ; aucune requête quand l'accueil est caché.
 */
(function () {
    'use strict';

    var CACHE = 'flixhome.weather.v1', LOC = 'flixhome.location.v1';
    var MAX_AGE = 30 * 60 * 1000, LOC_AGE = 24 * 3600 * 1000;

    // Codes météo WMO → libellé + icône.
    var CODES = [
        [[0], 'Ensoleillé', 'clear'], [[1], 'Peu nuageux', 'partly'], [[2], 'Éclaircies', 'partly'], [[3], 'Couvert', 'cloud'],
        [[45, 48], 'Brouillard', 'fog'], [[51, 53, 55, 56, 57], 'Bruine', 'rain'], [[61, 63, 66, 80, 81], 'Pluie', 'rain'],
        [[65, 67, 82], 'Forte pluie', 'rain'], [[71, 73, 75, 77, 85, 86], 'Neige', 'snow'], [[95, 96, 99], 'Orage', 'storm']
    ];
    var ICONS = {
        clear: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2m0 14.6v2.2M2.5 12h2.2m14.6 0h2.2M5.3 5.3l1.6 1.6m10.2 10.2 1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
        night: '<path d="M19.5 14.5A7.5 7.5 0 1 1 9.5 4.5a6 6 0 0 0 10 10Z"/>',
        partly: '<path d="M8 4.5v1.3M3.5 9H4.8M4.8 5.8l.9.9M11.2 5.8l-.9.9"/><path d="M5.6 11.2A3 3 0 1 1 10.9 9"/><path d="M8 19h9.5a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6 1.2A3 3 0 0 0 8 19Z"/>',
        cloud: '<path d="M7 18.5h10.5a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.6A3.3 3.3 0 0 0 7 18.5Z"/>',
        fog: '<path d="M4 9h16M3 13h18M5 17h14"/>',
        rain: '<path d="M7 14.5h10.5a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.6A3.3 3.3 0 0 0 7 14.5Z"/><path d="m8 17.5-1 2.5m5-2.5-1 2.5m5-2.5-1 2.5"/>',
        snow: '<path d="M7 14h10.5a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.6A3.3 3.3 0 0 0 7 14Z"/><path d="M8 18h.01M12 20h.01M16 18h.01M10 21.5h.01M14 21.5h.01"/>',
        storm: '<path d="M7 14h10.5a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.6A3.3 3.3 0 0 0 7 14Z"/><path d="m12.5 14-2 3.5h3l-2 3.5"/>'
    };

    var CITIES = [
        ['Paris', 48.857, 2.352], ['Lyon', 45.764, 4.836], ['Marseille', 43.296, 5.37], ['Toulouse', 43.605, 1.444],
        ['Bordeaux', 44.838, -0.579], ['Lille', 50.629, 3.057], ['Nantes', 47.218, -1.554], ['Strasbourg', 48.573, 7.752],
        ['Nice', 43.71, 7.262], ['Rennes', 48.117, -1.678], ['Montpellier', 43.611, 3.877], ['Bruxelles', 50.85, 4.352],
        ['Genève', 46.204, 6.143], ['Montréal', 45.502, -73.567]
    ];

    function read(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }
    function write(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* plein */ } }

    function getJson(url) {
        return Apps.withTimeout(fetch(url, { cache: 'no-store' }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }), 8000, 'Météo');
    }

    function describe(code, isDay) {
        for (var i = 0; i < CODES.length; i++) if (CODES[i][0].indexOf(code) >= 0) {
            var icon = CODES[i][2];
            if (!isDay && icon === 'clear') icon = 'night';
            return { label: !isDay && code === 0 ? 'Ciel dégagé' : CODES[i][1], icon: icon };
        }
        return { label: '', icon: 'cloud' };
    }

    function locate(city) {
        if (city && city !== 'auto') {
            for (var i = 0; i < CITIES.length; i++) if (CITIES[i][0] === city) return Promise.resolve({ lat: CITIES[i][1], lon: CITIES[i][2], name: city });
        }
        var cached = read(LOC);
        if (cached && Date.now() - cached.at < LOC_AGE) return Promise.resolve(cached);
        return getJson('https://get.geojs.io/v1/ip/geo.json').then(function (g) {
            var loc = { lat: Number(g.latitude), lon: Number(g.longitude), name: g.city || g.region || '', at: Date.now() };
            if (!isFinite(loc.lat) || !isFinite(loc.lon)) throw new Error('position inconnue');
            write(LOC, loc);
            return loc;
        });
    }

    // Résout { temp, min, max, label, icon, place } (ou rejette : la météo reste simplement masquée).
    function get(city, force) {
        if (window.FLIX_WEATHER_MOCK) return Promise.resolve(window.FLIX_WEATHER_MOCK);
        var cached = read(CACHE);
        if (!force && cached && cached.city === city && Date.now() - cached.at < MAX_AGE) return Promise.resolve(cached.data);
        return locate(city).then(function (loc) {
            var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + loc.lat.toFixed(3) + '&longitude=' + loc.lon.toFixed(3) +
                '&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1';
            return getJson(url).then(function (r) {
                var c = r.current || {}, d = r.daily || {}, w = describe(c.weather_code, c.is_day !== 0);
                var data = {
                    temp: Math.round(c.temperature_2m), label: w.label, icon: w.icon, place: loc.name || '',
                    min: d.temperature_2m_min ? Math.round(d.temperature_2m_min[0]) : null,
                    max: d.temperature_2m_max ? Math.round(d.temperature_2m_max[0]) : null
                };
                if (!isFinite(data.temp)) throw new Error('réponse météo incomplète');
                write(CACHE, { at: Date.now(), city: city, data: data });
                return data;
            });
        });
    }

    window.Weather = { get: get, icons: ICONS, cities: CITIES.map(function (c) { return c[0]; }) };
})();
