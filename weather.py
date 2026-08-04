import requests
from flask import Flask, render_template, request, jsonify

app = Flask(__name__, template_folder='.', static_folder='.', static_url_path='')

@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
    response.headers.add('Access-Control-Allow-Methods', 'GET,OPTIONS')
    return response

# WMO Weather interpretation codes to description and icon
WMO_CODES = {
    0: ("Clear sky", "fa-sun"),
    1: ("Mainly clear", "fa-sun"),
    2: ("Partly cloudy", "fa-cloud-sun"),
    3: ("Overcast", "fa-cloud"),
    45: ("Foggy", "fa-smog"),
    48: ("Depositing rime fog", "fa-smog"),
    51: ("Light drizzle", "fa-cloud-rain"),
    53: ("Moderate drizzle", "fa-cloud-rain"),
    55: ("Dense drizzle", "fa-cloud-showers-heavy"),
    56: ("Freezing drizzle", "fa-cloud-rain"),
    57: ("Dense freezing drizzle", "fa-cloud-showers-heavy"),
    61: ("Slight rain", "fa-cloud-rain"),
    63: ("Moderate rain", "fa-cloud-showers-heavy"),
    65: ("Heavy rain", "fa-cloud-showers-heavy"),
    66: ("Freezing rain", "fa-cloud-rain"),
    67: ("Heavy freezing rain", "fa-cloud-showers-heavy"),
    71: ("Slight snowfall", "fa-snowflake"),
    73: ("Moderate snowfall", "fa-snowflake"),
    75: ("Heavy snowfall", "fa-snowflake"),
    77: ("Snow grains", "fa-snowflake"),
    80: ("Slight rain showers", "fa-cloud-sun-rain"),
    81: ("Moderate rain showers", "fa-cloud-showers-heavy"),
    82: ("Violent rain showers", "fa-cloud-showers-heavy"),
    85: ("Slight snow showers", "fa-snowflake"),
    86: ("Heavy snow showers", "fa-snowflake"),
    95: ("Thunderstorm", "fa-bolt"),
    96: ("Thunderstorm with slight hail", "fa-bolt"),
    99: ("Thunderstorm with heavy hail", "fa-bolt"),
}


def get_weather_description(code):
    """Return (description, icon_class) for a WMO weather code."""
    return WMO_CODES.get(code, ("Unknown", "fa-question"))


def get_aqi_label(aqi):
    """Return label and color class for US AQI value."""
    if aqi is None:
        return "N/A", "aqi-na"
    if aqi <= 50:
        return "Good", "aqi-good"
    elif aqi <= 100:
        return "Moderate", "aqi-moderate"
    elif aqi <= 150:
        return "Unhealthy for Sensitive", "aqi-sensitive"
    elif aqi <= 200:
        return "Unhealthy", "aqi-unhealthy"
    elif aqi <= 300:
        return "Very Unhealthy", "aqi-very-unhealthy"
    else:
        return "Hazardous", "aqi-hazardous"


def fetch_weather_data(latitude, longitude):
    """Fetch weather, hourly, and air quality data."""
    # Weather + Hourly
    weather_url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude={latitude}&longitude={longitude}"
        f"&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation,weather_code"
        f"&hourly=temperature_2m,weather_code"
        f"&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code"
        f"&timezone=auto"
        f"&forecast_hours=24"
    )

    weather_response = requests.get(weather_url)
    if weather_response.status_code != 200:
        return None

    weather_data = weather_response.json()

    # Air Quality
    aqi_url = (
        f"https://air-quality-api.open-meteo.com/v1/air-quality?"
        f"latitude={latitude}&longitude={longitude}"
        f"&current=us_aqi,pm10,pm2_5"
    )
    air_quality = {"us_aqi": None, "pm10": None, "pm2_5": None, "label": "N/A", "class": "aqi-na"}
    try:
        aqi_response = requests.get(aqi_url, timeout=5)
        if aqi_response.status_code == 200:
            aqi_data = aqi_response.json().get("current", {})
            us_aqi = aqi_data.get("us_aqi")
            label, cls = get_aqi_label(us_aqi)
            air_quality = {
                "us_aqi": us_aqi,
                "pm10": aqi_data.get("pm10"),
                "pm2_5": aqi_data.get("pm2_5"),
                "label": label,
                "class": cls
            }
    except Exception:
        pass

    # Extract current weather
    current = weather_data.get("current", {})
    weather_code = current.get("weather_code", 0)
    description, icon = get_weather_description(weather_code)

    # Extract hourly (next 24 hours)
    hourly = weather_data.get("hourly", {})
    hourly_times = hourly.get("time", [])
    hourly_temps = hourly.get("temperature_2m", [])
    hourly_codes = hourly.get("weather_code", [])

    hourly_data = []
    for i in range(len(hourly_times)):
        h_code = hourly_codes[i] if i < len(hourly_codes) else 0
        _, h_icon = get_weather_description(h_code)
        hourly_data.append({
            "time": hourly_times[i],
            "temp": hourly_temps[i] if i < len(hourly_temps) else None,
            "icon": h_icon
        })

    # Extract daily forecast
    daily = weather_data.get("daily", {})
    dates = daily.get("time", [])
    max_temps = daily.get("temperature_2m_max", [])
    min_temps = daily.get("temperature_2m_min", [])
    precipitation_sum = daily.get("precipitation_sum", [])
    daily_weather_codes = daily.get("weather_code", [])

    forecast = []
    for i in range(len(dates)):
        day_code = daily_weather_codes[i] if i < len(daily_weather_codes) else 0
        day_desc, day_icon = get_weather_description(day_code)
        forecast.append({
            "date": dates[i],
            "max_temp": max_temps[i] if i < len(max_temps) else None,
            "min_temp": min_temps[i] if i < len(min_temps) else None,
            "rainfall": precipitation_sum[i] if i < len(precipitation_sum) else None,
            "weather_code": day_code,
            "description": day_desc,
            "icon": day_icon
        })

    return {
        "current": {
            "temperature": current.get("temperature_2m"),
            "humidity": current.get("relative_humidity_2m"),
            "wind_speed": current.get("wind_speed_10m"),
            "rainfall": current.get("precipitation"),
            "expected_rainfall": precipitation_sum[0] if precipitation_sum else 0.0,
            "weather_code": weather_code,
            "description": description,
            "icon": icon
        },
        "air_quality": air_quality,
        "hourly": hourly_data,
        "forecast": forecast
    }


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/search')
def search_cities():
    """Return city suggestions for autocomplete."""
    q = request.args.get('q', '').strip()
    if len(q) < 2:
        return jsonify([])

    geo_url = f"https://geocoding-api.open-meteo.com/v1/search?name={q}&count=6&language=en"
    try:
        geo_response = requests.get(geo_url, timeout=5)
        if geo_response.status_code != 200:
            return jsonify([])

        geo_data = geo_response.json()
        results = geo_data.get("results", [])

        suggestions = []
        for r in results:
            name = r.get("name", "")
            admin1 = r.get("admin1", "")  # State / Province
            country = r.get("country", "")
            # Build "City, State, Country" format
            parts = [name]
            if admin1 and admin1 != name:
                parts.append(admin1)
            if country:
                parts.append(country)
            suggestions.append({
                "display": ", ".join(parts),
                "name": name,
                "admin1": admin1,
                "country": country,
                "latitude": r.get("latitude"),
                "longitude": r.get("longitude")
            })
        return jsonify(suggestions)
    except Exception:
        return jsonify([])


@app.route('/api/weather')
def get_weather():
    # Check if lat/lon are provided (from suggestion click)
    lat = request.args.get('lat')
    lon = request.args.get('lon')
    city_name = request.args.get('city', '')
    admin1 = request.args.get('admin1', '')
    country = request.args.get('country', '')

    if lat and lon:
        try:
            latitude = float(lat)
            longitude = float(lon)
        except ValueError:
            return jsonify({"error": "Invalid coordinates"}), 400

        weather = fetch_weather_data(latitude, longitude)
        if not weather:
            return jsonify({"error": "Failed to fetch weather data"}), 500

        weather["city"] = city_name or "Unknown"
        weather["state"] = admin1
        weather["country"] = country
        return jsonify(weather)

    # Fallback: search by city name
    if not city_name:
        return jsonify({"error": "City name is required"}), 400

    geo_url = f"https://geocoding-api.open-meteo.com/v1/search?name={city_name}&count=5&language=en"
    geo_response = requests.get(geo_url)

    if geo_response.status_code != 200:
        return jsonify({"error": "Failed to connect to geolocation API"}), 500

    geo_data = geo_response.json()

    if "results" not in geo_data or not geo_data["results"]:
        return jsonify({"error": "City not found"}), 404

    result = geo_data["results"][0]
    latitude = result["latitude"]
    longitude = result["longitude"]

    weather = fetch_weather_data(latitude, longitude)
    if not weather:
        return jsonify({"error": "Failed to connect to weather API"}), 500

    weather["city"] = result.get("name", city_name)
    weather["state"] = result.get("admin1", "")
    weather["country"] = result.get("country", "")
    return jsonify(weather)


@app.route('/api/weather/coords')
def get_weather_by_coords():
    """Fetch weather using browser geolocation coordinates."""
    lat = request.args.get('lat')
    lon = request.args.get('lon')

    if not lat or not lon:
        return jsonify({"error": "Latitude and longitude are required"}), 400

    try:
        latitude = float(lat)
        longitude = float(lon)
    except ValueError:
        return jsonify({"error": "Invalid coordinates"}), 400

    # Reverse geocode to get the precise village/town name
    headers = {"User-Agent": "WeatherWiseApp/1.0"}

    city = "Your Location"
    country = ""
    state = ""

    # Keywords that indicate a POI/building name, not a real place name
    BAD_KEYWORDS = [
        "hostel", "hotel", "hospital", "school", "college", "university",
        "temple", "church", "mosque", "station", "office", "shop",
        "restaurant", "cafe", "mall", "plaza", "tower", "building",
        "complex", "society", "apartment", "flat", "house", "road",
        "street", "lane", "nagar", "park", "garden", "factory",
        "institute", "academy", "clinic", "pharmacy"
    ]

    def is_valid_place_name(name):
        """Check if a name looks like a real place (not a POI/building)."""
        if not name:
            return False
        lower = name.lower()
        # Check for bad keywords
        for kw in BAD_KEYWORDS:
            if kw in lower:
                return False
        # Check for too many uppercase letters (POI names like "VNS HOSTEL")
        upper_count = sum(1 for c in name if c.isupper())
        if len(name) > 3 and upper_count > len(name) * 0.6:
            return False
        return True

    try:
        # Single request at zoom=14 (village/town level)
        reverse_url = (
            f"https://nominatim.openstreetmap.org/reverse?"
            f"lat={latitude}&lon={longitude}&format=json&zoom=14"
            f"&addressdetails=1&accept-language=en"
        )
        resp = requests.get(reverse_url, headers=headers, timeout=8)
        if resp.status_code == 200:
            data = resp.json()
            addr = data.get("address", {})
            state = addr.get("state", "")
            country = addr.get("country", "")

            # Try to find the best place name in priority order
            candidates = [
                addr.get("city"),
                addr.get("town"),
                addr.get("village"),
                addr.get("suburb"),
                addr.get("municipality"),
            ]

            # Pick the first valid candidate
            place = None
            for c in candidates:
                if is_valid_place_name(c):
                    place = c
                    break

            if place:
                city = place
            else:
                # All candidates were bad POI names — use county/district
                # Clean "Taluka" suffix from county names (e.g. "Vagodhia Taluka" → "Waghodia")
                county = addr.get("county", "")
                state_dist = addr.get("state_district", "")

                if county:
                    # Remove "Taluka", "Tehsil", "District" suffixes
                    clean_county = county
                    for suffix in [" Taluka", " Tehsil", " Block", " District", " Mandal"]:
                        if clean_county.endswith(suffix):
                            clean_county = clean_county[:-len(suffix)].strip()
                    city = clean_county
                elif state_dist:
                    city = state_dist
                else:
                    city = state or "Your Location"
    except Exception:
        pass

    # If we still have a bad name, try Open-Meteo reverse search as last resort
    if city == "Your Location" or not is_valid_place_name(city):
        try:
            # Search for the nearest known place using Open-Meteo
            from math import radians, cos, sqrt
            nearby_url = (
                f"https://geocoding-api.open-meteo.com/v1/search?"
                f"name={state}&count=10&language=en"
            )
            nearby_resp = requests.get(nearby_url, timeout=5)
            if nearby_resp.status_code == 200:
                nearby_data = nearby_resp.json()
                results = nearby_data.get("results", [])
                # Find the closest result to our coordinates
                best = None
                best_dist = float('inf')
                for r in results:
                    rlat = r.get("latitude", 0)
                    rlon = r.get("longitude", 0)
                    dist = sqrt((latitude - rlat)**2 + (longitude - rlon)**2)
                    if dist < best_dist:
                        best_dist = dist
                        best = r
                if best and best_dist < 1.0:  # Within ~100km
                    city = best.get("name", city)
                    if not state:
                        state = best.get("admin1", "")
                    if not country:
                        country = best.get("country", "")
        except Exception:
            pass

    weather = fetch_weather_data(latitude, longitude)
    if not weather:
        return jsonify({"error": "Failed to fetch weather data"}), 500

    weather["city"] = city
    weather["country"] = country
    weather["state"] = state
    return jsonify(weather)


if __name__ == '__main__':
    import os
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=False)