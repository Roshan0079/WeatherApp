document.addEventListener('DOMContentLoaded', () => {

    // ---- WMO Weather Codes (moved from Python backend) ----
    const WMO_CODES = {
        0: ["Clear sky", "fa-sun"],
        1: ["Mainly clear", "fa-sun"],
        2: ["Partly cloudy", "fa-cloud-sun"],
        3: ["Overcast", "fa-cloud"],
        45: ["Foggy", "fa-smog"],
        48: ["Depositing rime fog", "fa-smog"],
        51: ["Light drizzle", "fa-cloud-rain"],
        53: ["Moderate drizzle", "fa-cloud-rain"],
        55: ["Dense drizzle", "fa-cloud-showers-heavy"],
        56: ["Freezing drizzle", "fa-cloud-rain"],
        57: ["Dense freezing drizzle", "fa-cloud-showers-heavy"],
        61: ["Slight rain", "fa-cloud-rain"],
        63: ["Moderate rain", "fa-cloud-showers-heavy"],
        65: ["Heavy rain", "fa-cloud-showers-heavy"],
        66: ["Freezing rain", "fa-cloud-rain"],
        67: ["Heavy freezing rain", "fa-cloud-showers-heavy"],
        71: ["Slight snowfall", "fa-snowflake"],
        73: ["Moderate snowfall", "fa-snowflake"],
        75: ["Heavy snowfall", "fa-snowflake"],
        77: ["Snow grains", "fa-snowflake"],
        80: ["Slight rain showers", "fa-cloud-sun-rain"],
        81: ["Moderate rain showers", "fa-cloud-showers-heavy"],
        82: ["Violent rain showers", "fa-cloud-showers-heavy"],
        85: ["Slight snow showers", "fa-snowflake"],
        86: ["Heavy snow showers", "fa-snowflake"],
        95: ["Thunderstorm", "fa-bolt"],
        96: ["Thunderstorm with slight hail", "fa-bolt"],
        99: ["Thunderstorm with heavy hail", "fa-bolt"],
    };

    function getWeatherDescription(code) {
        return WMO_CODES[code] || ["Unknown", "fa-question"];
    }

    function getAqiLabel(aqi) {
        if (aqi == null) return ["N/A", "aqi-na"];
        if (aqi <= 50) return ["Good", "aqi-good"];
        if (aqi <= 100) return ["Moderate", "aqi-moderate"];
        if (aqi <= 150) return ["Unhealthy for Sensitive", "aqi-sensitive"];
        if (aqi <= 200) return ["Unhealthy", "aqi-unhealthy"];
        if (aqi <= 300) return ["Very Unhealthy", "aqi-very-unhealthy"];
        return ["Hazardous", "aqi-hazardous"];
    }

    // ---- DOM References ----
    const searchToggle = document.getElementById('search-toggle');
    const searchContainer = document.getElementById('search-container');
    const searchForm = document.getElementById('search-form');
    const cityInput = document.getElementById('city-input');
    const suggestionsDropdown = document.getElementById('suggestions-dropdown');
    const loadingOverlay = document.getElementById('loading-overlay');
    const errorOverlay = document.getElementById('error-overlay');
    const errorText = document.getElementById('error-text');
    const currentLocationBtn = document.getElementById('current-location-btn');

    // Main content
    const heroTemp = document.getElementById('hero-temp');
    const heroHigh = document.getElementById('hero-high');
    const heroLow = document.getElementById('hero-low');
    const heroDescLine1 = document.getElementById('hero-desc-line1');
    const heroDescLine2 = document.getElementById('hero-desc-line2');
    const locationText = document.getElementById('location-text');
    const dateText = document.getElementById('date-text');
    const forecastBar = document.getElementById('forecast-bar');
    const recentCards = document.getElementById('recent-cards');
    const hourlyScroll = document.getElementById('hourly-scroll');

    // Sidebar
    const sidebarHumidity = document.getElementById('sidebar-humidity');
    const sidebarWind = document.getElementById('sidebar-wind');
    const sidebarRain = document.getElementById('sidebar-rain');
    const sidebarLocation = document.getElementById('sidebar-location');
    const gaugeArc = document.getElementById('gauge-arc');
    const aqiValue = document.getElementById('aqi-value');
    const aqiBadge = document.getElementById('aqi-badge');
    const aqiPm25 = document.getElementById('aqi-pm25');
    const aqiPm10 = document.getElementById('aqi-pm10');

    // ---- State ----
    let recentSearches = JSON.parse(localStorage.getItem('weatherwise_recent') || '[]');
    const MAX_RECENT = 4;
    let searchDebounce = null;
    let activeSuggestionIdx = -1;

    // ---- Set date ----
    const now = new Date();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    dateText.textContent = `( ${dayNames[now.getDay()]}, ${monthNames[now.getMonth()]} ${now.getDate()} )`;

    // ---- Search Toggle ----
    searchToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        searchContainer.classList.toggle('active');
        if (searchContainer.classList.contains('active')) {
            setTimeout(() => cityInput.focus(), 300);
        } else {
            closeSuggestions();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            searchContainer.classList.remove('active');
            closeSuggestions();
        }
    });

    document.addEventListener('click', (e) => {
        const wrapper = document.getElementById('search-wrapper');
        if (!wrapper.contains(e.target)) {
            searchContainer.classList.remove('active');
            closeSuggestions();
        }
    });

    // ---- Autocomplete Suggestions (Direct API call) ----
    cityInput.addEventListener('input', () => {
        const q = cityInput.value.trim();
        clearTimeout(searchDebounce);

        if (q.length < 2) {
            closeSuggestions();
            return;
        }

        searchDebounce = setTimeout(() => fetchSuggestions(q), 250);
    });

    async function fetchSuggestions(query) {
        try {
            const resp = await fetch(
                `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=en`
            );
            const geoData = await resp.json();
            const results = geoData.results || [];

            if (!results.length) {
                closeSuggestions();
                return;
            }

            // Build suggestions in the same format the UI expects
            const suggestions = results.map(r => {
                const name = r.name || '';
                const admin1 = r.admin1 || '';
                const country = r.country || '';
                const parts = [name];
                if (admin1 && admin1 !== name) parts.push(admin1);
                if (country) parts.push(country);
                return {
                    display: parts.join(', '),
                    name,
                    admin1,
                    country,
                    latitude: r.latitude,
                    longitude: r.longitude
                };
            });

            suggestionsDropdown.innerHTML = '';
            activeSuggestionIdx = -1;

            suggestions.forEach((s, idx) => {
                const item = document.createElement('div');
                item.className = 'suggestion-item';
                item.dataset.index = idx;

                // Highlight the matching part
                const display = s.display;
                const matchIdx = display.toLowerCase().indexOf(query.toLowerCase());
                let html = '';
                if (matchIdx >= 0) {
                    html = display.substring(0, matchIdx) +
                           `<span class="highlight">${display.substring(matchIdx, matchIdx + query.length)}</span>` +
                           display.substring(matchIdx + query.length);
                } else {
                    html = display;
                }

                item.innerHTML = `
                    <i class="fas fa-location-dot"></i>
                    <span class="suggestion-text">${html}</span>
                `;

                item.addEventListener('click', () => selectSuggestion(s));
                item.addEventListener('mouseenter', () => {
                    activeSuggestionIdx = idx;
                    highlightSuggestion();
                });

                suggestionsDropdown.appendChild(item);
            });

            suggestionsDropdown.classList.remove('hidden');
        } catch (err) {
            console.error('Suggestion fetch error:', err);
        }
    }

    // Keyboard navigation for suggestions
    cityInput.addEventListener('keydown', (e) => {
        const items = suggestionsDropdown.querySelectorAll('.suggestion-item');
        if (!items.length || suggestionsDropdown.classList.contains('hidden')) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeSuggestionIdx = Math.min(activeSuggestionIdx + 1, items.length - 1);
            highlightSuggestion();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeSuggestionIdx = Math.max(activeSuggestionIdx - 1, 0);
            highlightSuggestion();
        } else if (e.key === 'Enter' && activeSuggestionIdx >= 0) {
            e.preventDefault();
            const activeItem = items[activeSuggestionIdx];
            if (activeItem) activeItem.click();
        }
    });

    function highlightSuggestion() {
        const items = suggestionsDropdown.querySelectorAll('.suggestion-item');
        items.forEach((item, idx) => {
            item.classList.toggle('active', idx === activeSuggestionIdx);
        });
    }

    function selectSuggestion(suggestion) {
        closeSuggestions();
        searchContainer.classList.remove('active');
        cityInput.value = '';
        fetchWeatherDirect(suggestion.latitude, suggestion.longitude, suggestion.name, suggestion.admin1, suggestion.country);
    }

    function closeSuggestions() {
        suggestionsDropdown.classList.add('hidden');
        suggestionsDropdown.innerHTML = '';
        activeSuggestionIdx = -1;
    }

    // ---- Search Submit (fallback if no suggestion selected) ----
    searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const city = cityInput.value.trim();
        if (!city) return;
        closeSuggestions();
        searchContainer.classList.remove('active');
        cityInput.value = '';
        await fetchWeatherByCity(city);
    });

    currentLocationBtn.addEventListener('click', () => {
        // Always fetch fresh location when user explicitly clicks the button
        requestFreshLocation();
    });

    // ---- Geolocation ----
    function requestFreshLocation() {
        showLoading();
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    const { latitude, longitude } = position.coords;
                    // Cache coordinates so we don't need to ask again
                    localStorage.setItem('weatherwise_coords', JSON.stringify({ lat: latitude, lon: longitude }));
                    await fetchWeatherByCoords(latitude, longitude);
                },
                () => {
                    fetchWeatherByCity('New Delhi');
                },
                { enableHighAccuracy: true, timeout: 8000 }
            );
        } else {
            fetchWeatherByCity('New Delhi');
        }
    }

    function initGeolocation() {
        // Check if we already have cached coordinates from a previous session
        const cached = localStorage.getItem('weatherwise_coords');
        if (cached) {
            try {
                const { lat, lon } = JSON.parse(cached);
                showLoading();
                fetchWeatherByCoords(lat, lon);
                return;
            } catch (e) {
                localStorage.removeItem('weatherwise_coords');
            }
        }
        // First visit — ask for permission
        requestFreshLocation();
    }

    // ---- Core: Fetch weather data directly from Open-Meteo APIs ----
    async function fetchWeatherDataDirect(latitude, longitude) {
        // Fetch weather + hourly + daily
        const weatherUrl =
            `https://api.open-meteo.com/v1/forecast?` +
            `latitude=${latitude}&longitude=${longitude}` +
            `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation,weather_code` +
            `&hourly=temperature_2m,weather_code` +
            `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code` +
            `&timezone=auto&forecast_hours=24`;

        const weatherResp = await fetch(weatherUrl);
        if (!weatherResp.ok) throw new Error('Failed to fetch weather data');
        const weatherData = await weatherResp.json();

        // Fetch air quality
        let airQuality = { us_aqi: null, pm10: null, pm2_5: null, label: 'N/A', class: 'aqi-na' };
        try {
            const aqiUrl =
                `https://air-quality-api.open-meteo.com/v1/air-quality?` +
                `latitude=${latitude}&longitude=${longitude}` +
                `&current=us_aqi,pm10,pm2_5`;
            const aqiResp = await fetch(aqiUrl);
            if (aqiResp.ok) {
                const aqiJson = await aqiResp.json();
                const aqiCurrent = aqiJson.current || {};
                const usAqi = aqiCurrent.us_aqi;
                const [label, cls] = getAqiLabel(usAqi);
                airQuality = {
                    us_aqi: usAqi,
                    pm10: aqiCurrent.pm10 || null,
                    pm2_5: aqiCurrent.pm2_5 || null,
                    label,
                    class: cls
                };
            }
        } catch (e) { /* ignore AQI errors */ }

        // Extract current weather
        const current = weatherData.current || {};
        const weatherCode = current.weather_code || 0;
        const [description, icon] = getWeatherDescription(weatherCode);

        // Extract hourly (next 24 hours)
        const hourly = weatherData.hourly || {};
        const hourlyTimes = hourly.time || [];
        const hourlyTemps = hourly.temperature_2m || [];
        const hourlyCodes = hourly.weather_code || [];

        const hourlyData = hourlyTimes.map((t, i) => {
            const hCode = hourlyCodes[i] || 0;
            const [, hIcon] = getWeatherDescription(hCode);
            return {
                time: t,
                temp: hourlyTemps[i] != null ? hourlyTemps[i] : null,
                icon: hIcon
            };
        });

        // Extract daily forecast
        const daily = weatherData.daily || {};
        const dates = daily.time || [];
        const maxTemps = daily.temperature_2m_max || [];
        const minTemps = daily.temperature_2m_min || [];
        const precipSum = daily.precipitation_sum || [];
        const dailyCodes = daily.weather_code || [];

        const forecast = dates.map((d, i) => {
            const dayCode = dailyCodes[i] || 0;
            const [dayDesc, dayIcon] = getWeatherDescription(dayCode);
            return {
                date: d,
                max_temp: maxTemps[i] != null ? maxTemps[i] : null,
                min_temp: minTemps[i] != null ? minTemps[i] : null,
                rainfall: precipSum[i] != null ? precipSum[i] : null,
                weather_code: dayCode,
                description: dayDesc,
                icon: dayIcon
            };
        });

        return {
            current: {
                temperature: current.temperature_2m,
                humidity: current.relative_humidity_2m,
                wind_speed: current.wind_speed_10m,
                rainfall: current.precipitation,
                expected_rainfall: precipSum[0] || 0.0,
                weather_code: weatherCode,
                description,
                icon
            },
            air_quality: airQuality,
            hourly: hourlyData,
            forecast
        };
    }

    // ---- Reverse geocode using Nominatim ----
    const BAD_KEYWORDS = [
        "hostel", "hotel", "hospital", "school", "college", "university",
        "temple", "church", "mosque", "station", "office", "shop",
        "restaurant", "cafe", "mall", "plaza", "tower", "building",
        "complex", "society", "apartment", "flat", "house", "road",
        "street", "lane", "nagar", "park", "garden", "factory",
        "institute", "academy", "clinic", "pharmacy"
    ];

    function isValidPlaceName(name) {
        if (!name) return false;
        const lower = name.toLowerCase();
        for (const kw of BAD_KEYWORDS) {
            if (lower.includes(kw)) return false;
        }
        const upperCount = [...name].filter(c => c >= 'A' && c <= 'Z').length;
        if (name.length > 3 && upperCount > name.length * 0.6) return false;
        return true;
    }

    async function reverseGeocode(latitude, longitude) {
        let city = 'Your Location';
        let country = '';
        let state = '';

        try {
            const reverseUrl =
                `https://nominatim.openstreetmap.org/reverse?` +
                `lat=${latitude}&lon=${longitude}&format=json&zoom=14` +
                `&addressdetails=1&accept-language=en`;
            const resp = await fetch(reverseUrl, {
                headers: { 'User-Agent': 'WeatherWiseApp/1.0' }
            });
            if (resp.ok) {
                const data = await resp.json();
                const addr = data.address || {};
                state = addr.state || '';
                country = addr.country || '';

                const candidates = [
                    addr.city, addr.town, addr.village, addr.suburb, addr.municipality
                ];

                let place = null;
                for (const c of candidates) {
                    if (isValidPlaceName(c)) { place = c; break; }
                }

                if (place) {
                    city = place;
                } else {
                    const county = addr.county || '';
                    const stateDist = addr.state_district || '';
                    if (county) {
                        let cleanCounty = county;
                        for (const suffix of [' Taluka', ' Tehsil', ' Block', ' District', ' Mandal']) {
                            if (cleanCounty.endsWith(suffix)) {
                                cleanCounty = cleanCounty.slice(0, -suffix.length).trim();
                            }
                        }
                        city = cleanCounty;
                    } else if (stateDist) {
                        city = stateDist;
                    } else {
                        city = state || 'Your Location';
                    }
                }
            }
        } catch (e) { /* ignore */ }

        return { city, state, country };
    }

    // ---- Fetch Functions ----
    async function fetchWeatherDirect(latitude, longitude, cityName, admin1, countryName) {
        showLoading();
        try {
            const weather = await fetchWeatherDataDirect(latitude, longitude);
            weather.city = cityName || 'Unknown';
            weather.state = admin1 || '';
            weather.country = countryName || '';
            updateUI(weather);
            addToRecent(weather);
        } catch (err) {
            showError(err.message || 'Failed to fetch weather data');
        }
    }

    async function fetchWeatherByCity(city) {
        showLoading();
        try {
            // Geocode the city name first
            const geoResp = await fetch(
                `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=5&language=en`
            );
            const geoData = await geoResp.json();
            const results = geoData.results || [];

            if (!results.length) {
                showError('City not found');
                return;
            }

            const result = results[0];
            const weather = await fetchWeatherDataDirect(result.latitude, result.longitude);
            weather.city = result.name || city;
            weather.state = result.admin1 || '';
            weather.country = result.country || '';
            updateUI(weather);
            addToRecent(weather);
        } catch (err) {
            showError(err.message || 'Failed to fetch weather data');
        }
    }

    async function fetchWeatherByCoords(lat, lon) {
        showLoading();
        try {
            // Reverse geocode to get place name
            const location = await reverseGeocode(lat, lon);

            // Fetch weather
            const weather = await fetchWeatherDataDirect(lat, lon);
            weather.city = location.city;
            weather.state = location.state;
            weather.country = location.country;
            updateUI(weather);
        } catch (err) {
            showError(err.message || 'Failed to fetch weather data');
        }
    }

    // ---- Update UI ----
    function updateUI(data) {
        const { city, country, current, forecast, air_quality, hourly } = data;
        const state = data.state || '';

        // Build "City, State, Country" format
        let locationParts = [city];
        if (state && state !== city) locationParts.push(state);
        if (country) locationParts.push(country);
        const fullLocation = locationParts.join(', ');

        locationText.textContent = fullLocation;
        sidebarLocation.textContent = fullLocation;

        // Hero temperature
        heroTemp.textContent = `${Math.round(current.temperature)}°`;

        if (forecast.length > 0) {
            heroHigh.textContent = Math.round(forecast[0].max_temp);
            heroLow.textContent = Math.round(forecast[0].min_temp);
        }

        // Weather description
        const desc = current.description || 'Clear';
        const words = desc.split(' ');
        if (words.length > 2) {
            heroDescLine1.textContent = words.slice(0, Math.ceil(words.length / 2)).join(' ');
            heroDescLine2.textContent = words.slice(Math.ceil(words.length / 2)).join(' ');
        } else {
            heroDescLine1.textContent = desc;
            heroDescLine2.textContent = '';
        }

        // Sidebar details
        sidebarHumidity.textContent = `${current.humidity}%`;
        sidebarWind.textContent = `${current.wind_speed} km/h`;
        sidebarRain.textContent = `${current.expected_rainfall} mm`;
        animateGauge(current.humidity);

        // Air Quality
        if (air_quality) {
            aqiValue.textContent = air_quality.us_aqi !== null ? air_quality.us_aqi : '--';
            aqiBadge.textContent = air_quality.label;
            aqiBadge.className = 'aqi-badge ' + air_quality.class;

            // Color the AQI number
            const colorMap = {
                'aqi-good': '#00e676',
                'aqi-moderate': '#ffd600',
                'aqi-sensitive': '#ff9100',
                'aqi-unhealthy': '#ff1744',
                'aqi-very-unhealthy': '#d500f9',
                'aqi-hazardous': '#ff5252',
                'aqi-na': 'rgba(240,246,252,0.55)'
            };
            aqiValue.style.color = colorMap[air_quality.class] || 'inherit';
            aqiPm25.textContent = air_quality.pm2_5 !== null ? `${air_quality.pm2_5} µg/m³` : '--';
            aqiPm10.textContent = air_quality.pm10 !== null ? `${air_quality.pm10} µg/m³` : '--';
        }

        // Hourly Forecast
        renderHourly(hourly || []);

        // Daily Forecast
        renderForecast(forecast);

        // Recently searched
        renderRecent();

        hideLoading();
    }

    // ---- Gauge Animation ----
    function animateGauge(humidity) {
        const maxDash = 157;
        const offset = maxDash - (humidity / 100) * maxDash;
        gaugeArc.style.transition = 'stroke-dashoffset 1s ease-out';
        gaugeArc.style.strokeDashoffset = offset;
    }

    // ---- Render Hourly ----
    function renderHourly(hourlyData) {
        hourlyScroll.innerHTML = '';

        hourlyData.forEach((h, idx) => {
            const timeObj = new Date(h.time);
            const hour = timeObj.getHours();
            const timeStr = idx === 0 ? 'Now' : `${hour.toString().padStart(2, '0')}:00`;

            const card = document.createElement('div');
            card.className = 'hourly-card' + (idx === 0 ? ' now' : '');
            card.innerHTML = `
                <span class="hc-time">${timeStr}</span>
                <i class="hc-icon fas ${h.icon || 'fa-cloud'}"></i>
                <span class="hc-temp">${Math.round(h.temp)}°</span>
            `;
            hourlyScroll.appendChild(card);
        });
    }

    // ---- Render Forecast ----
    function renderForecast(forecast) {
        forecastBar.innerHTML = '';
        const shortDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        forecast.forEach((day, idx) => {
            const dateObj = new Date(day.date + 'T00:00:00');
            let dayName = shortDays[dateObj.getDay()];
            if (idx === 0) dayName = 'Today';

            const el = document.createElement('div');
            el.className = 'forecast-day' + (idx === 0 ? ' active' : '');
            el.style.opacity = '0';

            const rainInfo = day.rainfall > 0
                ? `<div class="fd-rain"><i class="fas fa-tint"></i>${day.rainfall}mm</div>`
                : '';

            el.innerHTML = `
                <span class="fd-name">${dayName}</span>
                <i class="fd-icon fas ${day.icon || 'fa-cloud'}"></i>
                <span class="fd-temp">${Math.round(day.max_temp)}°</span>
                ${rainInfo}
            `;
            forecastBar.appendChild(el);
        });
    }

    // ---- Recently Searched ----
    function addToRecent(data) {
        const state = data.state || '';
        const exists = recentSearches.findIndex(r => r.city.toLowerCase() === data.city.toLowerCase());
        if (exists !== -1) recentSearches.splice(exists, 1);

        let locationParts = [data.city];
        if (state && state !== data.city) locationParts.push(state);
        if (data.country) locationParts.push(data.country);

        recentSearches.unshift({
            city: data.city,
            country: data.country,
            state: state,
            displayLocation: locationParts.join(', '),
            temp: Math.round(data.current.temperature),
            description: data.current.description,
            icon: data.current.icon
        });

        if (recentSearches.length > MAX_RECENT) {
            recentSearches = recentSearches.slice(0, MAX_RECENT);
        }

        localStorage.setItem('weatherwise_recent', JSON.stringify(recentSearches));
        renderRecent();
    }

    function renderRecent() {
        recentCards.innerHTML = '';
        const section = document.getElementById('recently-searched-section');

        if (recentSearches.length === 0) {
            section.classList.add('hidden');
            return;
        }
        section.classList.remove('hidden');

        const toShow = recentSearches.slice(0, 2);
        toShow.forEach(item => {
            const card = document.createElement('div');
            card.className = 'recent-card';
            card.innerHTML = `
                <i class="rc-icon fas ${item.icon || 'fa-cloud'}"></i>
                <span class="rc-temp">${item.temp}°</span>
                <span class="rc-city">${item.displayLocation || item.city}</span>
                <span class="rc-desc">${item.description || ''}</span>
            `;
            card.addEventListener('click', () => fetchWeatherByCity(item.city));
            recentCards.appendChild(card);
        });
    }

    // ---- Loading / Error helpers ----
    function showLoading() {
        loadingOverlay.classList.remove('hidden');
        errorOverlay.classList.add('hidden');
    }

    function hideLoading() {
        loadingOverlay.classList.add('hidden');
        errorOverlay.classList.add('hidden');
    }

    function showError(msg) {
        loadingOverlay.classList.add('hidden');
        errorText.textContent = msg || 'Something went wrong.';
        errorOverlay.classList.remove('hidden');
    }

    // ---- Kick off ----
    renderRecent();
    initGeolocation();
});
