document.addEventListener('DOMContentLoaded', () => {

    const API_BASE = (window.location.protocol === 'file:' || (window.location.hostname === '127.0.0.1' && window.location.port !== '5000')) 
        ? 'http://127.0.0.1:5000' 
        : '';

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

    // ---- Autocomplete Suggestions ----
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
            const resp = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`);
            const suggestions = await resp.json();

            if (!suggestions.length) {
                closeSuggestions();
                return;
            }

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
            // Get the suggestion data from the DOM
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
        fetchWeatherFromSuggestion(suggestion);
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
                // Invalid cached data, fall through to fresh request
                localStorage.removeItem('weatherwise_coords');
            }
        }
        // First visit — ask for permission
        requestFreshLocation();
    }

    // ---- Retry State ----
    let retryTimer = null;
    const MAX_RETRIES = 3;
    let retryCount = 0;

    function isNetworkError(err) {
        return err instanceof TypeError && (
            err.message.includes('Failed to fetch') ||
            err.message.includes('NetworkError') ||
            err.message.includes('Network request failed')
        );
    }

    function clearRetry() {
        if (retryTimer) {
            clearTimeout(retryTimer);
            retryTimer = null;
        }
        retryCount = 0;
    }

    // ---- Fetch Functions ----
    async function fetchWeatherFromSuggestion(s) {
        showLoading();
        clearRetry();
        try {
            const params = new URLSearchParams({
                lat: s.latitude,
                lon: s.longitude,
                city: s.name,
                admin1: s.admin1 || '',
                country: s.country || ''
            });
            const response = await fetch(`${API_BASE}/api/weather?${params}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to fetch weather');
            updateUI(data);
            addToRecent(data);
        } catch (err) {
            if (isNetworkError(err)) {
                showError('Cannot connect to server. Make sure the backend is running:\n  python weather.py');
                scheduleRetry(() => fetchWeatherFromSuggestion(s));
            } else {
                showError(err.message);
            }
        }
    }

    async function fetchWeatherByCity(city) {
        showLoading();
        clearRetry();
        try {
            const response = await fetch(`${API_BASE}/api/weather?city=${encodeURIComponent(city)}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'City not found');
            updateUI(data);
            addToRecent(data);
        } catch (err) {
            if (isNetworkError(err)) {
                showError('Cannot connect to server. Make sure the backend is running:\n  python weather.py');
                scheduleRetry(() => fetchWeatherByCity(city));
            } else {
                showError(err.message);
            }
        }
    }

    async function fetchWeatherByCoords(lat, lon) {
        showLoading();
        clearRetry();
        try {
            const response = await fetch(`${API_BASE}/api/weather/coords?lat=${lat}&lon=${lon}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to fetch weather');
            updateUI(data);
        } catch (err) {
            if (isNetworkError(err)) {
                showError('Cannot connect to server. Make sure the backend is running:\n  python weather.py');
                scheduleRetry(() => fetchWeatherByCoords(lat, lon));
            } else {
                showError(err.message);
            }
        }
    }

    function scheduleRetry(retryFn) {
        if (retryCount >= MAX_RETRIES) {
            showError('Server is unreachable. Please start the backend:\n  python weather.py\n\nThen refresh this page.');
            return;
        }
        retryCount++;
        retryTimer = setTimeout(() => {
            retryFn();
        }, 5000);
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
        const currentHour = new Date().getHours();

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
